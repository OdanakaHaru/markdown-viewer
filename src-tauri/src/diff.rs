use serde::Serialize;
use similar::{ChangeTag, TextDiff};

#[derive(Serialize)]
pub struct DiffLineDto {
    pub kind: String, // "equal", "delete", "insert"
    pub text: String,
    pub line_idx: Option<usize>,
}

#[derive(Serialize)]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Serialize)]
pub struct DiffResult {
    pub unified_html: String,
    pub old_html: String,
    pub new_html: String,
    pub left_lines: Vec<DiffLineDto>,
    pub right_lines: Vec<DiffLineDto>,
    pub stats: DiffStats,
}

pub fn compute_diff(old_text: &str, new_text: &str, old_html: &str, new_html: &str) -> DiffResult {
    // 改行コード（CRLF / LF）やBOMの違いで全行が差分扱いになるのを防ぐため、LFに統一
    let old_clean = old_text.strip_prefix('\u{feff}').unwrap_or(old_text).replace("\r\n", "\n");
    let new_clean = new_text.strip_prefix('\u{feff}').unwrap_or(new_text).replace("\r\n", "\n");

    // 1. Line-by-line diff for Split View
    let text_diff = TextDiff::from_lines(&old_clean, &new_clean);
    let mut left_lines = Vec::new();
    let mut right_lines = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;
    
    let mut old_idx = 0;
    let mut new_idx = 0;

    for op in text_diff.ops() {
        for change in text_diff.iter_changes(op) {
            let val = change.value().trim_end_matches(['\r', '\n']).to_string();
            match change.tag() {
                ChangeTag::Delete => {
                    deletions += 1;
                    left_lines.push(DiffLineDto {
                        kind: "delete".to_string(),
                        text: val.clone(),
                        line_idx: Some(old_idx),
                    });
                    right_lines.push(DiffLineDto {
                        kind: "equal".to_string(), // filler for alignment
                        text: "".to_string(),
                        line_idx: None,
                    });
                    old_idx += 1;
                }
                ChangeTag::Insert => {
                    additions += 1;
                    left_lines.push(DiffLineDto {
                        kind: "equal".to_string(), // filler for alignment
                        text: "".to_string(),
                        line_idx: None,
                    });
                    right_lines.push(DiffLineDto {
                        kind: "insert".to_string(),
                        text: val.clone(),
                        line_idx: Some(new_idx),
                    });
                    new_idx += 1;
                }
                ChangeTag::Equal => {
                    left_lines.push(DiffLineDto {
                        kind: "equal".to_string(),
                        text: val.clone(),
                        line_idx: Some(old_idx),
                    });
                    right_lines.push(DiffLineDto {
                        kind: "equal".to_string(),
                        text: val.clone(),
                        line_idx: Some(new_idx),
                    });
                    old_idx += 1;
                    new_idx += 1;
                }
            }
        }
    }

    // 2. Visual HTML Diff for Unified & Split Views
    let (unified_html, old_html_diff, new_html_diff) = generate_html_diffs(old_html, new_html);

    DiffResult {
        unified_html,
        old_html: old_html_diff,
        new_html: new_html_diff,
        left_lines,
        right_lines,
        stats: DiffStats { additions, deletions },
    }
}

fn strip_html_tags_and_unescape(html_str: &str) -> String {
    static RE_TAGS: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_tags = RE_TAGS.get_or_init(|| regex::Regex::new(r"<[^>]+>").unwrap());
    let stripped = re_tags.replace_all(html_str, "");
    stripped
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .to_string()
}

#[derive(Clone, Debug)]
struct MaskedMermaid {
    raw_code: String,
    full_html: String,
}

