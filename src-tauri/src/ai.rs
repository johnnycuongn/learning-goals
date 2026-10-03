//! Runs the AI CLI the person is already signed into: Claude Code or Codex.
//!
//! There is no API key anywhere in this app, and no server of ours in between.
//! Each job is one non-interactive CLI turn that may read the web and do nothing
//! else: no shell, no file access, no MCP servers, no hooks. It runs in an empty
//! scratch directory for the same reason, and the prompt goes in on stdin.

use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct Running(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

#[derive(Serialize)]
pub struct CliStatus {
    installed: bool,
    logged_in: Option<bool>,
    account: Option<String>,
    path: Option<String>,
}

#[derive(Serialize)]
pub struct AiStatus {
    claude: CliStatus,
    codex: CliStatus,
}

#[derive(Serialize, Clone)]
struct Progress {
    job: String,
    kind: String,
    text: String,
}

#[derive(Clone, Copy, PartialEq)]
enum Provider {
    Claude,
    Codex,
}

impl Provider {
    fn parse(s: Option<&str>) -> Self {
        if s == Some("codex") { Provider::Codex } else { Provider::Claude }
    }
    fn name(self) -> &'static str {
        match self {
            Provider::Claude => "Claude Code",
            Provider::Codex => "Codex",
        }
    }
    fn signin_hint(self) -> &'static str {
        match self {
            Provider::Claude => "Run `claude` in a terminal to check it is signed in.",
            Provider::Codex => "Run `codex login` in a terminal to check it is signed in.",
        }
    }
}

/// Where each CLI lives, and the PATH they need to run.
struct Env {
    claude: Option<String>,
    codex: Option<String>,
    path: Option<String>,
}

/// A GUI app on macOS does not inherit the terminal's PATH, so a CLI installed by
/// npm, Homebrew or a native installer is usually invisible to it. A login shell
/// knows, but starting one loads the person's whole shell profile and takes a
/// second or more. So it is asked once, for every answer, and remembered.
fn env() -> &'static Env {
    static ENV: OnceLock<Env> = OnceLock::new();
    ENV.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let (mut claude, mut codex, mut path) = (None, None, None);
        if let Ok(out) = Command::new(&shell)
            .args([
                "-lic",
                "echo __PATH__$PATH; echo __CLAUDE__$(command -v claude); echo __CODEX__$(command -v codex)",
            ])
            .output()
        {
            let abs = |s: &str| Some(s.trim().to_string()).filter(|s| s.starts_with('/'));
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                if let Some(p) = line.strip_prefix("__PATH__") {
                    path = Some(p.to_string());
                } else if let Some(c) = line.strip_prefix("__CLAUDE__") {
                    claude = abs(c);
                } else if let Some(c) = line.strip_prefix("__CODEX__") {
                    codex = abs(c);
                }
            }
        }
        let home = std::env::var("HOME").unwrap_or_default();
        let first = |candidates: Vec<String>| candidates.into_iter().find(|p| std::path::Path::new(p).exists());
        if claude.is_none() {
            claude = first(vec![
                format!("{home}/.claude/local/claude"),
                format!("{home}/.local/bin/claude"),
                "/opt/homebrew/bin/claude".into(),
                "/usr/local/bin/claude".into(),
            ]);
        }
        if codex.is_none() {
            codex = first(vec![
                format!("{home}/.local/bin/codex"),
                "/opt/homebrew/bin/codex".into(),
                "/usr/local/bin/codex".into(),
            ]);
        }
        Env { claude, codex, path }
    })
}

/// Pay for the login shell at launch, in the background, so no screen waits on it.
pub fn warm_up() {
    std::thread::spawn(|| {
        env();
    });
}

fn find(p: Provider) -> Option<String> {
    match p {
        Provider::Claude => env().claude.clone(),
        Provider::Codex => env().codex.clone(),
    }
}

fn command(bin: &str) -> Command {
    let mut cmd = Command::new(bin);
    if let Some(p) = env().path.clone() {
        cmd.env("PATH", p);
    }
    cmd
}

fn claude_status() -> CliStatus {
    let Some(path) = find(Provider::Claude) else {
        return CliStatus { installed: false, logged_in: None, account: None, path: None };
    };
    let (logged_in, account) = match command(&path).args(["auth", "status"]).output() {
        Ok(out) => match serde_json::from_slice::<Value>(&out.stdout) {
            Ok(v) => (
                v.get("loggedIn").and_then(Value::as_bool),
                v.get("email").or_else(|| v.get("account")).and_then(Value::as_str).map(str::to_string),
            ),
            Err(_) => (None, None),
        },
        Err(_) => (None, None),
    };
    CliStatus { installed: true, logged_in, account, path: Some(path) }
}

