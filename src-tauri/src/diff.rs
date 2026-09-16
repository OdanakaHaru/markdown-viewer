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
    // 1. Line-by-line diff for Split View
    let text_diff = TextDiff::from_lines(old_text, new_text);
    let mut left_lines = Vec::new();
    let mut right_lines = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;
    
    let mut old_idx = 0;
    let mut new_idx = 0;

    for op in text_diff.ops() {
        for change in text_diff.iter_changes(op) {
            let val = change.value().to_string();
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

fn generate_html_diffs(old_html: &str, new_html: &str) -> (String, String, String) {
    // HTMLタグ、英数字単語、空白、その他の1文字（CJK文字や記号）に分割
    let re = regex::Regex::new(r"(<[^>]+>|[a-zA-Z0-9_]+|\s+|[^<])").unwrap();
    let old_parts: Vec<&str> = re.find_iter(old_html).map(|m| m.as_str()).collect();
    let new_parts: Vec<&str> = re.find_iter(new_html).map(|m| m.as_str()).collect();

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

    for op in diff.ops() {
        for change in diff.iter_changes(op) {
            let val = change.value();
            let is_tag = val.starts_with('<') && val.ends_with('>');

            match change.tag() {
                ChangeTag::Delete => {
                    if is_tag {
                        flush_unified(&mut unified_html, &mut unified_del_buf, &mut unified_ins_buf);
                        flush_left(&mut left_html, &mut left_del_buf);
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

    (unified_html, left_html, right_html)
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
}



