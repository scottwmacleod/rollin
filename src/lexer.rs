//! Tokenizer: turns formula text into spanned tokens. Whitespace is skipped
//! and letters are lowercased, so `4D6 DL1` lexes like `4d6dl1`.

use crate::error::Error;
use std::ops::Range;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    /// A run of ASCII digits.
    Number(i64),
    /// A run of ASCII letters, lowercased (`d`, `dl`, `kh`, ...).
    Word(String),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
    Comma,
    /// `!`, which starts an explode clause.
    Bang,
    /// `%`, the sides of a percentile die (`d%`).
    Percent,
    Gt,
    Ge,
    Lt,
    Le,
    Eq,
    /// `#` and the text after it, up to (not including) the next comma.
    Label(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spanned {
    pub token: Token,
    pub span: Range<usize>,
}

pub fn tokenize(src: &str) -> Result<Vec<Spanned>, Error> {
    let mut out = Vec::new();
    let mut chars = src.char_indices().peekable();
    while let Some(&(start, c)) = chars.peek() {
        let pair = match (c, src[start..].chars().nth(1)) {
            ('>', Some('=')) => Some(Token::Ge),
            ('<', Some('=')) => Some(Token::Le),
            _ => None,
        };
        if let Some(token) = pair {
            chars.next();
            chars.next();
            out.push(Spanned {
                token,
                span: start..start + 2,
            });
            continue;
        }
        if c == '#' {
            let end = src[start..].find(',').map_or(src.len(), |i| start + i);
            while chars.peek().is_some_and(|&(i, _)| i < end) {
                chars.next();
            }
            let text = src[start + 1..end].trim();
            if text.is_empty() {
                return Err(Error::syntax(
                    "a label '#' needs text after it, as in '# attack'",
                    start..start + 1,
                ));
            }
            out.push(Spanned {
                token: Token::Label(text.to_string()),
                span: start..end,
            });
            continue;
        }
        let single = match c {
            '>' => Some(Token::Gt),
            '<' => Some(Token::Lt),
            '=' => Some(Token::Eq),
            '+' => Some(Token::Plus),
            '-' => Some(Token::Minus),
            '*' => Some(Token::Star),
            '/' => Some(Token::Slash),
            '(' => Some(Token::LParen),
            ')' => Some(Token::RParen),
            ',' => Some(Token::Comma),
            '!' => Some(Token::Bang),
            '%' => Some(Token::Percent),
            _ => None,
        };
        if let Some(token) = single {
            chars.next();
            out.push(Spanned {
                token,
                span: start..start + 1,
            });
        } else if c.is_ascii_digit() {
            let mut end = start;
            while let Some(&(i, d)) = chars.peek() {
                if !d.is_ascii_digit() {
                    break;
                }
                end = i + 1;
                chars.next();
            }
            let n = src[start..end]
                .parse::<i64>()
                .map_err(|_| Error::syntax("number is too large", start..end))?;
            out.push(Spanned {
                token: Token::Number(n),
                span: start..end,
            });
        } else if c.is_ascii_alphabetic() {
            let mut end = start;
            // A `p` right after `!` is the penetrating marker on its own, so
            // `!pkh2` lexes as `!`, `p`, `kh`, `2`.
            let penetrating =
                c.eq_ignore_ascii_case(&'p') && out.last().is_some_and(|t| t.token == Token::Bang);
            while let Some(&(i, d)) = chars.peek() {
                if !d.is_ascii_alphabetic() || (penetrating && end > start) {
                    break;
                }
                end = i + 1;
                chars.next();
            }
            // `adv`, `dis` and `df` (fudge) end a run early, so `d20advdl1`
            // lexes as `adv`, `dl`, `1` and `4dFdl1` as `df`, `dl`, `1`.
            let word = src[start..end].to_ascii_lowercase();
            let split = if word.starts_with("adv") || word.starts_with("dis") {
                3
            } else if word.starts_with("df") {
                2
            } else {
                word.len()
            };
            for (from, to) in [(0, split), (split, word.len())] {
                if from < to {
                    out.push(Spanned {
                        token: Token::Word(word[from..to].to_string()),
                        span: start + from..start + to,
                    });
                }
            }
        } else if c.is_whitespace() {
            chars.next();
        } else {
            return Err(Error::syntax(
                format!("unexpected character '{c}'"),
                start..start + c.len_utf8(),
            ));
        }
    }
    Ok(out)
}
