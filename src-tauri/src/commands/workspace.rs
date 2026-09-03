use std::fs;
use std::path::Path;
use crate::models::QuickOpenFileItem;
use crate::utils::is_markdown_extension;

#[tauri::command]
pub fn list_workspace_markdown_files(path: String) -> Result<Vec<QuickOpenFileItem>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err("指定されたパスはディレクトリではありません".to_string());
    }

    let mut result = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(current_dir) = stack.pop() {
        let entries = match fs::read_dir(&current_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            // 一般的な隠しフォルダや依存関係・ビルド成果物をスキップ
            if file_name.starts_with('.')
                || file_name == "node_modules"
                || file_name == "target"
                || file_name == "dist"
                || file_name == "build"
            {
                continue;
            }

            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
            } else if is_markdown_extension(&entry_path) {
                let relative = entry_path
                    .strip_prefix(root)
                    .unwrap_or(&entry_path)
                    .to_string_lossy()
                    .replace('\\', "/");

                result.push(QuickOpenFileItem {
                    name: file_name,
                    path: entry_path.to_string_lossy().into_owned(),
                    relative_path: relative,
                });
            }
        }
    }

    // 相対パスのアルファベット順にソート
    result.sort_by(|a, b| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()));
    Ok(result)
}
