pub mod commands;
pub mod highlight;
pub mod markdown;
pub mod models;
pub mod utils;
pub mod watcher;
pub mod diff;

use watcher::FileWatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(FileWatcherState::new())
        .invoke_handler(tauri::generate_handler![
            commands::file::open_md_file,
            commands::file::open_folder,
            commands::file::read_directory,
            commands::file::read_md_file,
            commands::file::open_in_app,
            commands::file::reveal_in_explorer,
            commands::link::resolve_link_target,
            commands::link::open_external,
            commands::image::read_image_data_url,
            commands::markdown::parse_markdown,
            commands::watcher::watch_active_files,
            commands::workspace::list_workspace_markdown_files,
            commands::diff::compare_markdown_files,
            commands::diff::compare_markdown_text
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

