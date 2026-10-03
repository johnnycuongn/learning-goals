//! Attachments live as plain files in the app's data folder, next to the
//! database: `<data>/files/<item id>/<random>-<name>`. The frontend only ever
//! names a path relative to that folder, and every command checks it stays
//! inside, so no call can read or delete anything else on the Mac.

use std::path::{Component, Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// `files/<item>/<name>` and nothing else: no absolute paths, no `..`.
fn resolve(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    let ok = p.components().all(|c| matches!(c, Component::Normal(_)))
        && p.starts_with("files")
        && p.components().count() == 3;
    if !ok {
        return Err("That file path isn't one of this app's attachments.".into());
    }
    Ok(data_dir(app)?.join(p))
}

fn header(req: &Request<'_>, name: &str) -> Result<String, String> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| format!("missing {name}"))
}

/// The bytes arrive as the raw request body, so a 10 MB PDF is not turned into
/// a 40 MB JSON array on the way.
#[tauri::command]
pub fn file_save(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected file bytes".into());
    };
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("Files are limited to 50 MB.".into());
    }
    let path = resolve(&app, &header(&request, "x-path")?)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Opens an attachment in its default app (Preview, Pages, and so on).
#[tauri::command]
pub fn file_open(app: AppHandle, path: String) -> Result<(), String> {
    let full = resolve(&app, &path)?;
    if !full.exists() {
        return Err("That file is missing from the data folder.".into());
    }
    app.opener()
        .open_path(full.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_delete(app: AppHandle, path: String) -> Result<(), String> {
    let full = resolve(&app, &path)?;
    match std::fs::remove_file(&full) {
        Ok(()) => {
            if let Some(dir) = full.parent() {
                let _ = std::fs::remove_dir(dir); // only succeeds once it is empty
            }
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Where everything lives, for the Settings page and for backups.
#[tauri::command]
pub fn data_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().into_owned())
}

/// Shows the data folder in Finder.
#[tauri::command]
pub fn data_dir_reveal(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
