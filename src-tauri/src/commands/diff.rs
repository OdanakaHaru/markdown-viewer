use std::fs;
use crate::diff::{compute_diff, DiffResult};
use crate::markdown::parse_markdown_to_html;

fn normalize_newlines_and_bom(s: &str) -> String {
    let without_bom = s.strip_prefix('\u{feff}').unwrap_or(s);
    without_bom.replace("\r\n", "\n")
}

#[tauri::command]
pub fn compare_markdown_text(old_text: String, new_text: String) -> Result<DiffResult, String> {
    let old_clean = normalize_newlines_and_bom(&old_text);
    let new_clean = normalize_newlines_and_bom(&new_text);
    let old_html = parse_markdown_to_html(&old_clean);
    let new_html = parse_markdown_to_html(&new_clean);
    let diff = compute_diff(&old_clean, &new_clean, &old_html, &new_html);
    Ok(diff)
}

#[tauri::command]
pub fn compare_markdown_files(old_path: String, new_path: String) -> Result<DiffResult, String> {
    let old_text = fs::read_to_string(&old_path).map_err(|e| e.to_string())?;
    let new_text = fs::read_to_string(&new_path).map_err(|e| e.to_string())?;
    compare_markdown_text(old_text, new_text)
}
