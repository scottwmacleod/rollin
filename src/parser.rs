//! Parser: tokens to [`Item`]s.
//!
//! An item is an arithmetic expression over dice groups and numbers, parsed by
//! precedence climbing. The v1 shape (a dice group plus a flat modifier) is
//! just the simplest such expression.

use crate::ast::{
    BinOp, Cmp, Dice, Explode, ExplodeMode, Expr, ExprKind, Failure, Formula, Item, Reroll,
    RerollMode, Select, SelectKind, Special, Success,
};
use crate::error::Error;
// Hard limits (ADR 0006). Sides is a v1 rule, kept as an invalid-dice error.
const MAX_DICE_PER_TERM: i64 = 1000;
const MAX_DICE_PER_EXPRESSION: i64 = 10000;
const MAX_DEPTH: usize = 32;
const MAX_REPEAT: i64 = 100;
const MAX_SIDES: i64 = 10000;
/// `d%` is a d100.
const PERCENTILE_SIDES: i64 = 100;
/// A fudge die has three outcomes, drawn like a d3 and shifted to -1, 0, +1.
const FUDGE_SIDES: i64 = 3;

use crate::lexer::{tokenize, Spanned, Token};

/// Parses a whole formula (comma-separated items) into items.
pub fn parse(src: &str) -> Result<Formula, Error> {
    let tokens = tokenize(src)?;
    let mut parser = Parser {
        src,
        tokens: &tokens,
        pos: 0,
        end: src.len(),
        depth: 0,
        item_dice: 0,
    };
    let mut repeat = None;
    if let [Spanned {
        token: Token::Number(n),
        ..
    }, Spanned {
        token: Token::Word(w),
        ..
    }, ..] = tokens.as_slice()
    {
        if w == "x" {
            let span = tokens[0].span.start..tokens[1].span.end;
            if *n < 1 {
                return Err(Error::syntax("repeat count must be at least 1", span));
            }
            if *n > MAX_REPEAT {
                return Err(Error::LimitExceeded {
                    cap: "repeat",
                    limit: MAX_REPEAT as usize,
                    term: src[span.clone()].to_string(),
                    span,
                });
            }
            repeat = Some(*n as u32);
            parser.pos = 2;
        }
    }
    let mut items = Vec::new();
    loop {
        // v1 ignores empty items, so `d20,,d6` and a trailing comma are fine.
        while matches!(parser.peek(), Some(Token::Comma)) {
            parser.pos += 1;
        }
        if parser.at_end() {
            break;
        }
        if matches!(parser.peek(), Some(Token::Label(_))) {
            return Err(Error::syntax(
                "a label needs a roll before it, as in 'd20 # attack'",
                parser.tokens[parser.pos].span.clone(),
            ));
        }
        let start = parser.here();
        parser.item_dice = 0;
        let expr = parser.parse_item()?;
        let stop = parser.prev_end();
        let label = match parser.peek() {
            Some(Token::Label(text)) => {
                let text = text.clone();
                parser.pos += 1;
                Some(text)
            }
            _ => None,
        };
        items.push(Item {
            source: src[start..stop].trim().to_string(),
            expr,
            label,
        });
        if !parser.at_end() && !matches!(parser.peek(), Some(Token::Comma)) {
            return Err(parser.unexpected("',' or the end of the formula"));
        }
    }
    if items.is_empty() {
        if repeat.is_some() {
            let span = tokens[0].span.start..tokens[1].span.end;
            return Err(Error::syntax(
                format!("'{}' has nothing to repeat", &src[span.clone()]),
                span,
            ));
        }
        return Err(Error::syntax("no formulas provided", 0..src.len()));
    }
    Ok(Formula { repeat, items })
}

