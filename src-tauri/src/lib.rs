pub mod commands;
pub mod highlight;
pub mod markdown;
pub mod models;
pub mod utils;
pub mod watcher;

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
            commands::link::resolve_link_target,
            commands::link::open_external,
            commands::image::read_image_data_url,
            commands::markdown::parse_markdown,
            commands::watcher::watch_active_files,
            commands::workspace::list_workspace_markdown_files
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

#[cfg(test)]
mod tests {
    use std::fs;
    use crate::commands::image::read_image_data_url;
    use crate::commands::link::resolve_link_target;
    use crate::commands::workspace::list_workspace_markdown_files;
    use crate::markdown::parse_markdown_to_html;
    use crate::utils::urlencoding_decode;

    #[test]
    fn test_urlencoding_decode_japanese() {
        let encoded = "%E3%80%90%E7%94%BB%E9%9D%A2%E8%A8%AD%E8%A8%88%E6%9B%B8%E3%80%91%20%E7%AE%A1%E7%90%86%E8%80%85_%E4%BA%88%E7%B4%84%E7%85%A7%E4%BC%9A.md";
        let decoded = urlencoding_decode(encoded);
        assert_eq!(decoded, "【画面設計書】 管理者_予約照会.md");
    }

    #[test]
    fn test_urlencoding_decode_ascii_and_symbols() {
        let encoded = "folder%20name/sub%2Bdir/file-1.md";
        let decoded = urlencoding_decode(encoded);
        assert_eq!(decoded, "folder name/sub+dir/file-1.md");
    }

    #[test]
    fn test_resolve_link_target_relative() {
        let base_file = Some("C:\\Users\\test\\Docs\\intro.md".to_string());
        let res = resolve_link_target(
            base_file,
            None,
            "%E3%80%90%E7%94%BB%E9%9D%A2%E8%A8%AD%E8%A8%88%E6%9B%B8%E3%80%91.md".to_string(),
        );
        assert_eq!(res.kind, "markdown_not_found");
        assert!(res.target.contains("【画面設計書】.md"));
        assert!(!res.target.contains("ç®¡"));
    }

    #[test]
    fn test_read_image_data_url_with_fallback() {
        let temp_dir = std::env::temp_dir().join(format!(
            "md_viewer_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let images_dir = temp_dir.join("images");
        fs::create_dir_all(&images_dir).unwrap();

        let md_file = temp_dir.join("doc.md");
        fs::write(&md_file, "# Test").unwrap();

        // 1x1 透明PNGデータ
        let dummy_png = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let img_path = images_dir.join("sample.png");
        fs::write(&img_path, dummy_png).unwrap();

        // 1. images/sample.png での直接探索
        let res1 = read_image_data_url(
            Some(md_file.to_string_lossy().into_owned()),
            None,
            "images/sample.png".to_string(),
        );
        assert!(res1.is_ok());
        assert!(res1.unwrap().starts_with("data:image/png;base64,"));

        // 2. sample.png のみ指定でも images/ 配下のフォールバックで発見できること
        let res2 = read_image_data_url(
            Some(md_file.to_string_lossy().into_owned()),
            None,
            "sample.png".to_string(),
        );
        assert!(res2.is_ok());
        assert!(res2.unwrap().starts_with("data:image/png;base64,"));

        // クリーンアップ
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_image_data_url_patterns() {
        let temp_dir = std::env::temp_dir().join(format!(
            "md_viewer_img_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let images_dir = temp_dir.join("images");
        fs::create_dir_all(&images_dir).unwrap();

        let md_file = temp_dir.join("doc.md");
        fs::write(&md_file, "# Test").unwrap();

        let dummy_png = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let img_path = images_dir.join("sample.png");
        fs::write(&img_path, dummy_png).unwrap();

        // 1. 絶対パス
        let abs_path = img_path.to_string_lossy().into_owned();
        let res_abs = read_image_data_url(None, None, abs_path.clone());
        assert!(res_abs.is_ok(), "絶対パスでの読み込み失敗: {:?}", res_abs.err());

        // 2. file:/// スキーム
        let file_url = format!("file:///{}", abs_path.replace('\\', "/"));
        let res_file_url = read_image_data_url(None, None, file_url);
        assert!(res_file_url.is_ok(), "file:/// での読み込み失敗: {:?}", res_file_url.err());

        // 3. バックスラッシュ相対パス
        let res_backslash = read_image_data_url(
            Some(md_file.to_string_lossy().into_owned()),
            None,
            "images\\sample.png".to_string(),
        );
        assert!(
            res_backslash.is_ok(),
            "バックスラッシュ相対パスでの読み込み失敗: {:?}",
            res_backslash.err()
        );

        // 4. ./ 相対パス
        let res_dot_slash = read_image_data_url(
            Some(md_file.to_string_lossy().into_owned()),
            None,
            "./images/sample.png".to_string(),
        );
        assert!(
            res_dot_slash.is_ok(),
            "./相対パスでの読み込み失敗: {:?}",
            res_dot_slash.err()
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_parse_markdown_syntax_highlight() {
        let md = "```rust\nfn main() {\n    let x = 42;\n}\n```";
        let html = parse_markdown_to_html(md);
        assert!(html.contains("code-block-container"));
        assert!(html.contains("language-rust"));
        assert!(html.contains("source rust"));
        assert!(html.contains("code-block-copy-btn"));
    }

    #[test]
    fn test_list_workspace_markdown_files() {
        let temp_dir = std::env::temp_dir().join(format!(
            "md_viewer_ws_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let sub_dir = temp_dir.join("sub");
        fs::create_dir_all(&sub_dir).unwrap();

        let f1 = temp_dir.join("root.md");
        let f2 = sub_dir.join("child.markdown");
        let f3 = temp_dir.join("skip.txt");

        fs::write(&f1, "# Root").unwrap();
        fs::write(&f2, "# Child").unwrap();
        fs::write(&f3, "Text").unwrap();

        let files = list_workspace_markdown_files(temp_dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(files.len(), 2);
        // 相対パス順でソートされている
        assert_eq!(files[0].name, "root.md");
        assert_eq!(files[1].name, "child.markdown");
        assert_eq!(files[1].relative_path, "sub/child.markdown");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
