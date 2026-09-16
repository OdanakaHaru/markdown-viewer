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

/// 指定した外部アプリケーション（VS Code、メモ帳、既定のアプリ、カスタムアプリ）でファイルまたはフォルダを開く
#[tauri::command]
pub fn open_in_app(
    path: String,
    app_type: String,
    custom_path: Option<String>,
) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("指定されたパスが見つかりません: {}", path));
    }

    match app_type.as_str() {
        "vscode" => open_with_vscode(&path),
        "notepad" => open_with_notepad(&path),
        "default" => open::that_detached(&path)
            .map_err(|e| format!("既定のアプリケーションの起動に失敗しました: {}", e)),
        "custom" => {
            if let Some(exe) = custom_path.filter(|s| !s.trim().is_empty()) {
                let mut cmd = std::process::Command::new(&exe);
                cmd.arg(&path);
                cmd.spawn()
                    .map(|_| ())
                    .map_err(|e| format!("カスタムエディタの起動に失敗しました ({}): {}", exe, e))
            } else {
                Err("カスタムエディタの実行パスが設定されていません".to_string())
            }
        }
        unknown => Err(format!("不明なアプリケーション指定です: {}", unknown)),
    }
}

/// OSのエクスプローラー／ファイルマネージャーで対象ファイルまたはフォルダを表示する
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("指定されたパスが見つかりません: {}", path));
    }

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer");
        if target.is_dir() {
            cmd.arg(&path);
        } else {
            // ファイルの場合は選択状態で開く
            cmd.arg(format!("/select,{}", path));
        }
        cmd.spawn()
            .map(|_| ())
            .map_err(|e| format!("エクスプローラーの起動に失敗しました: {}", e))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Finder の起動に失敗しました: {}", e))
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let folder = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(target)
        };
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("ファイルマネージャーの起動に失敗しました: {}", e))
    }
}

fn open_with_vscode(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::path::PathBuf;
        let mut candidate_paths: Vec<PathBuf> = Vec::new();

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidate_paths.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Microsoft VS Code")
                    .join("Code.exe"),
            );
        }
        if let Ok(prog_files) = std::env::var("ProgramFiles") {
            candidate_paths.push(
                PathBuf::from(prog_files)
                    .join("Microsoft VS Code")
                    .join("Code.exe"),
            );
        }
        if let Ok(prog_files_x86) = std::env::var("ProgramFiles(x86)") {
            candidate_paths.push(
                PathBuf::from(prog_files_x86)
                    .join("Microsoft VS Code")
                    .join("Code.exe"),
            );
        }

        for exe in candidate_paths {
            if exe.exists() {
                return std::process::Command::new(exe)
                    .arg(path)
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| format!("VS Code の起動に失敗しました: {}", e));
            }
        }

        // 直接の Code.exe が見当たらない場合、PATH の code (code.cmd) を起動
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let status = std::process::Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/c", "code", path])
            .spawn();

        match status {
            Ok(_) => Ok(()),
            Err(e) => Err(format!(
                "VS Code の起動に失敗しました。VS Code がインストールされ、PATH に登録されていることを確認してください: {}",
                e
            )),
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: open -a "Visual Studio Code" または code
        let mac_res = std::process::Command::new("open")
            .args(["-a", "Visual Studio Code", path])
            .spawn();
        if mac_res.is_ok() {
            return Ok(());
        }
        std::process::Command::new("code")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("VS Code の起動に失敗しました: {}", e))
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        std::process::Command::new("code")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("VS Code の起動に失敗しました: {}", e))
    }
}

fn open_with_notepad(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("notepad.exe")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("メモ帳の起動に失敗しました: {}", e))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "TextEdit", path])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("TextEdit の起動に失敗しました: {}", e))
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        // Linux: gedit や xdg-open フォールバック
        let gedit_res = std::process::Command::new("gedit").arg(path).spawn();
        if gedit_res.is_ok() {
            return Ok(());
        }
        open::that_detached(path).map_err(|e| format!("エディタの起動に失敗しました: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_in_app_errors() {
        // 存在しないパス
        let res_nonexistent = open_in_app(
            "C:\\nonexistent_file_123456789.md".to_string(),
            "vscode".to_string(),
            None,
        );
        assert!(res_nonexistent.is_err());
        assert!(res_nonexistent.unwrap_err().contains("見つかりません"));

        // 存在するテンポラリファイルを作成
        let temp_dir = std::env::temp_dir().join(format!(
            "md_viewer_open_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test.md");
        fs::write(&test_file, "# Test").unwrap();
        let path_str = test_file.to_string_lossy().into_owned();

        // 不明なアプリケーション種別
        let res_unknown = open_in_app(path_str.clone(), "unknown_app".to_string(), None);
        assert!(res_unknown.is_err());
        assert!(res_unknown.unwrap_err().contains("不明なアプリケーション"));

        // カスタムエディタでパスが空の場合
        let res_empty_custom = open_in_app(path_str, "custom".to_string(), Some("".to_string()));
        assert!(res_empty_custom.is_err());
        assert!(res_empty_custom.unwrap_err().contains("設定されていません"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_reveal_in_explorer_nonexistent() {
        let res = reveal_in_explorer("C:\\nonexistent_dir_123456789".to_string());
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("見つかりません"));
    }
}

