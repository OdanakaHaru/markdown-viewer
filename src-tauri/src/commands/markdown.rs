use crate::markdown::parse_markdown_to_html;

#[tauri::command]
pub fn parse_markdown(md: String) -> Result<String, String> {
    Ok(parse_markdown_to_html(&md))
}