/// `codex login status` exits 0 and prints how it is signed in ("Logged in
/// using ChatGPT"), or exits non-zero with "Not logged in".
fn codex_status() -> CliStatus {
    let Some(path) = find(Provider::Codex) else {
        return CliStatus { installed: false, logged_in: None, account: None, path: None };
    };
    let (logged_in, account) = match command(&path).args(["login", "status"]).output() {
        Ok(out) => {
            let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
            let line = text.lines().map(str::trim).find(|l| l.starts_with("Logged in")).map(str::to_string);
            (Some(out.status.success()), line)
        }
        Err(_) => (None, None),
    };
    CliStatus { installed: true, logged_in, account, path: Some(path) }
}

/// Async on purpose. A plain `fn` command runs on the main thread, and this one
/// starts processes: as a sync command it froze the whole window while it waited.
#[tauri::command]
pub async fn ai_status() -> Result<AiStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let codex = std::thread::spawn(codex_status);
        let claude = claude_status();
        AiStatus { claude, codex: codex.join().unwrap_or(CliStatus { installed: false, logged_in: None, account: None, path: None }) }
    })
    .await
    .map_err(|e| e.to_string())
}

/// What one stream line meant, whichever CLI wrote it.
#[derive(Default)]
struct Outcome {
    result: Option<Value>,
    failure: Option<String>,
    last_error: Option<String>,
}

fn claude_line(ev: &Value, out: &mut Outcome, emit: &dyn Fn(&str, &str)) {
    match ev.get("type").and_then(Value::as_str) {
        Some("assistant") => {
            let blocks = ev.pointer("/message/content").and_then(Value::as_array);
            for b in blocks.into_iter().flatten() {
                if b.get("type").and_then(Value::as_str) != Some("tool_use") {
                    continue;
                }
                match b.get("name").and_then(Value::as_str) {
                    Some("WebSearch") => emit("search", b.pointer("/input/query").and_then(Value::as_str).unwrap_or("")),
                    Some("WebFetch") => emit("read", b.pointer("/input/url").and_then(Value::as_str).unwrap_or("")),
                    _ => {}
                }
            }
        }
        Some("result") => {
            if ev.get("is_error").and_then(Value::as_bool) == Some(true) {
                out.failure = Some(ev.get("result").and_then(Value::as_str).unwrap_or("Claude Code reported an error.").to_string());
            } else {
                out.result = ev.get("structured_output").cloned().filter(|v| !v.is_null());
                if out.result.is_none() {
                    out.failure = Some(match ev.get("subtype").and_then(Value::as_str) {
                        Some("error_max_turns") => "The research ran out of steps before finishing. Try again, or narrow the goal.".into(),
                        _ => "Claude finished without returning a result.".into(),
                    });
                }
            }
        }
        _ => {}
    }
}

/// `codex exec --json` events: item.started / item.completed carry web searches
/// and the final agent message, which with --output-schema is the JSON answer.
fn codex_line(ev: &Value, out: &mut Outcome, seen: &mut HashSet<String>, emit: &dyn Fn(&str, &str)) {
    match ev.get("type").and_then(Value::as_str) {
        Some("item.started") | Some("item.completed") => {
            let Some(item) = ev.get("item") else { return };
            let id = item.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            match item.get("type").and_then(Value::as_str) {
                Some("web_search") => {
                    let action = item.get("action");
                    let url = action.and_then(|a| a.get("url")).and_then(Value::as_str);
                    let query = item
                        .get("query")
                        .and_then(Value::as_str)
                        .filter(|q| !q.is_empty())
                        .or_else(|| action.and_then(|a| a.get("query")).and_then(Value::as_str));
                    let (kind, text) = match (url, query) {
                        (Some(u), _) if !u.is_empty() => ("read", u),
                        (_, Some(q)) if !q.is_empty() => ("search", q),
                        _ => return,
                    };
                    if seen.insert(id) {
                        emit(kind, text);
                    }
                }
                Some("agent_message") if ev.get("type").and_then(Value::as_str) == Some("item.completed") => {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        match serde_json::from_str::<Value>(text.trim()) {
                            Ok(v) if v.is_object() => out.result = Some(v),
                            _ => out.last_error = Some("Codex answered, but not in the expected format.".into()),
                        }
                    }
                }
                _ => {}
            }
        }
        Some("turn.failed") => {
            out.failure = Some(
                ev.pointer("/error/message").and_then(Value::as_str).unwrap_or("Codex reported an error.").to_string(),
            );
        }
        // Mostly "Reconnecting..." notices; kept only in case nothing better arrives.
        Some("error") => out.last_error = ev.get("message").and_then(Value::as_str).map(str::to_string),
        _ => {}
    }
}