struct Parser<'a> {
    src: &'a str,
    tokens: &'a [Spanned],
    pos: usize,
    end: usize,
    /// Parentheses and unary minus signs currently open.
    depth: usize,
    /// Dice rolled so far by the item being parsed.
    item_dice: i64,
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
            reject_count(&lhs)?;
            reject_count(&rhs)?;
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
                self.enter(start)?;
                self.pos += 1;
                let operand = self.parse_unary()?;
                reject_count(&operand)?;
                self.depth -= 1;
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

    /// Opens one more level of nesting at byte offset `at`.
    fn enter(&mut self, at: usize) -> Result<(), Error> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            let shown: String = self.src[at..].chars().take(16).collect();
            let more = if self.src[at..].chars().count() > 16 {
                "…"
            } else {
                ""
            };
            let len = self.src[at..].chars().next().map_or(1, char::len_utf8);
            return Err(Error::LimitExceeded {
                cap: "nesting depth",
                limit: MAX_DEPTH,
                term: format!("{shown}{more}"),
                span: at..at + len,
            });
        }
        Ok(())
    }

    fn parse_group(&mut self) -> Result<Expr, Error> {
        let open = self.tokens[self.pos].span.clone();
        self.enter(open.start)?;
        self.pos += 1;
        let inner = self.parse_expr(1)?;
        self.depth -= 1;
        match self.peek() {
            Some(Token::RParen) => {
                self.pos += 1;
                Ok(Expr {
                    kind: ExprKind::Group(Box::new(inner)),
                    span: open.start..self.prev_end(),
                })
            }
            None => Err(Error::syntax("unclosed '('", open)),
            Some(Token::Label(_)) => Err(Error::syntax(
                "unclosed '(': a label runs to the next comma, so it swallowed the ')'; put labels at the end of an item",
                open,
            )),
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
                if let Some(Token::Word(w)) = self.peek() {
                    if w == "x" {
                        let span = self.tokens[start].span.start..self.tokens[self.pos].span.end;
                        return Err(Error::syntax(
                            format!(
                                "a repeat ('{}') is allowed only once, at the very start of the formula",
                                &self.src[span.clone()]
                            ),
                            span,
                        ));
                    }
                }
                if !matches!(self.peek(), Some(Token::Word(w)) if w == "d" || w == "df") {
                    return Ok(Expr {
                        kind: ExprKind::Number(n),
                        span: self.tokens[start].span.clone(),
                    });
                }
                n
            }
            _ => 1,
        };
        let fudge = match self.bump() {
            Some(Spanned {
                token: Token::Word(w),
                ..
            }) if w == "d" || w == "df" => w == "df",
            _ => {
                self.pos -= 1;
                return Err(self.unexpected("a number, a dice group or '('"));
            }
        };
        let count_span = self.tokens[start].span.clone();
        let sides_start = if fudge { self.pos - 1 } else { self.pos };
        let (sides, special) = if fudge {
            (FUDGE_SIDES, Some(Special::Fudge))
        } else if matches!(self.peek(), Some(Token::Percent)) {
            self.pos += 1;
            (PERCENTILE_SIDES, Some(Special::Percentile))
        } else {
            (self.number("the number of sides after 'd'")?, None)
        };
        let sides_span = self.tokens[sides_start].span.clone();
        if count > MAX_DICE_PER_TERM {
            return Err(Error::LimitExceeded {
                cap: "dice per term",
                limit: MAX_DICE_PER_TERM as usize,
                term: self.src[count_span.start..sides_span.end].to_string(),
                span: count_span,
            });
        }
        if count < 1 {
            return Err(Error::invalid_dice(
                "dice count must be at least 1",
                count_span,
            ));
        }
        if !fudge && !(2..=MAX_SIDES).contains(&sides) {
            return Err(Error::invalid_dice(
                format!("sides must be between 2 and {MAX_SIDES}"),
                sides_span,
            ));
        }
        if fudge {
            self.reject_on_fudge(&["r", "rr"], false, "reroll")?;
            self.reject_on_fudge(&[], true, "explode")?;
        }
        let reroll = self.parse_reroll(sides)?;
        let explode = self.parse_explode(sides)?;
        let advantage = self.parse_advantage(count, sides, self.tokens[start].span.start)?;
        let (count, select) = match advantage {
            Some(kind) => (2, Some(Select { kind, n: 1 })),
            None => (count, self.parse_select(count)?),
        };
        self.reject_select_with_advantage(advantage, select)?;
        if fudge {
            self.reject_comparison_on_fudge()?;
        }
        let success = self.parse_count()?;
        let span = self.tokens[start].span.start..self.prev_end();
        self.item_dice += count;
        if self.item_dice > MAX_DICE_PER_EXPRESSION {
            return Err(Error::LimitExceeded {
                cap: "dice per expression",
                limit: MAX_DICE_PER_EXPRESSION as usize,
                term: self.src[span.clone()].to_string(),
                span,
            });
        }
        Ok(Expr {
            kind: ExprKind::Dice(Dice {
                text: self.src[span.clone()].to_string(),
                count,
                sides,
                special,
                reroll,
                explode,
                select,
                success,
            }),
            span,
        })
    }

    fn at_comparison(&self) -> bool {
        matches!(
            self.peek(),
            Some(Token::Gt | Token::Ge | Token::Lt | Token::Le | Token::Eq)
        )
    }

    /// A condition on a face: a comparison operator then a number, or a bare
    /// number meaning equals.
    fn parse_condition(&mut self, what: &str) -> Result<(Cmp, i64), Error> {
        let cmp = match self.peek() {
            Some(Token::Gt) => Cmp::Gt,
            Some(Token::Ge) => Cmp::Ge,
            Some(Token::Lt) => Cmp::Lt,
            Some(Token::Le) => Cmp::Le,
            _ => Cmp::Eq,
        };
        if self.at_comparison() {
            self.pos += 1;
        }
        let value = self.number(what)?;
        Ok((cmp, value))
    }

    /// Optional `r` reroll clause with a condition.
    fn parse_reroll(&mut self, sides: i64) -> Result<Option<Reroll>, Error> {
        let mode = match self.peek() {
            Some(Token::Word(w)) if w == "r" => RerollMode::Once,
            Some(Token::Word(w)) if w == "rr" => RerollMode::Repeat,
            _ => return Ok(None),
        };
        let start = self.tokens[self.pos].span.start;
        self.pos += 1;
        if !self.at_comparison() && !matches!(self.peek(), Some(Token::Number(_))) {
            return Err(self.unexpected(
                "a reroll condition (a number, or a comparison such as <2, <=2, >5, >=5, =3)",
            ));
        }
        let (cmp, value) = self.parse_condition("a number after the reroll condition")?;
        let reroll = Reroll { mode, cmp, value };
        if mode == RerollMode::Repeat && (1..=sides).all(|face| reroll.triggers(face)) {
            let span = start..self.prev_end();
            return Err(Error::InfiniteReroll {
                clause: self.src[span.clone()].to_string(),
                sides,
                span,
            });
        }
        Ok(Some(reroll))
    }

    /// Optional `!` explode clause: `!` alone explodes on the maximum face,
    /// otherwise a comparison (`>`, `>=`, `<`, `<=`, `=`) and a number follow.
    fn parse_explode(&mut self, sides: i64) -> Result<Option<Explode>, Error> {
        if !matches!(self.peek(), Some(Token::Bang)) {
            return Ok(None);
        }
        let start = self.tokens[self.pos].span.start;
        self.pos += 1;
        let mode = if matches!(self.peek(), Some(Token::Bang)) {
            self.pos += 1;
            ExplodeMode::Compound
        } else if matches!(self.peek(), Some(Token::Word(w)) if w == "p") {
            self.pos += 1;
            ExplodeMode::Penetrate
        } else {
            ExplodeMode::Plain
        };
        let (cmp, value) = if self.at_comparison() {
            self.parse_condition("a number after the explode condition")?
        } else {
            (Cmp::Eq, sides)
        };
        let explode = Explode { mode, cmp, value };
        if (1..=sides).all(|face| explode.triggers(face)) {
            let span = start..self.prev_end();
            return Err(Error::InfiniteExplosion {
                clause: self.src[span.clone()].to_string(),
                sides,
                span,
            });
        }
        Ok(Some(explode))
    }

    /// Optional success clause: a comparison operator (`>=`, `>`, `<=`, `<`,
    /// `=`) and a number. A bare number is not a success clause.
    fn parse_count(&mut self) -> Result<Option<Success>, Error> {
        if !self.at_comparison() {
            if matches!(self.peek(), Some(Token::Word(w)) if w == "f") {
                return Err(Error::syntax(
                    "a failure clause 'f' must follow a success clause, as in 6d10>=8f1",
                    self.tokens[self.pos].span.clone(),
                ));
            }
            return Ok(None);
        }
        let (cmp, value) = self.parse_condition("a number after the success condition")?;
        let failure = if matches!(self.peek(), Some(Token::Word(w)) if w == "f") {
            self.pos += 1;
            if !self.at_comparison() && !matches!(self.peek(), Some(Token::Number(_))) {
                return Err(self.unexpected(
                    "a failure condition (a number, or a comparison such as <=2, >9, =1)",
                ));
            }
            let (cmp, value) = self.parse_condition("a number after the failure condition")?;
            Some(Failure { cmp, value })
        } else {
            None
        };
        Ok(Some(Success {
            cmp,
            value,
            failure,
        }))
    }

    /// Fudge dice have no reroll or explode clause: an error at the clause's
    /// first token (a word in `words`, or `!` when `bang` is set).
    fn reject_on_fudge(&self, words: &[&str], bang: bool, what: &str) -> Result<(), Error> {
        let hit = match self.peek() {
            Some(Token::Word(w)) => words.contains(&w.as_str()),
            Some(Token::Bang) => bang,
            _ => false,
        };
        if hit {
            return Err(Error::invalid_dice(
                format!("{what} clauses are not supported on fudge dice"),
                self.tokens[self.pos].span.clone(),
            ));
        }
        Ok(())
    }

    /// Fudge dice have no success clause.
    fn reject_comparison_on_fudge(&self) -> Result<(), Error> {
        if self.at_comparison() {
            return Err(Error::invalid_dice(
                "success clauses are not supported on fudge dice",
                self.tokens[self.pos].span.clone(),
            ));
        }
        Ok(())
    }

    /// Optional `adv`/`dis` suffix: sugar for rolling two dice and keeping
    /// the highest or lowest.
    fn parse_advantage(
        &mut self,
        count: i64,
        sides: i64,
        term_start: usize,
    ) -> Result<Option<SelectKind>, Error> {
        let (word, kind, keep) = match self.peek() {
            Some(Token::Word(w)) if w == "adv" => ("adv", SelectKind::KeepHighest, "highest"),
            Some(Token::Word(w)) if w == "dis" => ("dis", SelectKind::KeepLowest, "lowest"),
            _ => return Ok(None),
        };
        self.pos += 1;
        if count != 1 {
            let letters = &kind_letters(kind);
            return Err(Error::invalid_dice(
                format!(
                    "'{word}' applies to exactly one die; write d{sides}{word}, or 2d{sides}{letters}1 to keep the {keep} of two"
                ),
                term_start..self.prev_end(),
            ));
        }
        Ok(Some(kind))
    }

    /// `adv`/`dis` already keep one die, so a keep/drop clause on either side
    /// of it is an error pointing at whichever came second.
    fn reject_select_with_advantage(
        &self,
        advantage: Option<SelectKind>,
        select: Option<Select>,
    ) -> Result<(), Error> {
        let word = match (advantage, select, self.peek()) {
            // `adv` then `dl`/`dh`/`kl`/`kh`: the clause that follows.
            (Some(kind), _, Some(Token::Word(w))) if is_select_word(w) => {
                (kind_name(kind), self.tokens[self.pos].span.clone())
            }
            // `kh1` then `adv`/`dis`.
            (None, Some(_), Some(Token::Word(w))) if w == "adv" || w == "dis" => {
                (w.clone(), self.tokens[self.pos].span.clone())
            }
            _ => return Ok(()),
        };
        Err(Error::invalid_dice(
            format!(
                "'{}' already keeps one die, so it cannot be combined with dl, dh, kl or kh",
                word.0
            ),
            word.1,
        ))
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

fn is_select_word(w: &str) -> bool {
    matches!(w, "dl" | "dh" | "kl" | "kh")
}

fn kind_name(kind: SelectKind) -> String {
    match kind {
        SelectKind::KeepHighest => "adv".into(),
        _ => "dis".into(),
    }
}

fn kind_letters(kind: SelectKind) -> &'static str {
    match kind {
        SelectKind::DropLowest => "dl",
        SelectKind::DropHighest => "dh",
        SelectKind::KeepLowest => "kl",
        SelectKind::KeepHighest => "kh",
    }
}

/// A success count is its own kind of result and cannot be an operand.
fn reject_count(operand: &Expr) -> Result<(), Error> {
    if operand.is_count() {
        return Err(Error::CountInArithmetic {
            span: operand.span.clone(),
        });
    }
    Ok(())
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
        Token::Bang => "'!'".into(),
        Token::Percent => "'%'".into(),
        Token::Gt => "'>'".into(),
        Token::Ge => "'>='".into(),
        Token::Lt => "'<'".into(),
        Token::Le => "'<='".into(),
        Token::Eq => "'='".into(),
        Token::Label(_) => "a label".into(),
    }
}
