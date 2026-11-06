//! Parser: tokens to [`Item`]s.
//!
//! An item is an arithmetic expression over dice groups and numbers, parsed by
//! precedence climbing. The v1 shape (a dice group plus a flat modifier) is
//! just the simplest such expression.

use crate::ast::{
    BinOp, Clauses, Cmp, Dice, Explode, ExplodeMode, Expr, ExprKind, Failure, Formula, Item,
    Reroll, RerollMode, Role, Select, SelectKind, Special, Success,
};
use crate::error::Error;
use crate::eval::apply;
use crate::limits::{
    Cap, MAX_DEPTH, MAX_DICE_PER_EXPRESSION, MAX_DICE_PER_TERM, MAX_REPEAT, MAX_SIDES,
};
/// `d%` is a d100.
const PERCENTILE_SIDES: i64 = 100;

use crate::lexer::{tokenize, Spanned, Token};

/// Parses a whole formula (comma-separated items) into items.
pub fn parse(src: &str) -> Result<Formula, Error> {
    parse_with(src, &|_| None)
}

/// A variable lookup: lowercase name to value.
pub type Lookup<'a> = &'a dyn Fn(&str) -> Option<i64>;

/// Like [`parse`], with `@name` variables resolved through `vars` before
/// parsing. A resolved variable becomes a number token that keeps the span of
/// the `@name`, so errors still underline it.
pub fn parse_with(src: &str, vars: Lookup<'_>) -> Result<Formula, Error> {
    let mut tokens = tokenize(src)?;
    let mut bound = Vec::new();
    for t in &mut tokens {
        if let Token::Var(name) = &t.token {
            let value = vars(name).ok_or_else(|| Error::UndefinedVariable {
                name: name.clone(),
                span: t.span.clone(),
            })?;
            bound.push((name.clone(), value, t.span.clone()));
            t.token = Token::Number(value);
        }
    }
    parse_tokens(src, tokens).map_err(|error| {
        let span = error.span();
        let bindings: Vec<(String, i64)> = bound
            .iter()
            .filter(|(_, _, at)| at.start < span.end && span.start < at.end)
            .map(|(name, value, _)| (name.clone(), *value))
            .collect();
        if bindings.is_empty() {
            error
        } else {
            Error::WithVariables {
                inner: Box::new(error),
                bindings,
            }
        }
    })
}

/// Like [`parse_with`], then evaluates what needs no dice: the arithmetic
/// between numbers (and variables), so division by zero and overflow are
/// reported as rolling would, without an RNG. Items are checked in the order
/// rolling evaluates them.
pub fn check_with(src: &str, vars: Lookup<'_>) -> Result<(), Error> {
    for item in &parse_with(src, vars)?.items {
        fold(&item.expr)?;
    }
    Ok(())
}

/// The value of `expr` if it does not depend on any die, reporting the
/// errors rolling would certainly hit. Mirrors `eval::evaluate`'s order.
fn fold(expr: &Expr) -> Result<Option<i64>, Error> {
    match &expr.kind {
        ExprKind::Number(n) => Ok(Some(*n)),
        ExprKind::Dice(_) => Ok(None),
        ExprKind::Group(inner) => fold(inner),
        ExprKind::Neg(inner) => match fold(inner)? {
            Some(v) => v.checked_neg().map(Some).ok_or(Error::Overflow {
                span: expr.span.clone(),
            }),
            None => Ok(None),
        },
        ExprKind::Chain { first, rest } => {
            let first_span = first.span.clone();
            let mut total = fold(first)?;
            for (op, operand) in rest {
                let rhs = fold(operand)?;
                let span = first_span.start..operand.span.end;
                total = match (total, rhs) {
                    (Some(l), Some(r)) => Some(apply(*op, l, r, span, operand.span.clone())?),
                    (_, Some(0)) if *op == BinOp::Div => {
                        return Err(Error::DivisionByZero {
                            span: operand.span.clone(),
                        })
                    }
                    _ => None,
                };
            }
            Ok(total)
        }
    }
}

