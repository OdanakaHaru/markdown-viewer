use std::path::{Path, PathBuf};
use crate::models::ResolvedLink;
use crate::utils::{is_markdown_extension, normalize_path, urlencoding_decode};

#[tauri::command]
pub fn resolve_link_target(
    base_file_path: Option<String>,
    base_folder_path: Option<String>,
    href: String,
) -> ResolvedLink {
    let trimmed = href.trim();
    if trimmed.is_empty() {
        return ResolvedLink {
            kind: "unknown".to_string(),
            target: href,
            hash: None,
        };
    }

    // 1. 外部Webプロトコル
    let lower = trimmed.to_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("ftp://")
    {
        return ResolvedLink {
            kind: "url".to_string(),
            target: trimmed.to_string(),
            hash: None,
        };
    }

    // 2. ドキュメント内アンカーリンク (#見出し)
    if trimmed.starts_with('#') {
        let hash = trimmed.trim_start_matches('#').to_string();
        return ResolvedLink {
            kind: "anchor".to_string(),
            target: trimmed.to_string(),
            hash: Some(hash),
        };
    }

    // 3. ローカルファイルまたは相対パス (末尾の #hash を分離)
    let (path_part, hash_part) = match trimmed.split_once('#') {
        Some((p, h)) => (p, Some(h.to_string())),
        None => (trimmed, None),
    };

    // file:// スキームの除去
    let clean_path = if let Some(stripped) = path_part.strip_prefix("file:///") {
        stripped
    } else if let Some(stripped) = path_part.strip_prefix("file://") {
        stripped
    } else {
        path_part
    };

    let decoded_path = urlencoding_decode(clean_path);

    // Windowsドライブレター (例: C:\ や C:/) または完全な絶対パス判定
    let is_absolute = {
        let p = Path::new(&decoded_path);
        let bytes = decoded_path.as_bytes();
        p.is_absolute() || (
            bytes.len() >= 2
            && bytes[1] == b':'
            && bytes[0].is_ascii_alphabetic()
        )
    };

    let candidate_path = if is_absolute {
        normalize_path(Path::new(&decoded_path))
    } else {
        // 先頭が '/' または '\' の場合（プロジェクトルート相対等）
        let is_root_slash = decoded_path.starts_with('/') || decoded_path.starts_with('\\');
        let rel_trimmed = decoded_path.trim_start_matches(|c| c == '/' || c == '\\');

        let clean_base_file = base_file_path.as_ref().filter(|s| !s.trim().is_empty());
        let clean_base_folder = base_folder_path.as_ref().filter(|s| !s.trim().is_empty());

        let base_dir = if is_root_slash {
            clean_base_folder.map(PathBuf::from).or_else(|| {
                clean_base_file.and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
            })
        } else {
            clean_base_file.and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf())).or_else(|| {
                clean_base_folder.map(PathBuf::from)
            })
        };

        if let Some(base) = base_dir {
            normalize_path(&base.join(rel_trimmed))
        } else {
            normalize_path(Path::new(rel_trimmed))
        }
    };

    // パスの存在チェック（.md 拡張子の補完チェックも含む）
    let final_path = if candidate_path.exists() {
        Some(candidate_path.clone())
    } else {
        let with_md = candidate_path.with_extension("md");
        if with_md.exists() {
            Some(with_md)
        } else {
            None
        }
    };

    if let Some(found_path) = final_path {
        let path_str = found_path.to_string_lossy().into_owned();
        let is_md = is_markdown_extension(&found_path);
        ResolvedLink {
            kind: if is_md { "markdown" } else { "file" }.to_string(),
            target: path_str,
            hash: hash_part,
        }
    } else {
        let candidate_str = candidate_path.to_string_lossy().into_owned();
        let is_md = is_markdown_extension(&candidate_path);
        ResolvedLink {
            kind: if is_md { "markdown_not_found" } else { "not_found" }.to_string(),
            target: candidate_str,
            hash: hash_part,
        }
    }
}

#[tauri::command]
pub fn open_external(target: String) -> Result<(), String> {
    open::that_detached(&target).map_err(|e| format!("外部アプリケーションの起動に失敗しました: {}", e))
}
