use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::commands::diff::compare_markdown_text;
use crate::diff::DiffResult;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct GitStatusInfo {
    pub is_git_available: bool,
    pub is_repo: bool,
    pub has_head: bool,
    pub is_tracked: bool,
    pub relative_path: Option<String>,
    pub repo_root: Option<String>,
    pub branch: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct GitCommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub relative_date: String,
    pub date: String,
    pub summary: String,
}

/// Windowsでコンソールウィンドウを表示させずにCommandを生成する
fn create_git_command() -> Command {
    let mut cmd = Command::new("git");
    cmd.arg("-c").arg("core.quotepath=false");
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Git CLIがシステム上で利用可能かを確認する
pub fn is_git_available() -> bool {
    let mut cmd = create_git_command();
    cmd.arg("--version");
    match cmd.output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

/// ファイルの親ディレクトリからGitリポジトリのルートパスを特定する
fn find_repo_root(file_path: &Path) -> Result<PathBuf, String> {
    let start_dir = if file_path.is_dir() {
        file_path
    } else {
        file_path.parent().ok_or_else(|| "親ディレクトリを取得できませんでした".to_string())?
    };

    let mut cmd = create_git_command();
    cmd.arg("rev-parse")
        .arg("--show-toplevel")
        .current_dir(start_dir);

    let output = cmd.output().map_err(|e| format!("Gitコマンドの実行に失敗しました: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Gitリポジトリが見つかりません: {}", err.trim()));
    }

    let root_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if root_str.is_empty() {
        return Err("リポジトリのルートパスが空です".to_string());
    }

    Ok(PathBuf::from(root_str))
}

/// Gitリポジトリ内での相対パス（スラッシュ区切り）を特定する
fn get_git_relative_path(repo_root: &Path, file_path: &Path) -> Result<String, String> {
    // 1. まず標準的なパス計算（日本語パスや記号パスがGitによりエスケープされるのを防ぐ）
    let norm_root = repo_root.to_string_lossy().replace('\\', "/");
    let norm_root_clean = norm_root.trim_end_matches('/');
    let norm_file = file_path.to_string_lossy().replace('\\', "/");

    if norm_file.to_lowercase().starts_with(&norm_root_clean.to_lowercase()) {
        let rel = norm_file[norm_root_clean.len()..].trim_start_matches('/');
        if !rel.is_empty() {
            return Ok(rel.to_string());
        }
    }

    // 2. Windows等のUNCプレフィックス (\\?\C:\...) 対応
    let clean_root_str = norm_root_clean.trim_start_matches("//?/").trim_start_matches("/?/");
    let clean_file_str = norm_file.trim_start_matches("//?/").trim_start_matches("/?/");
    if clean_file_str.to_lowercase().starts_with(&clean_root_str.to_lowercase()) {
        let rel = clean_file_str[clean_root_str.len()..].trim_start_matches('/');
        if !rel.is_empty() {
            return Ok(rel.to_string());
        }
    }

    // 3. git ls-files --full-name によるフォールバック
    let parent_dir = if file_path.is_dir() {
        file_path
    } else {
        file_path.parent().unwrap_or(repo_root)
    };

    let mut cmd = create_git_command();
    cmd.arg("ls-files")
        .arg("--full-name")
        .arg(file_path)
        .current_dir(parent_dir);

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let rel = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let unquoted = rel.trim_matches('"').trim();
            if !unquoted.is_empty() {
                return Ok(unquoted.replace('\\', "/"));
            }
        }
    }

    Err("ファイルは指定されたGitリポジトリ内にありません".to_string())
}