fn parse_tokens(src: &str, tokens: Vec<Spanned>) -> Result<Formula, Error> {
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
                return Err(Error::limit_exceeded(Cap::Repeat, &src[span.clone()], span));
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
        let role = match parser.peek() {
            Some(Token::Word(w)) if w == "atk" || w == "dmg" => {
                let role = if w == "atk" {
                    Role::Attack
                } else {
                    Role::Damage
                };
                parser.pos += 1;
                Some(role)
            }
            _ => None,
        };
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
            role,
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
    if repeat.is_some() && !items.iter().any(|item| item.expr.has_dice()) {
        let span = tokens[0].span.start..tokens[1].span.end;
        let body = src[span.end..].trim().to_string();
        let multiplication = match items.as_slice() {
            [Item { label: None, .. }] => {
                Some(format!("{}*{body}", src[tokens[0].span.clone()].trim()))
            }
            _ => None,
        };
        return Err(Error::RepeatWithoutDice {
            body,
            multiplication,
            span,
        });
    }
    Ok(Formula { repeat, items })
}

struct Parser<'a> {
    src: &'a str,
    tokens: &'a [Spanned],
    pos: usize,
    end: usize,
    /// Parentheses and unary minus signs currently open.
    depth: i64,
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
            Some(t) => {
                // A variable already resolved to a number is still a variable
                // to the person who typed it.
                let found = match self.src.get(t.span.clone()) {
                    Some(text) if text.starts_with('@') => format!("variable {text}"),
                    _ => describe(&t.token),
                };
                Error::syntax(
                    format!("expected {expected}, found {found}"),
                    t.span.clone(),
                )
            }
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
            return Err(Error::limit_exceeded(
                Cap::NestingDepth,
                format!("{shown}{more}"),
                at..at + len,
            ));
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
        };
        let count_span = self.tokens[start].span.clone();
        let sides_start = self.pos;
        let (sides, special) = if matches!(self.peek(), Some(Token::Percent)) {
            self.pos += 1;
            (PERCENTILE_SIDES, Some(Special::Percentile))
        } else {
            (self.number("the number of sides after 'd'")?, None)
        };
        let sides_span = self.tokens[sides_start].span.clone();
        if count > MAX_DICE_PER_TERM {
            return Err(Error::limit_exceeded(
                Cap::DicePerTerm,
                &self.src[count_span.start..sides_span.end],
                count_span,
            ));
        }
        if count < 1 {
            return Err(Error::invalid_dice(
                "dice count must be at least 1",
                count_span,
            ));
        }
        if !(2..=MAX_SIDES).contains(&sides) {
            return Err(Error::invalid_dice(
                format!("sides must be between 2 and {MAX_SIDES}"),
                sides_span,
            ));
        }
        let reroll_start = self.next_start();
        let reroll = self.parse_reroll(sides)?;
        let reroll_text = self.clause_text(reroll_start, reroll.is_some());
        let explode_start = self.next_start();
        let explode = self.parse_explode(sides)?;
        let explode_text = self.clause_text(explode_start, explode.is_some());
        let select_start = self.next_start();
        let advantage = self.parse_advantage(count, sides, self.tokens[start].span.start)?;
        let (count, select) = match advantage {
            Some(kind) => (2, Some(Select { kind, n: 1 })),
            None => (count, self.parse_select(count)?),
        };
        let select_text = self.clause_text(select_start, select.is_some());
        self.reject_select_with_advantage(advantage, select)?;
        let success_start = self.next_start();
        let success = self.parse_count()?;
        let success_text = self.clause_text(success_start, success.is_some());
        let span = self.tokens[start].span.start..self.prev_end();
        self.item_dice += count;
        if self.item_dice > MAX_DICE_PER_EXPRESSION {
            return Err(Error::limit_exceeded(
                Cap::DicePerExpression,
                &self.src[span.clone()],
                span,
            ));
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
                clauses: Clauses {
                    reroll: reroll_text,
                    explode: explode_text,
                    select: select_text,
                    success: success_text,
                },
            }),
            span,
        })
    }

    /// Byte offset where the next token starts (the end of the source when
    /// there is none).
    fn next_start(&self) -> usize {
        self.tokens
            .get(self.pos)
            .map_or(self.src.len(), |t| t.span.start)
    }

    /// The source of the clause parsed since `start`, if there was one.
    fn clause_text(&self, start: usize, present: bool) -> Option<String> {
        present.then(|| self.src[start..self.prev_end()].to_string())
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
        Token::Var(name) => format!("variable @{name}"),
        Token::Label(_) => "a label".into(),
    }
}
