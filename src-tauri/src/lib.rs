mod ai;
mod files;

use tauri_plugin_sql::{Migration, MigrationKind};

/// The database file, relative to the app's data folder
/// (~/Library/Application Support/com.johnnynguyen.learninggoals on a Mac).
pub const DB_URL: &str = "sqlite:learning-goals.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "roadmap chats",
            sql: include_str!("../migrations/0002_roadmap_chats.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .manage(ai::Running::default())
        .setup(|_app| {
            ai::warm_up();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::ai_status,
            ai::ai_run,
            ai::ai_cancel,
            files::file_save,
            files::file_open,
            files::file_delete,
            files::data_dir_path,
            files::data_dir_reveal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Learning Goals");
}