/// 指定ファイルのGitステータスを取得する
#[tauri::command]
pub fn check_git_status(file_path: String) -> Result<GitStatusInfo, String> {
    if !is_git_available() {
        return Ok(GitStatusInfo {
            is_git_available: false,
            is_repo: false,
            has_head: false,
            is_tracked: false,
            relative_path: None,
            repo_root: None,
            branch: None,
        });
    }

    let path = Path::new(&file_path);
    let repo_root = match find_repo_root(path) {
        Ok(root) => root,
        Err(_) => {
            return Ok(GitStatusInfo {
                is_git_available: true,
                is_repo: false,
                has_head: false,
                is_tracked: false,
                relative_path: None,
                repo_root: None,
                branch: None,
            });
        }
    };

    let rel_path = get_git_relative_path(&repo_root, path).ok();

    // HEADが存在するか確認
    let mut head_cmd = create_git_command();
    head_cmd.arg("rev-parse")
        .arg("--verify")
        .arg("HEAD")
        .current_dir(&repo_root);
    let has_head = head_cmd.output().map(|o| o.status.success()).unwrap_or(false);

    // 現在のブランチ名を取得
    let mut branch_cmd = create_git_command();
    branch_cmd.arg("branch")
        .arg("--show-current")
        .current_dir(&repo_root);
    let branch = branch_cmd.output().ok().and_then(|o| {
        if o.status.success() {
            let b = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if b.is_empty() { None } else { Some(b) }
        } else {
            None
        }
    });

    // ファイルがGit追跡対象か確認
    let mut tracked_cmd = create_git_command();
    tracked_cmd.arg("ls-files")
        .arg("--error-unmatch")
        .arg(path)
        .current_dir(&repo_root);
    let is_tracked = tracked_cmd.output().map(|o| o.status.success()).unwrap_or(false);

    Ok(GitStatusInfo {
        is_git_available: true,
        is_repo: true,
        has_head,
        is_tracked,
        relative_path: rel_path,
        repo_root: Some(repo_root.to_string_lossy().into_owned()),
        branch,
    })
}

