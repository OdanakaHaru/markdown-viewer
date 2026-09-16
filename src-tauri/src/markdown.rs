use pulldown_cmark::{html, CodeBlockKind, CowStr, Event as MdEvent, Options, Parser, Tag, TagEnd};
use crate::highlight::highlight_code_block;

pub fn parse_markdown_to_html(md: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(md, options);
    let mut events = Vec::new();
    let mut in_code_block = false;
    let mut current_lang: Option<String> = None;
    let mut code_buffer = String::new();

    for event in parser {
        match event {
            MdEvent::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                code_buffer.clear();
                current_lang = match kind {
                    CodeBlockKind::Fenced(lang) => {
                        let l = lang.trim().to_string();
                        if l.is_empty() {
                            None
                        } else {
                            Some(l)
                        }
                    }
                    CodeBlockKind::Indented => None,
                };
            }
            MdEvent::End(TagEnd::CodeBlock) => {
                if in_code_block {
                    in_code_block = false;
                    let highlighted = highlight_code_block(&code_buffer, current_lang.as_deref());
                    events.push(MdEvent::Html(CowStr::Boxed(highlighted.into_boxed_str())));
                    current_lang = None;
                    code_buffer.clear();
                }
            }
            MdEvent::Text(text) => {
                if in_code_block {
                    code_buffer.push_str(&text);
                } else {
                    events.push(MdEvent::Text(text));
                }
            }
            _ => {
                if !in_code_block {
                    events.push(event);
                }
            }
        }
    }

    let mut html_output = String::new();
    html::push_html(&mut html_output, events.into_iter());

    static RE_HEADING: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_heading = RE_HEADING.get_or_init(|| regex::Regex::new(r"(?i)<h([1-6])(?:\s+[^>]*)?>(.*?)</h[1-6]>").unwrap());

    static RE_STRIP_HTML: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_strip = RE_STRIP_HTML.get_or_init(|| regex::Regex::new(r"<[^>]+>").unwrap());

    static RE_INVALID_CHARS: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_invalid = RE_INVALID_CHARS.get_or_init(|| regex::Regex::new(r"[^\w\u00A0-\uFFFF -]").unwrap());

    static RE_SPACES: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re_spaces = RE_SPACES.get_or_init(|| regex::Regex::new(r"\s+").unwrap());

    let html_with_ids = re_heading.replace_all(&html_output, |caps: &regex::Captures| {
        let level = &caps[1];
        let content = &caps[2];

        let plain_text = re_strip.replace_all(content, "");
        let lower = plain_text.to_lowercase().trim().to_string();
        let stripped = re_invalid.replace_all(&lower, "");
        let id = re_spaces.replace_all(&stripped, "-");

        format!("<h{} id=\"{}\">{}</h{}>", level, id, content, level)
    });

    html_with_ids.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_markdown_syntax_highlight() {
        let md = "```rust\nfn main() {\n    let x = 42;\n}\n```";
        let html = parse_markdown_to_html(md);
        assert!(html.contains("code-block-container"));
        assert!(html.contains("language-rust"));
        assert!(html.contains("source rust"));
        assert!(html.contains("code-block-copy-btn"));
    }
}

