//! Parser: tokens to [`Item`]s.
//!
//! An item is an arithmetic expression over dice groups and numbers, parsed by
//! precedence climbing. The v1 shape (a dice group plus a flat modifier) is
//! just the simplest such expression.

use crate::ast::{BinOp, Dice, Expr, ExprKind, Item, Select, SelectKind};
use crate::error::Error;
/// v1 limits (ticket #11 reworks limits and error reporting).
const MAX_DICE: i64 = 1000;
const MAX_SIDES: i64 = 10000;

use crate::lexer::{tokenize, Spanned, Token};

/// Parses a whole formula (comma-separated items) into items.
pub fn parse(src: &str) -> Result<Vec<Item>, Error> {
    let tokens = tokenize(src)?;
    let mut parser = Parser {
        src,
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
        return Err(Error::syntax("no formulas provided", 0..src.len()));
    }
    Ok(items)
}

struct Parser<'a> {
    src: &'a str,
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

    fn unexpected(&self, expected: &str) -> Error {
        match self.tokens.get(self.pos) {
            Some(t) => Error::syntax(
                format!("expected {expected}, found {}", describe(&t.token)),
                t.span.clone(),
            ),
            None => Error::syntax(
                format!("expected {expected}, found end of input"),
                self.end..self.end,
            ),
        }
    }

    fn number(&mut self, what: &str) -> Result<i64, Error> {
        match self.peek() {
            Some(Token::Number(n)) => {
                let n = *n;
                self.pos += 1;
                Ok(n)
            }
            _ => Err(self.unexpected(what)),
        }
    }

    fn parse_item(&mut self) -> Result<Expr, Error> {
        self.parse_expr(1)
    }

    /// Precedence climbing: parses operators binding at least as tightly as
    /// `min_prec`. Operators of one level extend a single flat chain.
    fn parse_expr(&mut self, min_prec: u8) -> Result<Expr, Error> {
        let mut lhs = self.parse_unary()?;
        while let Some(op) = self.peek_binop() {
            if op.precedence() < min_prec {
                break;
            }
            self.pos += 1;
            let rhs = self.parse_expr(op.precedence() + 1)?;
            lhs = link(lhs, op, rhs);
        }
        Ok(lhs)
    }

    fn peek_binop(&self) -> Option<BinOp> {
        match self.peek() {
            Some(Token::Plus) => Some(BinOp::Add),
            Some(Token::Minus) => Some(BinOp::Sub),
            Some(Token::Star) => Some(BinOp::Mul),
            Some(Token::Slash) => Some(BinOp::Div),
            _ => None,
        }
    }

    /// Unary `-` negates and unary `+` is a no-op (v1 accepted `+5`).
    fn parse_unary(&mut self) -> Result<Expr, Error> {
        match self.peek() {
            Some(Token::Minus) => {
                let start = self.tokens[self.pos].span.start;
                self.pos += 1;
                let operand = self.parse_unary()?;
                let span = start..operand.span.end;
                Ok(Expr {
                    kind: ExprKind::Neg(Box::new(operand)),
                    span,
                })
            }
            Some(Token::Plus) => {
                self.pos += 1;
                self.parse_unary()
            }
            _ => self.parse_operand(),
        }
    }

    fn parse_group(&mut self) -> Result<Expr, Error> {
        let open = self.tokens[self.pos].span.clone();
        self.pos += 1;
        let inner = self.parse_expr(1)?;
        match self.peek() {
            Some(Token::RParen) => {
                self.pos += 1;
                Ok(Expr {
                    kind: ExprKind::Group(Box::new(inner)),
                    span: open.start..self.prev_end(),
                })
            }
            None => Err(Error::syntax("unclosed '('", open)),
            Some(_) => Err(self.unexpected("')'")),
        }
    }

    /// A parenthesised expression, a number or a dice group.
    fn parse_operand(&mut self) -> Result<Expr, Error> {
        let start = self.pos;
        if matches!(self.peek(), Some(Token::LParen)) {
            return self.parse_group();
        }
        let count = match self.peek() {
            Some(Token::Number(n)) => {
                let n = *n;
                self.pos += 1;
                if !matches!(self.peek(), Some(Token::Word(w)) if w == "d") {
                    return Ok(Expr {
                        kind: ExprKind::Number(n),
                        span: self.tokens[start].span.clone(),
                    });
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
                return Err(self.unexpected("a number, a dice group or '('"));
            }
        }
        let count_span = self.tokens[start].span.clone();
        let sides_start = self.pos;
        let sides = self.number("the number of sides after 'd'")?;
        let sides_span = self.tokens[sides_start].span.clone();
        if !(1..=MAX_DICE).contains(&count) {
            return Err(Error::invalid_dice(
                format!("dice count must be between 1 and {MAX_DICE}"),
                count_span,
            ));
        }
        if !(2..=MAX_SIDES).contains(&sides) {
            return Err(Error::invalid_dice(
                format!("sides must be between 2 and {MAX_SIDES}"),
                sides_span,
            ));
        }
        let select = self.parse_select(count)?;
        let span = self.tokens[start].span.start..self.prev_end();
        Ok(Expr {
            kind: ExprKind::Dice(Dice {
                text: self.src[span.clone()].to_string(),
                count,
                sides,
                select,
            }),
            span,
        })
    }

    /// Optional `dl`/`dh`/`kl`/`kh` clause with an optional count (default 1).
    fn parse_select(&mut self, count: i64) -> Result<Option<Select>, Error> {
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
            return Err(Error::invalid_dice(
                format!(
                    "must keep between 1 and {} dice from a pool of {count}",
                    count - 1
                ),
                span,
            ));
        }
        if !keeps && n >= count {
            return Err(Error::invalid_dice(
                format!("cannot drop {n} dice from a pool of {count}"),
                span,
            ));
        }
        Ok(Some(Select { kind, n }))
    }
}

/// Appends `op rhs` to `lhs`, extending its chain when it is one of the same
/// precedence level.
fn link(mut lhs: Expr, op: BinOp, rhs: Expr) -> Expr {
    let end = rhs.span.end;
    if let ExprKind::Chain { rest, .. } = &mut lhs.kind {
        if rest[0].0.precedence() == op.precedence() {
            rest.push((op, rhs));
            lhs.span.end = end;
            return lhs;
        }
    }
    let span = lhs.span.start..end;
    Expr {
        kind: ExprKind::Chain {
            first: Box::new(lhs),
            rest: vec![(op, rhs)],
        },
        span,
    }
}

fn describe(t: &Token) -> String {
    match t {
        Token::Number(n) => format!("number {n}"),
        Token::Word(w) => format!("'{w}'"),
        Token::Plus => "'+'".into(),
        Token::Minus => "'-'".into(),
        Token::Star => "'*'".into(),
        Token::Slash => "'/'".into(),
        Token::LParen => "'('".into(),
        Token::RParen => "')'".into(),
        Token::Comma => "','".into(),
    }
}
