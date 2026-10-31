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
    Gt,
    Ge,
    Lt,
    Le,
    Eq,
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
            out.push(Spanned {
                token: Token::Word(src[start..end].to_ascii_lowercase()),
                span: start..end,
            });
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
