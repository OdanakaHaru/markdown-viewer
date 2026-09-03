use std::fs;
use std::path::{Path, PathBuf};
use crate::utils::{normalize_path, urlencoding_decode};

pub fn get_image_mime_type(path: &Path) -> &'static str {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        match ext.to_lowercase().as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "ico" => "image/x-icon",
            "avif" => "image/avif",
            "tif" | "tiff" => "image/tiff",
            _ => "application/octet-stream",
        }
    } else {
        "application/octet-stream"
    }
}

pub fn base64_encode(data: &[u8]) -> String {
    use base64::prelude::*;
    BASE64_STANDARD.encode(data)
}

#[tauri::command]
pub fn read_image_data_url(
    base_file_path: Option<String>,
    base_folder_path: Option<String>,
    src: String,
) -> Result<String, String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return Err("画像パスが空です".to_string());
    }

    let lower = trimmed.to_lowercase();
    if lower.starts_with("data:")
        || lower.starts_with("http://")
        || lower.starts_with("https://")
    {
        return Ok(trimmed.to_string());
    }

    // クエリパラメータ (?...) や ハッシュ (#...) の除去
    let path_without_hash = trimmed.split('#').next().unwrap_or(trimmed);
    let clean_src = path_without_hash.split('?').next().unwrap_or(path_without_hash);

    // file:// スキームの除去
    let raw_path = if let Some(stripped) = clean_src.strip_prefix("file:///") {
        stripped
    } else if let Some(stripped) = clean_src.strip_prefix("file://") {
        stripped
    } else {
        clean_src
    };

    let decoded_path = urlencoding_decode(raw_path);

    // 絶対パス判定 (Windows ドライブレター対応)
    let is_absolute = {
        let p = Path::new(&decoded_path);
        let bytes = decoded_path.as_bytes();
        p.is_absolute()
            || (bytes.len() >= 2
                && bytes[1] == b':'
                && bytes[0].is_ascii_alphabetic())
    };

    let clean_base_file = base_file_path.filter(|s| !s.trim().is_empty());
    let clean_base_folder = base_folder_path.filter(|s| !s.trim().is_empty());

    let candidate_path = if is_absolute {
        normalize_path(Path::new(&decoded_path))
    } else {
        let is_root_slash = decoded_path.starts_with('/') || decoded_path.starts_with('\\');
        let rel_trimmed = decoded_path.trim_start_matches(|c| c == '/' || c == '\\');

        let base_dir = if is_root_slash {
            clean_base_folder.as_ref().map(PathBuf::from).or_else(|| {
                clean_base_file
                    .as_ref()
                    .and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
            })
        } else {
            clean_base_file
                .as_ref()
                .and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
                .or_else(|| clean_base_folder.as_ref().map(PathBuf::from))
        };

        if let Some(base) = base_dir {
            normalize_path(&base.join(rel_trimmed))
        } else {
            normalize_path(Path::new(rel_trimmed))
        }
    };

    // 画像ファイルの解決（直接指定 -> フォールバック候補順に探索）
    let final_image_path = if candidate_path.exists() && candidate_path.is_file() {
        Some(candidate_path.clone())
    } else {
        // Markdownファイルの親ディレクトリを基準にフォールバック探索
        let file_dir = clean_base_file
            .as_ref()
            .and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
            .or_else(|| clean_base_folder.as_ref().map(PathBuf::from));

        if let Some(dir) = file_dir {
            let file_name = Path::new(&decoded_path)
                .file_name()
                .map(|f| f.to_string_lossy().into_owned());

            if let Some(fname) = file_name {
                let md_stem = clean_base_file
                    .as_ref()
                    .and_then(|fp| Path::new(fp).file_stem().map(|s| s.to_string_lossy().into_owned()));

                let mut fallbacks = vec![
                    dir.join(&fname),
                    dir.join("images").join(&fname),
                    dir.join("assets").join(&fname),
                    dir.join("media").join(&fname),
                    dir.join("img").join(&fname),
                ];

                if let Some(stem) = md_stem {
                    fallbacks.push(dir.join(format!("{}_files", stem)).join(&fname));
                    fallbacks.push(dir.join(&stem).join(&fname));
                }

                fallbacks.into_iter().find(|p| p.exists() && p.is_file())
            } else {
                None
            }
        } else {
            None
        }
    };

    let actual_path = final_image_path.ok_or_else(|| {
        format!(
            "画像ファイルが見つかりません: {}",
            candidate_path.to_string_lossy()
        )
    })?;

    let bytes = fs::read(&actual_path).map_err(|e| {
        format!(
            "画像の読み込みに失敗しました ({}): {}",
            actual_path.to_string_lossy(),
            e
        )
    })?;

    let mime = get_image_mime_type(&actual_path);
    let encoded = base64_encode(&bytes);

    Ok(format!("data:{};base64,{}", mime, encoded))
}