/// One AI turn. Emits `ai://progress` as searches happen and resolves with the
/// schema-shaped object the CLI returns.
#[tauri::command]
pub async fn ai_run(
    app: AppHandle,
    running: State<'_, Running>,
    job: String,
    prompt: String,
    schema: String,
    provider: Option<String>,
    model: Option<String>,
    max_turns: Option<u32>,
    web: Option<bool>,
) -> Result<Value, String> {
    let provider = Provider::parse(provider.as_deref());
    let path = tauri::async_runtime::spawn_blocking(move || find(provider))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("{} isn't installed on this Mac.", provider.name()))?;
    let scratch = std::env::temp_dir().join("learning-goals-ai");
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let web = web.unwrap_or(true);
    let model = model.as_deref().map(str::trim).filter(|m| !m.is_empty()).map(str::to_string);

    let mut cmd = command(&path);
    cmd.current_dir(&scratch).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut schema_file: Option<std::path::PathBuf> = None;

    match provider {
        Provider::Claude => {
            // The whole safety story: web reading for research, and for anything
            // else (the weekly briefing) no tools at all.
            let tools = if web { "WebSearch,WebFetch" } else { "" };
            cmd.args(["-p", "--output-format", "stream-json", "--verbose"])
                .args(["--tools", tools])
                .args(["--allowed-tools", tools])
                .args(["--max-turns", &max_turns.unwrap_or(40).to_string()])
                .args(["--settings", r#"{"disableAllHooks":true}"#])
                .args(["--strict-mcp-config", "--mcp-config", r#"{"mcpServers":{}}"#])
                .arg("--no-session-persistence")
                .args(["--json-schema", &schema]);
            if let Some(m) = &model {
                cmd.args(["--model", m]);
            }
        }
        Provider::Codex => {
            // Codex takes its schema as a file. Its shell tool is switched off and
            // the sandbox is read-only; user config (MCP servers, hooks, plugins)
            // is not loaded. Web search is a top-level flag, before `exec`.
            let file = scratch.join(format!("{}.schema.json", job.replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "_")));
            std::fs::write(&file, &schema).map_err(|e| e.to_string())?;
            if web {
                cmd.arg("--search");
            }
            cmd.arg("exec")
                .args(["--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules"])
                .args(["--sandbox", "read-only"])
                .args(["--disable", "shell_tool"])
                .arg("--output-schema")
                .arg(&file);
            if let Some(m) = &model {
                cmd.args(["--model", m]);
            }
            cmd.arg("-");
            schema_file = Some(file);
        }
    }

    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start {}: {e}", provider.name()))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes()).map_err(|e| e.to_string())?;
    } // stdin drops here, so the CLI sees end of input
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let child = Arc::new(Mutex::new(child));
    running.0.lock().unwrap().insert(job.clone(), child.clone());

    let job_for_thread = job.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let emit = |kind: &str, text: &str| {
            let _ = app.emit("ai://progress", Progress { job: job_for_thread.clone(), kind: kind.into(), text: text.into() });
        };
        // Drain stderr on its own thread so a chatty CLI can't fill the pipe and stall.
        let err_reader = std::thread::spawn(move || {
            BufReader::new(stderr).lines().map_while(Result::ok).collect::<Vec<_>>().join("\n")
        });
        let mut out = Outcome::default();
        let mut seen = HashSet::new();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(ev) = serde_json::from_str::<Value>(&line) else { continue };
            match provider {
                Provider::Claude => claude_line(&ev, &mut out, &emit),
                Provider::Codex => codex_line(&ev, &mut out, &mut seen, &emit),
            }
        }
        (out, err_reader.join().unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string());

    let cancelled = running.0.lock().unwrap().remove(&job).is_none();
    let _ = child.lock().unwrap().wait();
    if let Some(f) = schema_file {
        let _ = std::fs::remove_file(f);
    }
    let (out, err_text) = result?;
    if cancelled {
        return Err("cancelled".into());
    }
    if let Some(v) = out.result {
        return Ok(v);
    }
    if let Some(f) = out.failure.or(out.last_error) {
        return Err(f);
    }
    Err(if err_text.trim().is_empty() {
        format!("{} exited without a result. {}", provider.name(), provider.signin_hint())
    } else {
        err_text.chars().rev().take(600).collect::<Vec<_>>().into_iter().rev().collect()
    })
}

#[tauri::command]
pub fn ai_cancel(running: State<'_, Running>, job: String) {
    if let Some(child) = running.0.lock().unwrap().remove(&job) {
        let _ = child.lock().unwrap().kill();
    }
}
