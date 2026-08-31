use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use pulldown_cmark::{html, Options, Parser};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_markdown: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ResolvedLink {
    pub kind: String, // "url" | "markdown" | "file" | "anchor" | "markdown_not_found" | "not_found" | "unknown"
    pub target: String,
    pub hash: Option<String>,
}

fn is_markdown_extension(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_lowercase();
        matches!(lower.as_str(), "md" | "markdown" | "mdown" | "mkd" | "mdx")
    } else {
        false
    }
}

/// UTF-8のパーセントエンコード（日本語等のマルチバイト文字含む）を正しくデコードする
fn urlencoding_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    bytes.push(byte);
                    continue;
                }
            }
            bytes.push(b'%');
            bytes.extend_from_slice(hex.as_bytes());
        } else {
            let mut buf = [0; 4];
            bytes.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// パス内の `.` や `..`、混在したスラッシュを正規化する
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if let Some(last) = components.last() {
                    if last != &std::ffi::OsStr::new("/") && last != &std::ffi::OsStr::new("\\") {
                        components.pop();
                        continue;
                    }
                }
                components.push(component.as_os_str().to_os_string());
            }
            _ => {
                components.push(component.as_os_str().to_os_string());
            }
        }
    }
    let mut normalized = PathBuf::new();
    for c in components {
        normalized.push(c);
    }
    normalized
}

#[tauri::command]
fn open_md_file() -> Result<(String, String), String> {
    let file = rfd::FileDialog::new()
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
fn open_folder() -> Result<String, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    if let Some(path) = folder {
        Ok(path.to_string_lossy().into_owned())
    } else {
        Err("No folder selected".to_string())
    }
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
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
fn read_md_file(path: String) -> Result<(String, String), String> {
    match fs::read_to_string(&path) {
        Ok(content) => {
            let html = parse_markdown_to_html(&content);
            Ok((path, html))
        }
        Err(e) => Err(e.to_string()),
    }
}

fn parse_markdown_to_html(md: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(md, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

#[tauri::command]
fn resolve_link_target(
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

        let base_dir = if is_root_slash {
            base_folder_path.as_ref().map(PathBuf::from).or_else(|| {
                base_file_path.as_ref().and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
            })
        } else {
            base_file_path.as_ref().and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf())).or_else(|| {
                base_folder_path.as_ref().map(PathBuf::from)
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
fn open_external(target: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &target])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("外部アプリケーションの起動に失敗しました: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("外部アプリケーションの起動に失敗しました: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("外部アプリケーションの起動に失敗しました: {}", e))?;
        Ok(())
    }
}

fn get_image_mime_type(path: &Path) -> &'static str {
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
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        result.push(CHARSET[(b0 >> 2) as usize] as char);
        result.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            result.push(CHARSET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARSET[(b2 & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
fn read_image_data_url(
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

    let candidate_path = if is_absolute {
        normalize_path(Path::new(&decoded_path))
    } else {
        let is_root_slash = decoded_path.starts_with('/') || decoded_path.starts_with('\\');
        let rel_trimmed = decoded_path.trim_start_matches(|c| c == '/' || c == '\\');

        let base_dir = if is_root_slash {
            base_folder_path.as_ref().map(PathBuf::from).or_else(|| {
                base_file_path
                    .as_ref()
                    .and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
            })
        } else {
            base_file_path
                .as_ref()
                .and_then(|fp| Path::new(fp).parent().map(|p| p.to_path_buf()))
                .or_else(|| base_folder_path.as_ref().map(PathBuf::from))
        };

        if let Some(base) = base_dir {
            normalize_path(&base.join(rel_trimmed))
        } else {
            normalize_path(Path::new(rel_trimmed))
        }
    };

    if !candidate_path.exists() {
        return Err(format!(
            "画像ファイルが見つかりません: {}",
            candidate_path.to_string_lossy()
        ));
    }

    if !candidate_path.is_file() {
        return Err(format!(
            "指定されたパスはファイルではありません: {}",
            candidate_path.to_string_lossy()
        ));
    }

    let bytes = fs::read(&candidate_path).map_err(|e| {
        format!(
            "画像の読み込みに失敗しました ({}): {}",
            candidate_path.to_string_lossy(),
            e
        )
    })?;

    let mime = get_image_mime_type(&candidate_path);
    let encoded = base64_encode(&bytes);

    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
fn parse_markdown(md: String) -> Result<String, String> {
    Ok(parse_markdown_to_html(&md))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_md_file,
            open_folder,
            read_directory,
            read_md_file,
            resolve_link_target,
            open_external,
            read_image_data_url,
            parse_markdown
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
    use super::*;

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
    fn test_base64_encode() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn test_get_image_mime_type() {
        assert_eq!(get_image_mime_type(Path::new("pic.png")), "image/png");
        assert_eq!(get_image_mime_type(Path::new("pic.jpg")), "image/jpeg");
        assert_eq!(get_image_mime_type(Path::new("pic.JPEG")), "image/jpeg");
        assert_eq!(get_image_mime_type(Path::new("icon.svg")), "image/svg+xml");
        assert_eq!(get_image_mime_type(Path::new("photo.webp")), "image/webp");
        assert_eq!(get_image_mime_type(Path::new("unknown.xyz")), "application/octet-stream");
    }

    #[test]
    fn test_read_image_data_url_web() {
        let res = read_image_data_url(None, None, "https://example.com/logo.png".to_string());
        assert_eq!(res.unwrap(), "https://example.com/logo.png");

        let data_url = "data:image/png;base64,iVBORw0KGgo=";
        let res2 = read_image_data_url(None, None, data_url.to_string());
        assert_eq!(res2.unwrap(), data_url);
    }
}



