//! Runs the Claude Code CLI the person is already signed into.
//!
//! There is no API key anywhere in this app. Research is one non-interactive
//! `claude -p` turn whose only tools are WebSearch and WebFetch, so the child can
//! read the web and nothing else: no shell, no file access, no MCP servers, no
//! hooks. It runs in an empty scratch directory for the same reason.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct Running(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

#[derive(Serialize)]
pub struct AiStatus {
    installed: bool,
    logged_in: Option<bool>,
    account: Option<String>,
    path: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    job: String,
    kind: String,
    text: String,
}

/// A GUI app on macOS does not inherit the terminal's PATH, so `claude` installed
/// by npm, Homebrew or the native installer is usually invisible to it. Ask a
/// login shell where it is, then fall back to the usual places.
fn find_claude() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    if let Ok(out) = Command::new(&shell).args(["-lic", "command -v claude"]).output() {
        let found = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = found.lines().rev().find(|l| l.starts_with('/')) {
            return Some(line.trim().to_string());
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    [
        format!("{home}/.claude/local/claude"),
        format!("{home}/.local/bin/claude"),
        "/opt/homebrew/bin/claude".into(),
        "/usr/local/bin/claude".into(),
    ]
    .into_iter()
    .find(|p| std::path::Path::new(p).exists())
}

/// The child needs node and friends on PATH too, so give it the login shell's.
fn login_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = Command::new(shell).args(["-lic", "echo __PATH__$PATH"]).output().ok()?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find_map(|l| l.strip_prefix("__PATH__").map(str::to_string))
}

#[tauri::command]
pub fn ai_status() -> AiStatus {
    let Some(path) = find_claude() else {
        return AiStatus { installed: false, logged_in: None, account: None, path: None };
    };
    let mut cmd = Command::new(&path);
    cmd.args(["auth", "status"]);
    if let Some(p) = login_path() {
        cmd.env("PATH", p);
    }
    let (logged_in, account) = match cmd.output() {
        Ok(out) => match serde_json::from_slice::<Value>(&out.stdout) {
            Ok(v) => (
                v.get("loggedIn").and_then(Value::as_bool),
                v.get("email")
                    .or_else(|| v.get("account"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ),
            Err(_) => (None, None),
        },
        Err(_) => (None, None),
    };
    AiStatus { installed: true, logged_in, account, path: Some(path) }
}

/// One research turn. Emits `ai://progress` as searches happen and resolves with
/// the schema-shaped object the CLI returns in `structured_output`.
#[tauri::command]
pub async fn ai_run(
    app: AppHandle,
    running: State<'_, Running>,
    job: String,
    prompt: String,
    schema: String,
    model: Option<String>,
    max_turns: Option<u32>,
) -> Result<Value, String> {
    let path = find_claude().ok_or("Claude Code isn't installed on this Mac.")?;
    let scratch = std::env::temp_dir().join("my-roadmaps-ai");
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&path);
    cmd.current_dir(&scratch)
        .args(["-p", "--output-format", "stream-json", "--verbose"])
        // The whole safety story: these two tools and nothing else.
        .args(["--tools", "WebSearch,WebFetch"])
        .args(["--allowed-tools", "WebSearch,WebFetch"])
        .args(["--max-turns", &max_turns.unwrap_or(40).to_string()])
        .args(["--settings", r#"{"disableAllHooks":true}"#])
        .args(["--strict-mcp-config", "--mcp-config", r#"{"mcpServers":{}}"#])
        .arg("--no-session-persistence")
        .args(["--json-schema", &schema])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(m) = model.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        cmd.args(["--model", m]);
    }
    if let Some(p) = login_path() {
        cmd.env("PATH", p);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start Claude Code: {e}"))?;
    // The prompt goes in on stdin, never on the command line.
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes()).map_err(|e| e.to_string())?;
    }
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let child = Arc::new(Mutex::new(child));
    running.0.lock().unwrap().insert(job.clone(), child.clone());

    let job_for_thread = job.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let mut result: Option<Value> = None;
        let mut failure: Option<String> = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(ev) = serde_json::from_str::<Value>(&line) else { continue };
            match ev.get("type").and_then(Value::as_str) {
                Some("assistant") => {
                    let blocks = ev.pointer("/message/content").and_then(Value::as_array);
                    for b in blocks.into_iter().flatten() {
                        if b.get("type").and_then(Value::as_str) != Some("tool_use") {
                            continue;
                        }
                        let name = b.get("name").and_then(Value::as_str).unwrap_or("");
                        let (kind, text) = match name {
                            "WebSearch" => ("search", b.pointer("/input/query")),
                            "WebFetch" => ("read", b.pointer("/input/url")),
                            _ => continue,
                        };
                        let _ = app.emit(
                            "ai://progress",
                            Progress {
                                job: job_for_thread.clone(),
                                kind: kind.into(),
                                text: text.and_then(Value::as_str).unwrap_or("").into(),
                            },
                        );
                    }
                }
                Some("result") => {
                    if ev.get("is_error").and_then(Value::as_bool) == Some(true) {
                        failure = Some(
                            ev.get("result")
                                .and_then(Value::as_str)
                                .unwrap_or("Claude Code reported an error.")
                                .to_string(),
                        );
                    } else {
                        result = ev.get("structured_output").cloned().filter(|v| !v.is_null());
                        if result.is_none() {
                            failure = Some(match ev.get("subtype").and_then(Value::as_str) {
                                Some("error_max_turns") => {
                                    "The research ran out of steps before finishing. Try again, or narrow the goal.".into()
                                }
                                _ => "Claude finished without returning a roadmap.".into(),
                            });
                        }
                    }
                }
                _ => {}
            }
        }
        let err_text: String = BufReader::new(stderr)
            .lines()
            .map_while(Result::ok)
            .collect::<Vec<_>>()
            .join("\n");
        (result, failure, err_text)
    })
    .await
    .map_err(|e| e.to_string())?;

    let cancelled = running.0.lock().unwrap().remove(&job).is_none();
    let _ = child.lock().unwrap().wait();

    let (result, failure, err_text) = outcome;
    if cancelled {
        return Err("cancelled".into());
    }
    match (result, failure) {
        (Some(v), _) => Ok(v),
        (None, Some(f)) => Err(f),
        (None, None) => Err(if err_text.trim().is_empty() {
            "Claude Code exited without a result. Is it signed in? Run `claude` in a terminal to check.".into()
        } else {
            err_text.chars().take(600).collect()
        }),
    }
}

#[tauri::command]
pub fn ai_cancel(running: State<'_, Running>, job: String) {
    if let Some(child) = running.0.lock().unwrap().remove(&job) {
        let _ = child.lock().unwrap().kill();
    }
}
