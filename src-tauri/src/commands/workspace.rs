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

#[cfg(test)]
mod tests {
    use super::*;

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