/// Git上の特定リビジョンからファイル内容を取得する
pub fn get_git_file_content(file_path: &str, revision: &str) -> Result<String, String> {
    if !is_git_available() {
        return Err("Git CLIがシステムに見つかりません。Gitがインストールされており、環境変数PATHが通っていることを確認してください。".to_string());
    }

    let path = Path::new(file_path);
    let repo_root = find_repo_root(path)?;
    let relative_path = get_git_relative_path(&repo_root, path)?;

    let spec = format!("{}:{}", revision, relative_path);

    let mut cmd = create_git_command();
    cmd.arg("show")
        .arg(&spec)
        .current_dir(&repo_root);

    let output = cmd.output().map_err(|e| format!("Gitの実行に失敗しました: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        let trimmed_err = err_msg.trim();
        if trimmed_err.contains("does not exist in") || trimmed_err.contains("exists on disk, but not in") {
            return Err(format!(
                "リビジョン '{}' にファイル '{}' が存在しません（新規追加または未追跡のファイルです）",
                revision, relative_path
            ));
        }
        return Err(format!("Gitからのファイル取得に失敗しました: {}", trimmed_err));
    }

    String::from_utf8(output.stdout)
        .map_err(|_| "ファイル内容をUTF-8文字列としてデコードできませんでした".to_string())
}

/// 最新コミット（または指定リビジョン）とローカル作業ツリーのMarkdownファイルを差分比較する
#[tauri::command]
pub fn compare_git_markdown(file_path: String, revision: Option<String>) -> Result<DiffResult, String> {
    let rev = revision.unwrap_or_else(|| "HEAD".to_string());
    let git_text = get_git_file_content(&file_path, &rev)?;
    let local_text = fs::read_to_string(&file_path)
        .map_err(|e| format!("ローカル作業ファイルの読み込みに失敗しました ({}): {}", file_path, e))?;

    compare_markdown_text(git_text, local_text)
}

/// 指定ファイルが変更された過去のコミット履歴一覧を取得する
#[tauri::command]
pub fn get_git_commit_history(file_path: String, max_count: Option<u32>) -> Result<Vec<GitCommitInfo>, String> {
    if !is_git_available() {
        return Err("Git CLIが利用できません".to_string());
    }

    let path = Path::new(&file_path);
    let repo_root = find_repo_root(path)?;
    let relative_path = get_git_relative_path(&repo_root, path)?;

    let limit = max_count.unwrap_or(50);
    let mut cmd = create_git_command();
    cmd.arg("log")
        .arg(format!("-n{}", limit))
        .arg("--format=%H\x1f%h\x1f%an\x1f%ar\x1f%ad\x1f%s")
        .arg("--date=format:%Y-%m-%d %H:%M")
        .arg("--")
        .arg(&relative_path)
        .current_dir(&repo_root);

    let output = cmd.output().map_err(|e| format!("Gitの実行に失敗しました: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("コミット履歴の取得に失敗しました: {}", err.trim()));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout_str.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split('\x1f').collect();
        if parts.len() >= 6 {
            commits.push(GitCommitInfo {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                relative_date: parts[3].to_string(),
                date: parts[4].to_string(),
                summary: parts[5..].join(" "),
            });
        }
    }

    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_git_available() {
        // 通常の開発環境ではgitが利用可能
        let available = is_git_available();
        println!("Git available: {}", available);
    }

    #[test]
    fn test_check_git_status_current_repo() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let readme_path = Path::new(manifest_dir).parent().unwrap().join("README.md");
        let readme_str = readme_path.to_string_lossy().into_owned();

        if is_git_available() {
            let status = check_git_status(readme_str).expect("status check should succeed");
            assert!(status.is_git_available);
            assert!(status.is_repo);
            assert!(status.has_head);
            assert!(status.is_tracked);
            assert_eq!(status.relative_path.as_deref(), Some("README.md"));
        }
    }

    #[test]
    fn test_get_git_file_content_readme() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let readme_path = Path::new(manifest_dir).parent().unwrap().join("README.md");
        let readme_str = readme_path.to_string_lossy().into_owned();

        if is_git_available() {
            let content = get_git_file_content(&readme_str, "HEAD");
            assert!(content.is_ok());
            let text = content.unwrap();
            assert!(text.contains("Markdown") || text.contains("FeatherMark"));
        }
    }

    #[test]
    fn test_compare_git_markdown_readme() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let readme_path = Path::new(manifest_dir).parent().unwrap().join("README.md");
        let readme_str = readme_path.to_string_lossy().into_owned();

        if is_git_available() {
            let diff = compare_git_markdown(readme_str, Some("HEAD".to_string()));
            assert!(diff.is_ok());
        }
    }

    #[test]
    fn test_git_untracked_file_error() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let nonexistent_path = Path::new(manifest_dir).parent().unwrap().join("completely_nonexistent_file_xyz.md");
        let nonexistent_str = nonexistent_path.to_string_lossy().into_owned();

        if is_git_available() {
            let res = get_git_file_content(&nonexistent_str, "HEAD");
            assert!(res.is_err());
            let err = res.unwrap_err();
            assert!(err.contains("存在しません") || err.contains("見つかりません"));
        }
    }

    #[test]
    fn test_get_git_commit_history_readme() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let readme_path = Path::new(manifest_dir).parent().unwrap().join("README.md");
        let readme_str = readme_path.to_string_lossy().into_owned();

        if is_git_available() {
            let history = get_git_commit_history(readme_str, Some(10));
            assert!(history.is_ok());
            let commits = history.unwrap();
            assert!(!commits.is_empty());
            assert_eq!(commits[0].short_hash.len(), 7);
        }
    }

    #[test]
    fn test_get_git_relative_path_japanese() {
        let root = Path::new("C:/Users/test/project");
        let file = Path::new("C:\\Users\\test\\project\\20_画面設計書_md\\版_仕様書.md");
        let rel = get_git_relative_path(root, file).unwrap();
        assert_eq!(rel, "20_画面設計書_md/版_仕様書.md");
    }
}