fn mask_mermaid_blocks(html: &str, side: &str) -> (String, Vec<MaskedMermaid>) {
    static RE_MERMAID: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = RE_MERMAID.get_or_init(|| {
        regex::Regex::new(r#"(?s)<div class="[^"]*code-block-mermaid[^"]*"[^>]*>.*?</div>\s*<pre><code[^>]*>(.*?)</code></pre>\s*</div>"#).unwrap()
    });

    let mut list = Vec::new();
    let mut offset = 0;
    let mut out = String::new();

    for caps in re.captures_iter(html) {
        let whole = caps.get(0).unwrap();
        out.push_str(&html[offset..whole.start()]);

        let code_inner = &caps[1];
        let raw_code = strip_html_tags_and_unescape(code_inner);
        let idx = list.len();
        list.push(MaskedMermaid {
            raw_code,
            full_html: whole.as_str().to_string(),
        });

        // プレースホルダーを挿入
        out.push_str(&format!("<div data-mermaid-block=\"{}:{}\"></div>", side, idx));
        offset = whole.end();
    }
    out.push_str(&html[offset..]);

    (out, list)
}

fn generate_mermaid_code_diff_html(diff_mode: &str, old_val: &str, new_val: &str) -> String {
    if old_val.is_empty() && new_val.is_empty() {
        return String::new();
    }
    if old_val.is_empty() {
        let escaped = crate::utils::escape_html(new_val);
        return format!("<ins class=\"diff-ins\">{}</ins>", escaped);
    }
    if new_val.is_empty() {
        let escaped = crate::utils::escape_html(old_val);
        return format!("<del class=\"diff-del\">{}</del>", escaped);
    }

    let old_clean = old_val.replace("\r\n", "\n");
    let new_clean = new_val.replace("\r\n", "\n");
    let text_diff = TextDiff::from_lines(&old_clean, &new_clean);
    let mut out = String::new();

    for change in text_diff.iter_all_changes() {
        let tag = change.tag();
        let val = crate::utils::escape_html(change.value());
        match tag {
            ChangeTag::Delete => {
                if diff_mode == "unified" || diff_mode == "left" {
                    out.push_str("<del class=\"diff-del\">");
                    out.push_str(&val);
                    out.push_str("</del>");
                }
            }
            ChangeTag::Insert => {
                if diff_mode == "unified" || diff_mode == "right" {
                    out.push_str("<ins class=\"diff-ins\">");
                    out.push_str(&val);
                    out.push_str("</ins>");
                }
            }
            ChangeTag::Equal => {
                out.push_str(&val);
            }
        }
    }
    out
}

fn build_diff_mermaid_html(
    diff_mode: &str,
    old_code: Option<&str>,
    new_code: Option<&str>,
    _fallback_html: &str,
) -> String {
    let old_val = old_code.unwrap_or("");
    let new_val = new_code.unwrap_or("");
    let encoded_old = urlencoding::encode(old_val);
    let encoded_new = urlencoding::encode(new_val);

    let code_diff_html = generate_mermaid_code_diff_html(diff_mode, old_val, new_val);

    format!(
        "<div class=\"code-block-container code-block-mermaid\" data-lang=\"mermaid\" data-diff-mode=\"{}\" data-mermaid-old=\"{}\" data-mermaid-new=\"{}\"><div class=\"code-block-header\"><span class=\"code-block-lang\">mermaid</span><button class=\"code-block-copy-btn\" type=\"button\" title=\"コードをコピー\"><svg class=\"copy-icon\" width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"></rect><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"></path></svg><span class=\"copy-btn-text\">コピー</span></button></div><pre><code class=\"language-mermaid\">{}</code></pre></div>",
        diff_mode,
        encoded_old,
        encoded_new,
        code_diff_html
    )
}

fn restore_mermaid_blocks(
    unified_html: String,
    left_html: String,
    right_html: String,
    old_blocks: &[MaskedMermaid],
    new_blocks: &[MaskedMermaid],
) -> (String, String, String) {
    static RE_PAIR: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_pair = RE_PAIR.get_or_init(|| {
        regex::Regex::new(r#"(?s)<del[^>]*><div data-mermaid-block="old:(\d+)"></div></del>\s*<ins[^>]*><div data-mermaid-block="new:(\d+)"></div></ins>"#).unwrap()
    });

    static RE_OLD_DEL: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_old_del = RE_OLD_DEL.get_or_init(|| {
        regex::Regex::new(r#"(?s)<del[^>]*><div data-mermaid-block="old:(\d+)"></div></del>"#).unwrap()
    });

    static RE_NEW_INS: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_new_ins = RE_NEW_INS.get_or_init(|| {
        regex::Regex::new(r#"(?s)<ins[^>]*><div data-mermaid-block="new:(\d+)"></div></ins>"#).unwrap()
    });

    static RE_OLD_SINGLE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_old_single = RE_OLD_SINGLE.get_or_init(|| {
        regex::Regex::new(r#"(?s)<div data-mermaid-block="old:(\d+)"></div>"#).unwrap()
    });

    static RE_NEW_SINGLE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_new_single = RE_NEW_SINGLE.get_or_init(|| {
        regex::Regex::new(r#"(?s)<div data-mermaid-block="new:(\d+)"></div>"#).unwrap()
    });

    // 1. unified_html の復元
    // まず pair（変更されたブロック）を置換
    let u1 = re_pair.replace_all(&unified_html, |caps: &regex::Captures| {
        let o_idx: usize = caps[1].parse().unwrap_or(0);
        let n_idx: usize = caps[2].parse().unwrap_or(0);
        let o_code = old_blocks.get(o_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        let n_code = new_blocks.get(n_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        build_diff_mermaid_html("unified", Some(o_code), Some(n_code), "")
    });

    // 削除されたブロック
    let u2 = re_old_del.replace_all(&u1, |caps: &regex::Captures| {
        let o_idx: usize = caps[1].parse().unwrap_or(0);
        let o_code = old_blocks.get(o_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        build_diff_mermaid_html("unified", Some(o_code), None, "")
    });

    // 追加されたブロック
    let u3 = re_new_ins.replace_all(&u2, |caps: &regex::Captures| {
        let n_idx: usize = caps[1].parse().unwrap_or(0);
        let n_code = new_blocks.get(n_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        build_diff_mermaid_html("unified", None, Some(n_code), "")
    });

    // 単独で残った old / new
    let u4 = re_old_single.replace_all(&u3, |caps: &regex::Captures| {
        let o_idx: usize = caps[1].parse().unwrap_or(0);
        let o_code = old_blocks.get(o_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        // もし対応する新ブロックがあれば差分、なければ通常
        let n_code = new_blocks.get(o_idx).map(|b| b.raw_code.as_str());
        if let Some(nc) = n_code {
            if nc == o_code {
                old_blocks.get(o_idx).map(|b| b.full_html.clone()).unwrap_or_default()
            } else {
                build_diff_mermaid_html("unified", Some(o_code), Some(nc), "")
            }
        } else {
            build_diff_mermaid_html("unified", Some(o_code), None, "")
        }
    });

    let restored_unified = re_new_single.replace_all(&u4, |caps: &regex::Captures| {
        let n_idx: usize = caps[1].parse().unwrap_or(0);
        let n_code = new_blocks.get(n_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        let o_code = old_blocks.get(n_idx).map(|b| b.raw_code.as_str());
        if let Some(oc) = o_code {
            if oc == n_code {
                new_blocks.get(n_idx).map(|b| b.full_html.clone()).unwrap_or_default()
            } else {
                build_diff_mermaid_html("unified", Some(oc), Some(n_code), "")
            }
        } else {
            build_diff_mermaid_html("unified", None, Some(n_code), "")
        }
    }).to_string();

    // 2. left_html の復元（旧側：新にない削除ノードを赤色表示するための left モード）
    let l1 = re_old_del.replace_all(&left_html, |caps: &regex::Captures| {
        let o_idx: usize = caps[1].parse().unwrap_or(0);
        let o_code = old_blocks.get(o_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        let n_code = new_blocks.get(o_idx).map(|b| b.raw_code.as_str());
        build_diff_mermaid_html("left", Some(o_code), n_code, "")
    });
    let restored_left = re_old_single.replace_all(&l1, |caps: &regex::Captures| {
        let o_idx: usize = caps[1].parse().unwrap_or(0);
        let o_code = old_blocks.get(o_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        let n_code = new_blocks.get(o_idx).map(|b| b.raw_code.as_str());
        if let Some(nc) = n_code {
            if nc == o_code {
                old_blocks.get(o_idx).map(|b| b.full_html.clone()).unwrap_or_default()
            } else {
                build_diff_mermaid_html("left", Some(o_code), Some(nc), "")
            }
        } else {
            build_diff_mermaid_html("left", Some(o_code), None, "")
        }
    }).to_string();

    // 3. right_html の復元（新側：旧にない追加ノードを緑色表示するための right モード）
    let r1 = re_new_ins.replace_all(&right_html, |caps: &regex::Captures| {
        let n_idx: usize = caps[1].parse().unwrap_or(0);
        let n_code = new_blocks.get(n_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        let o_code = old_blocks.get(n_idx).map(|b| b.raw_code.as_str());
        build_diff_mermaid_html("right", o_code, Some(n_code), "")
    });
    let restored_right = re_new_single.replace_all(&r1, |caps: &regex::Captures| {
        let n_idx: usize = caps[1].parse().unwrap_or(0);
        let n_code = new_blocks.get(n_idx).map(|b| b.raw_code.as_str()).unwrap_or("");
        let o_code = old_blocks.get(n_idx).map(|b| b.raw_code.as_str());
        if let Some(oc) = o_code {
            if oc == n_code {
                new_blocks.get(n_idx).map(|b| b.full_html.clone()).unwrap_or_default()
            } else {
                build_diff_mermaid_html("right", Some(oc), Some(n_code), "")
            }
        } else {
            build_diff_mermaid_html("right", None, Some(n_code), "")
        }
    }).to_string();

    (restored_unified, restored_left, restored_right)
}

fn generate_html_diffs(old_html: &str, new_html: &str) -> (String, String, String) {
    // 0. Mermaidブロックの保護（マスク化）
    let (masked_old, old_blocks) = mask_mermaid_blocks(old_html, "old");
    let (masked_new, new_blocks) = mask_mermaid_blocks(new_html, "new");

    // HTMLタグ、英数字単語、空白、その他の1文字（CJK文字や記号）に分割
    let re = regex::Regex::new(r"(<[^>]+>|[a-zA-Z0-9_]+|\s+|[^<])").unwrap();
    let old_parts: Vec<&str> = re.find_iter(&masked_old).map(|m| m.as_str()).collect();
    let new_parts: Vec<&str> = re.find_iter(&masked_new).map(|m| m.as_str()).collect();

    let diff = TextDiff::from_slices(&old_parts, &new_parts);

    let mut unified_html = String::new();
    let mut left_html = String::new();
    let mut right_html = String::new();

    let mut unified_del_buf = String::new();
    let mut unified_ins_buf = String::new();
    let mut left_del_buf = String::new();
    let mut right_ins_buf = String::new();

    let flush_unified = |unified: &mut String, del_buf: &mut String, ins_buf: &mut String| {
        if !del_buf.is_empty() {
            unified.push_str("<del class=\"diff-del\">");
            unified.push_str(del_buf);
            unified.push_str("</del>");
            del_buf.clear();
        }
        if !ins_buf.is_empty() {
            unified.push_str("<ins class=\"diff-ins\">");
            unified.push_str(ins_buf);
            unified.push_str("</ins>");
            ins_buf.clear();
        }
    };

    let flush_left = |left: &mut String, del_buf: &mut String| {
        if !del_buf.is_empty() {
            left.push_str("<del class=\"diff-del\">");
            left.push_str(del_buf);
            left.push_str("</del>");
            del_buf.clear();
        }
    };

    let flush_right = |right: &mut String, ins_buf: &mut String| {
        if !ins_buf.is_empty() {
            right.push_str("<ins class=\"diff-ins\">");
            right.push_str(ins_buf);
            right.push_str("</ins>");
            ins_buf.clear();
        }
    };

    let is_structural_tag = |tag: &str| -> bool {
        let lower = tag.to_lowercase();
        let name = lower.trim_start_matches("</").trim_start_matches('<');
        let token = name.split(|c: char| c.is_whitespace() || c == '>').next().unwrap_or("");
        matches!(
            token,
            "table" | "thead" | "tbody" | "tfoot" | "tr" | "th" | "td" | "pre" | "code" | "div"
        )
    };

    for op in diff.ops() {
        for change in diff.iter_changes(op) {
            let val = change.value();
            let is_tag = val.starts_with('<') && val.ends_with('>');

            match change.tag() {
                ChangeTag::Delete => {
                    if is_tag {
                        flush_unified(&mut unified_html, &mut unified_del_buf, &mut unified_ins_buf);
                        flush_left(&mut left_html, &mut left_del_buf);
                        if is_structural_tag(val) {
                            unified_html.push_str(val);
                        }
                        left_html.push_str(val);
                    } else {
                        unified_del_buf.push_str(val);
                        left_del_buf.push_str(val);
                    }
                }
                ChangeTag::Insert => {
                    if is_tag {
                        flush_unified(&mut unified_html, &mut unified_del_buf, &mut unified_ins_buf);
                        flush_right(&mut right_html, &mut right_ins_buf);
                        unified_html.push_str(val);
                        right_html.push_str(val);
                    } else {
                        unified_ins_buf.push_str(val);
                        right_ins_buf.push_str(val);
                    }
                }
                ChangeTag::Equal => {
                    flush_unified(&mut unified_html, &mut unified_del_buf, &mut unified_ins_buf);
                    flush_left(&mut left_html, &mut left_del_buf);
                    flush_right(&mut right_html, &mut right_ins_buf);

                    unified_html.push_str(val);
                    left_html.push_str(val);
                    right_html.push_str(val);
                }
            }
        }
    }

    flush_unified(&mut unified_html, &mut unified_del_buf, &mut unified_ins_buf);
    flush_left(&mut left_html, &mut left_del_buf);
    flush_right(&mut right_html, &mut right_ins_buf);

    // 4. Mermaidブロックの復元（差分メタデータ属性付きのHTMLに再構築）
    restore_mermaid_blocks(unified_html, left_html, right_html, &old_blocks, &new_blocks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_html_diffs() {
        let old_h = "<p>Hello <b>World</b></p>";
        let new_h = "<p>Hello <b>Rust</b></p>";
        let (u, l, r) = generate_html_diffs(old_h, new_h);
        println!("unified: {}", u);
        println!("left: {}", l);
        println!("right: {}", r);
        assert!(l.contains("<del class=\"diff-del\">World</del>"));
        assert!(r.contains("<ins class=\"diff-ins\">Rust</ins>"));
    }

    #[test]
    fn test_table_row_delete() {
        let old_h = "<table><tbody><tr><td>Row 1</td></tr><tr><td>Row 2</td></tr></tbody></table>";
        let new_h = "<table><tbody><tr><td>Row 1</td></tr></tbody></table>";
        let (u, l, _r) = generate_html_diffs(old_h, new_h);
        println!("Deleted row in unified: {}", u);
        println!("Deleted row in left: {}", l);
        assert!(u.contains("<tr><td><del class=\"diff-del\">Row 2</del></td></tr>"));
        assert!(l.contains("<tr><td><del class=\"diff-del\">Row 2</del></td></tr>"));
    }

    #[test]
    fn test_mermaid_diff_mask_and_restore() {
        let old_h = "<p>Intro</p><div class=\"code-block-container code-block-mermaid\" data-lang=\"mermaid\"><div class=\"code-block-header\"><span class=\"code-block-lang\">mermaid</span></div><pre><code class=\"language-mermaid\">flowchart TD\nA --> B</code></pre></div>";
        let new_h = "<p>Intro</p><div class=\"code-block-container code-block-mermaid\" data-lang=\"mermaid\"><div class=\"code-block-header\"><span class=\"code-block-lang\">mermaid</span></div><pre><code class=\"language-mermaid\">flowchart TD\nA --> C</code></pre></div>";
        let (u, l, r) = generate_html_diffs(old_h, new_h);
        
        assert!(u.contains("data-diff-mode=\"unified\""));
        assert!(u.contains("data-mermaid-old="));
        assert!(u.contains("data-mermaid-new="));
        assert!(u.contains("<del class=\"diff-del\">"));
        assert!(u.contains("<ins class=\"diff-ins\">"));

        assert!(l.contains("data-diff-mode=\"left\""));
        assert!(l.contains("<del class=\"diff-del\">"));

        assert!(r.contains("data-diff-mode=\"right\""));
        assert!(r.contains("<ins class=\"diff-ins\">"));
    }

    #[test]
    fn test_compute_diff_crlf_vs_lf() {
        let old_text = "Line 1\nLine 2\nLine 3";
        let new_text = "Line 1\r\nLine 2\r\nLine 3";
        let diff = compute_diff(old_text, new_text, "<p>Line 1 Line 2 Line 3</p>", "<p>Line 1 Line 2 Line 3</p>");

        assert_eq!(diff.stats.additions, 0, "CRLF vs LF の改行違いのみで追加と判定されてはならない");
        assert_eq!(diff.stats.deletions, 0, "CRLF vs LF の改行違いのみで削除と判定されてはならない");
        assert_eq!(diff.left_lines.len(), 3);
        assert_eq!(diff.right_lines.len(), 3);
        for line in &diff.left_lines {
            assert_eq!(line.kind, "equal");
        }
        for line in &diff.right_lines {
            assert_eq!(line.kind, "equal");
        }
    }

    #[test]
    fn test_compute_diff_crlf_with_actual_diff() {
        let old_text = "Line 1\nLine 2\nLine 3";
        let new_text = "Line 1\r\nLine 2 (updated)\r\nLine 3";
        let diff = compute_diff(old_text, new_text, "", "");

        assert_eq!(diff.stats.additions, 1);
        assert_eq!(diff.stats.deletions, 1);
    }
}




