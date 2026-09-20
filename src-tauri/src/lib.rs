mod ai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ai::Running::default())
        .setup(|_app| {
            ai::warm_up();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ai::ai_status, ai::ai_run, ai::ai_cancel])
        .run(tauri::generate_context!())
        .expect("error while running my-roadmaps");
}
