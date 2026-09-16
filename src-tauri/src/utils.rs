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
}

