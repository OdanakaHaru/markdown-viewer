use syntect::html::{ClassStyle, ClassedHTMLGenerator};
use syntect::parsing::SyntaxSet;
use crate::utils::escape_html;

pub static SYNTAX_SET: std::sync::LazyLock<SyntaxSet> =
    std::sync::LazyLock::new(SyntaxSet::load_defaults_newlines);

pub fn highlight_code_block(code: &str, lang: Option<&str>) -> String {
    let raw_lang = lang.unwrap_or("").trim();
    let token = raw_lang.split_whitespace().next().unwrap_or("").to_lowercase();

    let syntax = if token.is_empty() {
        SYNTAX_SET.find_syntax_plain_text()
    } else {
        let lookup = match token.as_str() {
            "typescript" => "ts",
            "javascript" => "js",
            "shell" | "bash" | "zsh" => "sh",
            "dockerfile" => "docker",
            "markdown" => "md",
            "golang" => "go",
            "python3" | "py" => "python",
            "yml" => "yaml",
            _ => token.as_str(),
        };

        SYNTAX_SET
            .find_syntax_by_token(lookup)
            .or_else(|| SYNTAX_SET.find_syntax_by_extension(lookup))
            .unwrap_or_else(|| SYNTAX_SET.find_syntax_plain_text())
    };

    let display_lang = if token.is_empty() {
        "text".to_string()
    } else {
        token
    };

    let mut html_gen = ClassedHTMLGenerator::new_with_class_style(
        syntax,
        &SYNTAX_SET,
        ClassStyle::Spaced,
    );

    let mut parse_failed = false;
    for line in syntect::util::LinesWithEndings::from(code) {
        if html_gen.parse_html_for_line_which_includes_newline(line).is_err() {
            parse_failed = true;
            break;
        }
    }

    let code_html = if parse_failed {
        escape_html(code)
    } else {
        html_gen.finalize()
    };

    format!(
        "<div class=\"code-block-container\" data-lang=\"{}\"><div class=\"code-block-header\"><span class=\"code-block-lang\">{}</span><button class=\"code-block-copy-btn\" type=\"button\" title=\"コードをコピー\"><svg class=\"copy-icon\" width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"></rect><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"></path></svg><span class=\"copy-btn-text\">コピー</span></button></div><pre><code class=\"language-{}\">{}</code></pre></div>",
        escape_html(&display_lang),
        escape_html(&display_lang),
        escape_html(&display_lang),
        code_html
    )
}
