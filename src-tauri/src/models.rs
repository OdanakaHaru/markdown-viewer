#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_markdown: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct QuickOpenFileItem {
    pub name: String,
    pub path: String,
    pub relative_path: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ResolvedLink {
    pub kind: String, // "url" | "markdown" | "file" | "anchor" | "markdown_not_found" | "not_found" | "unknown"
    pub target: String,
    pub hash: Option<String>,
}
