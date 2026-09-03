use std::cmp::Ordering;
use std::fs;
use std::path::Path;
use crate::models::FileEntry;
use crate::markdown::parse_markdown_to_html;
use crate::utils::is_markdown_extension;

#[tauri::command]
pub fn open_md_file() -> Result<(String, String), String> {
    let file = rfd::FileDialog::new()
        .set_title("Markdownファイルを選択")
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "mdx"])
        .pick_file();

    if let Some(path) = file {
        match fs::read_to_string(&path) {
            Ok(content) => {
                let html = parse_markdown_to_html(&content);
                Ok((path.to_string_lossy().into_owned(), html))
            }
            Err(e) => Err(e.to_string()),
        }
    } else {
        Err("No file selected".to_string())
    }
}

#[tauri::command]
pub fn open_folder() -> Result<String, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Markdownドキュメントが含まれる親フォルダーを選択")
        .pick_folder();
    if let Some(path) = folder {
        Ok(path.to_string_lossy().into_owned())
    } else {
        Err("No folder selected".to_string())
    }
}

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err("指定されたパスはディレクトリではありません".to_string());
    }

    let read_dir = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().into_owned();
        // 隠しファイル/一般的な除外フォルダの簡易フィルタリング
        if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" || file_name == "dist" {
            continue;
        }

        let entry_path = entry.path();
        let is_dir = entry_path.is_dir();
        let is_markdown = !is_dir && is_markdown_extension(&entry_path);

        entries.push(FileEntry {
            name: file_name,
            path: entry_path.to_string_lossy().into_owned(),
            is_dir,
            is_markdown,
        });
    }

    // ディレクトリを先頭に、名前順（大文字小文字無視）でソート
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_md_file(path: String) -> Result<(String, String), String> {
    match fs::read_to_string(&path) {
        Ok(content) => {
            let html = parse_markdown_to_html(&content);
            Ok((path, html))
        }
        Err(e) => Err(e.to_string()),
    }
}
