//! Parser: tokens to [`Item`]s.
//!
//! v1 shape only: an item is a dice group or number optionally followed by one
//! flat `+N` / `-N` modifier. Arithmetic between dice groups (ticket #11)
//! extends [`Parser::parse_item`] into a precedence-climbing expression parser;
//! the AST ([`Expr::Binary`]) already has room for it.

use crate::ast::{BinOp, Dice, Expr, Item, Select, SelectKind};
use crate::error::ParseError;
/// v1 limits (ticket #11 reworks limits and error reporting).
const MAX_DICE: i64 = 1000;
const MAX_SIDES: i64 = 10000;

use crate::lexer::{tokenize, Spanned, Token};

/// Parses a whole formula (comma-separated items) into items.
pub fn parse(src: &str) -> Result<Vec<Item>, ParseError> {
    let tokens = tokenize(src)?;
    let mut parser = Parser {
        tokens: &tokens,
        pos: 0,
        end: src.len(),
    };
    let mut items = Vec::new();
    loop {
        // v1 ignores empty items, so `d20,,d6` and a trailing comma are fine.
        while matches!(parser.peek(), Some(Token::Comma)) {
            parser.pos += 1;
        }
        if parser.at_end() {
            break;
        }
        let start = parser.here();
        let expr = parser.parse_item()?;
        let stop = parser.prev_end();
        items.push(Item {
            source: src[start..stop].trim().to_string(),
            expr,
        });
        if !parser.at_end() && !matches!(parser.peek(), Some(Token::Comma)) {
            return Err(parser.unexpected("',' or the end of the formula"));
        }
    }
    if items.is_empty() {
        return Err(ParseError::new("no formulas provided", 0..src.len()));
    }
    Ok(items)
}

struct Parser<'a> {
    tokens: &'a [Spanned],
    pos: usize,
    end: usize,
}

impl Parser<'_> {
    fn at_end(&self) -> bool {
        self.pos >= self.tokens.len()
    }

    fn here(&self) -> usize {
        self.tokens.get(self.pos).map_or(self.end, |t| t.span.start)
    }

    fn prev_end(&self) -> usize {
        self.tokens[self.pos - 1].span.end
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos).map(|t| &t.token)
    }

    fn bump(&mut self) -> Option<&Spanned> {
        let t = self.tokens.get(self.pos);
        self.pos += 1;
        t
    }

    fn unexpected(&self, expected: &str) -> ParseError {
        match self.tokens.get(self.pos) {
            Some(t) => ParseError::new(
                format!("expected {expected}, found {}", describe(&t.token)),
                t.span.clone(),
            ),
            None => ParseError::new(
                format!("expected {expected}, found end of input"),
                self.end..self.end,
            ),
        }
    }

    fn number(&mut self, what: &str) -> Result<i64, ParseError> {
        match self.peek() {
            Some(Token::Number(n)) => {
                let n = *n;
                self.pos += 1;
                Ok(n)
            }
            _ => Err(self.unexpected(what)),
        }
    }

    fn parse_item(&mut self) -> Result<Expr, ParseError> {
        // v1 accepted a signed bare number (`-5`, `+5`) as a fixed value.
        let sign = match self.peek() {
            Some(Token::Plus) => Some(1),
            Some(Token::Minus) => Some(-1),
            _ => None,
        };
        if let Some(sign) = sign {
            self.pos += 1;
            let n = self.number("a number after the sign")?;
            return Ok(Expr::Number(sign * n));
        }
        let mut expr = self.parse_term()?;
        let op = match self.peek() {
            Some(Token::Plus) => Some(BinOp::Add),
            Some(Token::Minus) => Some(BinOp::Sub),
            _ => None,
        };
        if let Some(op) = op {
            self.pos += 1;
            let n = self.number("a number after the modifier sign")?;
            expr = Expr::Binary {
                op,
                lhs: Box::new(expr),
                rhs: Box::new(Expr::Number(n)),
            };
        }
        Ok(expr)
    }

    fn parse_term(&mut self) -> Result<Expr, ParseError> {
        let start = self.pos;
        let count = match self.peek() {
            Some(Token::Number(n)) => {
                let n = *n;
                self.pos += 1;
                if !matches!(self.peek(), Some(Token::Word(w)) if w == "d") {
                    return Ok(Expr::Number(n));
                }
                n
            }
            _ => 1,
        };
        match self.bump() {
            Some(Spanned {
                token: Token::Word(w),
                ..
            }) if w == "d" => {}
            _ => {
                self.pos -= 1;
                return Err(self.unexpected("a dice group like d20 or 2d6"));
            }
        }
        let count_span = self.tokens[start].span.clone();
        let sides_start = self.pos;
        let sides = self.number("the number of sides after 'd'")?;
        let sides_span = self.tokens[sides_start].span.clone();
        if !(1..=MAX_DICE).contains(&count) {
            return Err(ParseError::new(
                format!("dice count must be between 1 and {MAX_DICE}"),
                count_span,
            ));
        }
        if !(2..=MAX_SIDES).contains(&sides) {
            return Err(ParseError::new(
                format!("sides must be between 2 and {MAX_SIDES}"),
                sides_span,
            ));
        }
        let select = self.parse_select(count)?;
        Ok(Expr::Dice(Dice {
            count,
            sides,
            select,
        }))
    }

    /// Optional `dl`/`dh`/`kl`/`kh` clause with an optional count (default 1).
    fn parse_select(&mut self, count: i64) -> Result<Option<Select>, ParseError> {
        let kind = match self.peek() {
            Some(Token::Word(w)) => match w.as_str() {
                "dl" => SelectKind::DropLowest,
                "dh" => SelectKind::DropHighest,
                "kl" => SelectKind::KeepLowest,
                "kh" => SelectKind::KeepHighest,
                _ => return Ok(None),
            },
            _ => return Ok(None),
        };
        let word_span = self.tokens[self.pos].span.clone();
        self.pos += 1;
        let n = match self.peek() {
            Some(Token::Number(n)) => {
                let n = *n;
                self.pos += 1;
                n
            }
            _ => 1,
        };
        let span = word_span.start..self.prev_end();
        let keeps = matches!(kind, SelectKind::KeepLowest | SelectKind::KeepHighest);
        if keeps && !(1..count).contains(&n) {
            return Err(ParseError::new(
                format!(
                    "must keep between 1 and {} dice from a pool of {count}",
                    count - 1
                ),
                span,
            ));
        }
        if !keeps && n >= count {
            return Err(ParseError::new(
                format!("cannot drop {n} dice from a pool of {count}"),
                span,
            ));
        }
        Ok(Some(Select { kind, n }))
    }
}

fn describe(t: &Token) -> String {
    match t {
        Token::Number(n) => format!("number {n}"),
        Token::Word(w) => format!("'{w}'"),
        Token::Plus => "'+'".into(),
        Token::Minus => "'-'".into(),
        Token::Comma => "','".into(),
    }
}
