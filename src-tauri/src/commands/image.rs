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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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
}

