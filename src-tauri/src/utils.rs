use std::path::{Path, PathBuf};

pub fn is_markdown_extension(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_lowercase();
        matches!(lower.as_str(), "md" | "markdown" | "mdown" | "mkd" | "mdx")
    } else {
        false
    }
}

/// UTF-8のパーセントエンコード（日本語等のマルチバイト文字含む）を正しくデコードする
pub fn urlencoding_decode(s: &str) -> String {
    urlencoding::decode(s)
        .map(|cow| cow.into_owned())
        .unwrap_or_else(|_| s.to_string())
}

/// パス内の `.` や `..`、混在したスラッシュを正規化する
pub fn normalize_path(path: &Path) -> PathBuf {
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

pub fn escape_html(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

/// Windowsのパス区切りや大文字小文字、接頭辞を正規化して比較する
pub fn paths_match(p1: &Path, p2: &Path) -> bool {
    let s1 = p1.to_string_lossy().replace('\\', "/").to_lowercase();
    let s2 = p2.to_string_lossy().replace('\\', "/").to_lowercase();
    let trim1 = s1.trim_start_matches("//?/").trim_start_matches("\\\\?\\");
    let trim2 = s2.trim_start_matches("//?/").trim_start_matches("\\\\?\\");
    trim1 == trim2
}
