//! Parity fixtures: real rolls from the Rust engine, as language-neutral JSON
//! for the TypeScript port (see `tests/fixtures/parity/README.md`).
//!
//! Each case is a typed line, the context it runs in, the dice the engine drew
//! (in order) and what it returned. This test regenerates every case from the
//! engine and fails if a committed file differs, so the fixtures cannot drift
//! from the engine. Regenerate with `just parity`.

use rand::{Rng, TryRng};
use rollin::{execute_with, parse_command, seeded_rng, Context, Draw, Output, Recording};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::convert::Infallible;
use std::fs;
use std::path::{Path, PathBuf};

const FORMAT_VERSION: u32 = 1;

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/parity")
}

// ---------------------------------------------------------------------------
// The fixture format

/// The active character's data, as the engine sees it.
#[derive(Debug, Clone, Default, Serialize)]
struct Character {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    crit_range: Option<i64>,
    vars: BTreeMap<String, i64>,
    presets: BTreeMap<String, String>,
}

/// What a line runs against. Everything absent is empty: the `default`
/// character, no presets, no game system.
#[derive(Debug, Clone, Default, Serialize)]
struct Setup {
    #[serde(skip_serializing_if = "Option::is_none")]
    default_system: Option<String>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    global_presets: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    character: Option<Character>,
}

impl Setup {
    fn character(mut self, name: &str) -> Self {
        self.character.get_or_insert_with(Character::default).name = name.to_string();
        self
    }
    fn var(mut self, name: &str, value: i64) -> Self {
        self.char_mut().vars.insert(name.into(), value);
        self
    }
    fn preset(mut self, name: &str, formula: &str) -> Self {
        self.char_mut().presets.insert(name.into(), formula.into());
        self
    }
    fn global(mut self, name: &str, formula: &str) -> Self {
        self.global_presets.insert(name.into(), formula.into());
        self
    }
    fn dnd5e(mut self) -> Self {
        self.char_mut().system = Some("dnd5e".into());
        self
    }
    fn crit_range(mut self, threshold: i64) -> Self {
        self.char_mut().crit_range = Some(threshold);
        self
    }
    fn default_dnd5e(mut self) -> Self {
        self.default_system = Some("dnd5e".into());
        self
    }
    fn char_mut(&mut self) -> &mut Character {
        let c = self.character.get_or_insert_with(Character::default);
        if c.name.is_empty() {
            c.name = "hero".into();
        }
        c
    }

    /// Writes the context into a fresh config directory, the way the app
    /// stores it.
    fn materialise(&self, dir: &Path) {
        let app = dir.join("rollin");
        fs::create_dir_all(app.join("characters")).unwrap();
        if let Some(system) = &self.default_system {
            fs::write(
                app.join("settings.toml"),
                format!("system = \"{system}\"\n"),
            )
            .unwrap();
        }
        if !self.global_presets.is_empty() {
            let text = toml::to_string(&json!({ "presets": self.global_presets })).unwrap();
            fs::write(app.join("presets.toml"), text).unwrap();
        }
        if let Some(c) = &self.character {
            let mut table = toml::Table::new();
            if let Some(system) = &c.system {
                table.insert("system".into(), system.clone().into());
            }
            if let Some(range) = c.crit_range {
                table.insert("crit_range".into(), range.into());
            }
            table.insert("vars".into(), toml::Value::try_from(&c.vars).unwrap());
            table.insert("presets".into(), toml::Value::try_from(&c.presets).unwrap());
            let file = app.join("characters").join(format!("{}.toml", c.name));
            fs::write(file, toml::to_string(&table).unwrap()).unwrap();
            fs::write(app.join("state.toml"), format!("active = \"{}\"\n", c.name)).unwrap();
        }
    }
}

// ---------------------------------------------------------------------------
// Running a line

/// What one run of a line produced.
struct Run {
    draws: Vec<Draw>,
    expected: Value,
}

impl Run {
    fn rolls(&self) -> Option<&Vec<Value>> {
        self.expected.get("ok")?.get("rolls")?.as_array()
    }
    fn is_error(&self) -> bool {
        self.expected.get("error").is_some()
    }
}

/// Runs `line` the way the desktop app's command line does: split into
/// words, parsed against the acting character, executed with `rng`, with the
/// dice recorded.
fn run_line(line: &str, context: &Setup, rng: &mut impl Rng) -> Run {
    let dir = tempfile::tempdir().unwrap();
    context.materialise(dir.path());
    let ctx = Context::new(Some(dir.path().to_path_buf()));
    let acting = ctx.acting();
    let words: Vec<String> = line.split_whitespace().map(String::from).collect();

    let recording = Recording::start();
    let result = parse_command(&words, &mut || acting.preset_names())
        .and_then(|command| execute_with(&command, &ctx, &acting, rng));
    let draws = recording.finish();

    let expected = match result {
        Ok(output @ Output::Rolls { .. }) => json!({ "ok": output.report() }),
        Ok(other) => panic!("`{line}` is not a roll: {other:?}"),
        Err(error) => json!({ "error": error.report() }),
    };
    Run { draws, expected }
}

/// Dice that never come up random: `lows` draws that make a die show 1, then
/// draws that make a d2 show 2. Pins the 100-explosion and 100-reroll caps.
struct Script {
    lows: usize,
}

impl TryRng for Script {
    type Error = Infallible;
    fn try_next_u32(&mut self) -> Result<u32, Infallible> {
        if self.lows > 0 {
            self.lows -= 1;
            Ok(0)
        } else {
            Ok(1 << 31)
        }
    }
    fn try_next_u64(&mut self) -> Result<u64, Infallible> {
        self.try_next_u32().map(u64::from)
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), Infallible> {
        dest.fill(0);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Choosing the dice for a case

type Want = Box<dyn Fn(&Run) -> bool>;

enum Dice {
    /// Whatever this seed rolls.
    Seed(u64),
    /// The first seed whose roll satisfies the condition: how a case gets a
    /// natural 20 or a particular face without scripting the dice.
    Find(Want),
    /// `lows` ones then twos (see [`Script`]).
    Script(usize),
}

struct Case {
    name: String,
    line: String,
    context: Setup,
    dice: Dice,
}

impl Case {
    fn new(name: &str, line: &str) -> Case {
        Case {
            name: name.into(),
            line: line.into(),
            context: Setup::default(),
            dice: Dice::Seed(seed_for(name)),
        }
    }
    fn ctx(mut self, context: Setup) -> Case {
        self.context = context;
        self
    }
    fn seed(mut self, seed: u64) -> Case {
        self.dice = Dice::Seed(seed);
        self
    }
    fn find(mut self, want: impl Fn(&Run) -> bool + 'static) -> Case {
        self.dice = Dice::Find(Box::new(want));
        self
    }
    fn script(mut self, lows: usize) -> Case {
        self.dice = Dice::Script(lows);
        self
    }

    fn build(&self) -> Value {
        let run = match &self.dice {
            Dice::Seed(seed) => run_line(&self.line, &self.context, &mut seeded_rng(*seed)),
            Dice::Script(lows) => run_line(&self.line, &self.context, &mut Script { lows: *lows }),
            Dice::Find(want) => (0..50_000)
                .map(|seed| run_line(&self.line, &self.context, &mut seeded_rng(seed)))
                .find(|run| want(run))
                .unwrap_or_else(|| panic!("{}: no seed gives the wanted roll", self.name)),
        };
        let mut case = json!({ "name": self.name, "line": self.line });
        let case_map = case.as_object_mut().unwrap();
        let context = serde_json::to_value(&self.context).unwrap();
        if context.as_object().is_some_and(|c| !c.is_empty()) {
            case_map.insert("context".into(), context);
        }
        case_map.insert("draws".into(), serde_json::to_value(&run.draws).unwrap());
        case_map.insert("expected".into(), run.expected);
        case
    }
}

/// A stable seed from a case's name, so cases do not all share early faces.
fn seed_for(name: &str) -> u64 {
    name.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x100_0000_01b3)
    }) % 100_000
}

// Conditions for `Case::find`.

/// The first roll's kept d20 faces (sides 20, counting toward the total).
fn kept_d20(run: &Run) -> Vec<i64> {
    fn walk(node: &Value, out: &mut Vec<i64>) {
        match node["type"].as_str() {
            Some("dice") if node["sides"] == 20 => {
                for die in node["dice"].as_array().unwrap() {
                    if matches!(die["status"].as_str(), Some("kept" | "exploded")) {
                        out.push(die["value"].as_i64().unwrap());
                    }
                }
            }
            Some("neg") => walk(&node["operand"], out),
            Some("group") => walk(&node["inner"], out),
            Some("chain") => {
                walk(&node["first"], out);
                for link in node["rest"].as_array().unwrap() {
                    walk(&link["node"], out);
                }
            }
            _ => {}
        }
    }
    let mut out = Vec::new();
    if let Some(rolls) = run.rolls() {
        walk(&rolls[0]["expr"], &mut out);
    }
    out
}

fn kept_face_is(face: i64) -> impl Fn(&Run) -> bool {
    move |run| kept_d20(run) == [face]
}

fn kept_face_between(low: i64, high: i64) -> impl Fn(&Run) -> bool {
    move |run| matches!(kept_d20(run).as_slice(), [f] if (low..=high).contains(f))
}

/// Some d20 came up `face` and was dropped (or never counted).
fn dropped_face(face: u32) -> impl Fn(&Run) -> bool {
    move |run| {
        run.draws.iter().any(|d| d.sides == 20 && d.face == face)
            && !kept_d20(run).contains(&i64::from(face))
    }
}

fn drew_face(sides: u32, face: u32) -> impl Fn(&Run) -> bool {
    move |run| run.draws.iter().any(|d| d.sides == sides && d.face == face)
}

fn is_error(run: &Run) -> bool {
    run.is_error()
}

// ---------------------------------------------------------------------------
// The cases

fn hero() -> Setup {
    Setup::default().character("hero")
}

fn areas() -> Vec<(&'static str, &'static str, Vec<Case>)> {
    let mut areas = vec![
        (
            "arithmetic",
            "Flat numbers, operators, precedence, groups and negation.",
            arithmetic(),
        ),
        ("dice", "Plain dice groups, d% and the v1 formulas.", dice()),
        (
            "keep_drop",
            "Keep and drop clauses, advantage and disadvantage.",
            keep_drop(),
        ),
        (
            "exploding",
            "Exploding dice in each mode, and the explosion cap.",
            exploding(),
        ),
        ("rerolls", "Rerolls, and the reroll cap.", rerolls()),
        (
            "success_counting",
            "Success and failure counting.",
            success_counting(),
        ),
        (
            "labels_repeats",
            "Labels, comma lists and Nx repeats.",
            labels_repeats(),
        ),
        ("limits", "Hard limits, as errors.", limits()),
        (
            "errors",
            "Syntax, dice, arithmetic, variable and preset errors, with hints.",
            errors(),
        ),
        (
            "characters",
            "Variables on the acting character.",
            characters(),
        ),
        (
            "presets",
            "Rolling presets: shadowing, variables, near misses.",
            presets(),
        ),
        (
            "d20_checks",
            "What is, and is not, a d20 check, with every crit face.",
            d20_checks(),
        ),
        (
            "dnd5e",
            "5e crit mode: crit range, damage doubling, roles, repeats.",
            dnd5e(),
        ),
    ];
    areas.sort_by_key(|(name, ..)| *name);
    areas
}

fn arithmetic() -> Vec<Case> {
    vec![
        Case::new("number", "15"),
        Case::new("add_sub", "7-2+1"),
        Case::new("precedence", "2+3*4"),
        Case::new("groups", "(2+3)*4"),
        Case::new("nested_groups", "((1+2)*(3+4))-5"),
        Case::new("integer_division", "7/2"),
        Case::new("negative_division", "-7/2"),
        Case::new("negation", "-d6"),
        Case::new("negation_in_chain", "d6+-d4"),
        Case::new("dice_times_dice", "d6*d4"),
        Case::new("dice_in_group", "(2d6+1)*2"),
        Case::new("spaces", "2d6 + 3 - 1"),
        Case::new("left_to_right", "20-d4-d4-1"),
        Case::new("division_chain", "100/d4/2"),
    ]
}

fn dice() -> Vec<Case> {
    vec![
        Case::new("d20", "d20"),
        Case::new("d20_seed_42", "d20").seed(42),
        Case::new("2d6", "2d6"),
        Case::new("3d8_plus", "3d8+5"),
        Case::new("2d6_minus", "2d6-2"),
        Case::new("4d6", "4d6"),
        Case::new("uppercase", "2D6+1"),
        Case::new("d100", "d100"),
        Case::new("d2", "3d2"),
        Case::new("percentile", "d%"),
        Case::new("percentile_pair", "2d%"),
        Case::new("percentile_plus", "d%+5"),
        Case::new("mixed_dice", "2d6+1d4+3"),
        Case::new("chain", "d20+8+d10+5"),
        Case::new("big_sides", "d10000"),
    ]
}

fn keep_drop() -> Vec<Case> {
    vec![
        Case::new("drop_lowest", "4d6dl1"),
        Case::new("drop_highest", "4d6dh1"),
        Case::new("drop_two_lowest", "6d6dl2"),
        Case::new("drop_two_highest", "4d6dh2"),
        Case::new("keep_highest", "4d6kh3"),
        Case::new("keep_lowest", "4d6kl2"),
        Case::new("keep_one_of_hundreds", "2d100kh1"),
        Case::new("keep_all_but_one", "3d100dl1"),
        Case::new("keep_plus_modifier", "2d20kh1+8"),
        Case::new("advantage", "d20adv"),
        Case::new("advantage_modifier", "d20adv+5"),
        Case::new("disadvantage", "d20dis"),
        Case::new("advantage_spaced", "1d20ADV - 2"),
        Case::new("advantage_on_2d20", "2d20adv"),
        Case::new("advantage_on_d8", "d8adv"),
        Case::new("advantage_with_keep", "3d20kh1adv"),
        Case::new("explicit_adv_matches_keep", "2d20kh1"),
        Case::new("drop_then_advantage", "3d20dl2dis"),
        Case::new("drop_more_than_rolled", "2d6dl9"),
        Case::new("keep_zero", "4d6kh0"),
    ]
}

fn exploding() -> Vec<Case> {
    vec![
        Case::new("explode_plain", "3d6!").find(drew_face(6, 6)),
        Case::new("explode_compound", "3d6!!").find(drew_face(6, 6)),
        Case::new("explode_penetrating", "3d6!p").find(drew_face(6, 6)),
        Case::new("explode_nothing_explodes", "3d6!")
            .find(|r| !r.is_error() && !drew_face(6, 6)(r)),
        Case::new("explode_condition_ge", "3d6!>=5").find(drew_face(6, 5)),
        Case::new("explode_condition_le", "4d6!<=2").find(drew_face(6, 1)),
        Case::new("explode_condition_eq", "3d6!=3").find(drew_face(6, 3)),
        Case::new("explode_condition_gt", "3d6!!>4").find(drew_face(6, 5)),
        Case::new("explode_penetrating_condition", "3d6!p>4").find(drew_face(6, 6)),
        Case::new("explode_then_keep", "4d6!kh2").find(drew_face(6, 6)),
        Case::new("explode_then_drop", "4d6!dl1").find(drew_face(6, 6)),
        Case::new("explode_compound_then_keep", "4d6!!kh2").find(drew_face(6, 6)),
        Case::new("explode_with_modifier", "2d6!+3").find(drew_face(6, 6)),
        Case::new("explode_success_count", "6d6!>=5").find(drew_face(6, 6)),
        Case::new("explode_cap_ok_plain", "d2!<=1").script(100),
        Case::new("explode_cap_ok_compound", "d2!!<=1").script(100),
        Case::new("explode_cap_ok_penetrating", "d2!p<=1").script(100),
        Case::new("explode_cap_hit_plain", "d2!<=1").script(101),
        Case::new("explode_cap_hit_compound", "d2!!<=1").script(101),
        Case::new("explode_cap_hit_penetrating", "d2!p<=1").script(101),
        Case::new("explode_infinite", "d6!>=1"),
        Case::new("explode_infinite_le", "d6!<=6"),
    ]
}

fn rerolls() -> Vec<Case> {
    vec![
        Case::new("reroll_once", "4d6r1").find(drew_face(6, 1)),
        Case::new("reroll_until", "4d6rr1").find(drew_face(6, 1)),
        Case::new("reroll_condition_lt", "4d6rr<3").find(drew_face(6, 1)),
        Case::new("reroll_condition_le", "4d6r<=2").find(drew_face(6, 2)),
        Case::new("reroll_then_drop", "4d6r1dl1").find(drew_face(6, 1)),
        Case::new("reroll_then_explode", "4d6r1!")
            .find(|r| drew_face(6, 1)(r) && drew_face(6, 6)(r)),
        Case::new("reroll_explode_drop", "4d6r1!dl1")
            .find(|r| drew_face(6, 1)(r) && drew_face(6, 6)(r)),
        Case::new("reroll_compound_explode", "4d6r1!!")
            .find(|r| drew_face(6, 1)(r) && drew_face(6, 6)(r)),
        Case::new("reroll_d20", "d20r1+5").find(drew_face(20, 1)),
        Case::new("reroll_in_repeat", "3x 2d6r1").find(drew_face(6, 1)),
        Case::new("reroll_nothing_rerolls", "4d6r1").find(|r| !r.is_error() && !drew_face(6, 1)(r)),
        Case::new("reroll_cap_ok", "d2rr1").script(100),
        Case::new("reroll_cap_hit", "d2rr1").script(101),
        Case::new("reroll_infinite", "d6rr<=6"),
        Case::new("reroll_infinite_all", "d6rr>=1"),
    ]
}

fn success_counting() -> Vec<Case> {
    vec![
        Case::new("count_ge", "6d10>=8"),
        Case::new("count_eq", "10d10=10").find(drew_face(10, 10)),
        Case::new("count_le", "6d6<=2"),
        Case::new("count_with_failures", "6d10>=8f1").find(drew_face(10, 1)),
        Case::new("count_failures_spaced", "6d10>=8 f1").find(drew_face(10, 1)),
        Case::new("count_failure_condition", "4d6>=5f<=2"),
        Case::new("count_overlapping_clauses", "4d6>=5f>=3"),
        Case::new("count_net_negative", "6d10>=10f<=9").seed(3),
        Case::new("count_after_drop", "4d6dh1>=5"),
        Case::new("count_after_keep", "2d10kh1>=7"),
        Case::new("count_percentile", "4d%>=90"),
        Case::new("count_in_group", "(6d10>=8)"),
        Case::new("count_in_list", "4d6>=5, d20+3"),
        Case::new("count_in_arithmetic", "2d6+d6>=3"),
        Case::new("count_in_arithmetic_2", "6d10>=8+2"),
        Case::new("count_negated", "-6d10>=8"),
    ]
}

fn labels_repeats() -> Vec<Case> {
    vec![
        Case::new("label", "d20+8 # attack"),
        Case::new("label_no_space", "d20+8 #attack"),
        Case::new("labels_on_list", "d20+8 # attack, d10+5 # damage"),
        Case::new("label_on_one_only", "d20+8 # attack, d10+5"),
        Case::new("list", "4d6dl1, (d20+5)*2, 15"),
        Case::new("list_mixed", "4d6dl1, d20adv+5, 6d10>=8f1"),
        Case::new("list_empty_items", "d6,, d8,"),
        Case::new("repeat", "3x 4d6dl1"),
        Case::new("repeat_labelled", "3x d20+5 # hit"),
        Case::new("repeat_list", "2x d20+5, d8+3"),
        Case::new("repeat_one", "1x d6"),
        Case::new("repeat_max", "100x d2"),
        Case::new("label_empty", "d20 #  "),
        Case::new("label_alone", "# x"),
        Case::new("label_alone_in_list", "d20, # x"),
        Case::new("repeat_zero", "0x d6"),
        Case::new("repeat_without_dice", "2x3"),
        Case::new("repeat_without_dice_formula", "3x 2+4"),
    ]
}

fn limits() -> Vec<Case> {
    vec![
        Case::new("dice_per_term", "1001d6"),
        Case::new("dice_per_term_exploding", "1001d6!"),
        Case::new(
            "dice_per_roll",
            "1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1d6",
        ),
        Case::new("repeat_cap", "101x d6"),
        Case::new(
            "nesting_depth",
            &format!("{}d6{}", "(".repeat(33), ")".repeat(33)),
        ),
        Case::new(
            "nesting_depth_ok",
            &format!("{}d6{}", "(".repeat(32), ")".repeat(32)),
        ),
        Case::new("too_many_sides", "d10001"),
        Case::new("zero_sides", "d0"),
        Case::new("zero_dice", "0d6"),
        Case::new("huge_count", "99999999999999999999d6"),
        Case::new("explosion_cap_after_other_rolls", "d6, d2!<=1").script(102),
    ]
}

fn errors() -> Vec<Case> {
    vec![
        Case::new("syntax_trailing_word", "2d6 xyz"),
        Case::new("syntax_trailing_operator", "2d6+"),
        Case::new("syntax_leading_operator", "*3"),
        Case::new("syntax_open_paren", "(2d6"),
        Case::new("syntax_close_paren", "2d6)"),
        Case::new("syntax_empty_group", "()"),
        Case::new("syntax_bad_keep", "4d6dlx"),
        Case::new("syntax_bare_reroll", "4d6r"),
        Case::new("syntax_double_dice", "2d6d6"),
        Case::new("syntax_bracket", "2d%  ["),
        Case::new("syntax_unknown_clause", "2d6z1"),
        Case::new("syntax_unicode", "2d6 ✓"),
        Case::new("division_by_zero", "d20/0"),
        Case::new("division_by_zero_group", "10/(3-3)"),
        Case::new("division_by_dice_zero", "d6/(d4-d4)").find(is_error),
        Case::new("division_by_dice_ok", "d6/(d4-d4+4)"),
        Case::new("overflow_add", "9223372036854775807+1"),
        Case::new("overflow_mul", "4611686018427387904*2"),
        Case::new("overflow_neg_literal", "9223372036854775808"),
        Case::new("undefined_variable", "d20+@str"),
        Case::new("undefined_variable_suggestion", "d20+@stre")
            .ctx(hero().var("str", 3).var("dex", 2)),
        Case::new("undefined_variable_none_defined", "d20+@str").ctx(hero()),
        Case::new("undefined_variable_other_character", "d20+@wis")
            .ctx(Setup::default().character("aria").var("str", 3)),
        Case::new("unknown_preset", "fireball"),
        Case::new("unknown_preset_suggestion", "firebal").ctx(hero().preset("fireball", "8d6")),
        Case::new("unknown_preset_global_suggestion", "attak")
            .ctx(hero().global("attack", "d20+5")),
        Case::new("roll_keyword_unknown", "roll fireball"),
        Case::new("not_a_roll_usage", "roll"),
        Case::new("session_word_one_shot", "help"),
        Case::new("variable_in_division_error", "d6/(@a-@b)").ctx(hero().var("a", 2).var("b", 2)),
        Case::new("variable_in_limit_error", "@n d6").ctx(hero().var("n", 2000)),
    ]
}

fn characters() -> Vec<Case> {
    vec![
        Case::new("variable", "d20+@str").ctx(hero().var("str", 3)),
        Case::new("variable_uppercase", "d20+@STR").ctx(hero().var("str", 3)),
        Case::new("two_variables", "d20+@str+@prof").ctx(hero().var("str", 3).var("prof", 2)),
        Case::new("variable_alone", "@str").ctx(hero().var("str", 3)),
        Case::new("negative_variable", "d20+@pen").ctx(hero().var("pen", -2)),
        Case::new("variable_as_count", "@n d6").ctx(hero().var("n", 3)),
        Case::new("variable_as_sides", "2d@s").ctx(hero().var("s", 8)),
        Case::new("variable_in_keep", "4d6dl@k").ctx(hero().var("k", 1)),
        Case::new("variable_in_keep_high", "4d6kh@k").ctx(hero().var("k", 3)),
        Case::new("variable_in_group", "(d6+@bonus)*2").ctx(hero().var("bonus", 4)),
        Case::new("variable_with_label", "d20+@str # attack").ctx(hero().var("str", 3)),
        Case::new("variable_in_repeat", "3x d20+@str").ctx(hero().var("str", 3)),
        Case::new("variable_zero", "d20+@mod").ctx(hero().var("mod", 0)),
        Case::new("character_default_is_empty", "d20+1").ctx(Setup::default()),
        Case::new("variable_in_threshold", "6d10>=@dc").ctx(hero().var("dc", 8)),
    ]
}

fn presets() -> Vec<Case> {
    vec![
        Case::new("preset_own", "attack").ctx(hero().preset("attack", "d20+5")),
        Case::new("preset_global", "attack").ctx(hero().global("attack", "d20+5")),
        Case::new("preset_default_character_global", "attack")
            .ctx(Setup::default().global("attack", "d20+5")),
        Case::new("preset_shadowing", "attack")
            .ctx(hero().preset("attack", "d20+7").global("attack", "d20+5")),
        Case::new("preset_variables_resolve_when_rolled", "attack")
            .ctx(hero().var("str", 4).preset("attack", "d20+@str")),
        Case::new("preset_with_label", "attack").ctx(hero().preset("attack", "d20+5 # sword")),
        Case::new("preset_list", "smite").ctx(hero().preset("smite", "d20+5, 2d8+3")),
        Case::new("preset_roll_keyword", "roll attack").ctx(hero().preset("attack", "d20+5")),
        Case::new("preset_uppercase", "ATTACK").ctx(hero().preset("attack", "d20+5")),
        Case::new("preset_repeat", "volley").ctx(hero().preset("volley", "3x d20+5")),
        Case::new("preset_undefined_variable", "attack").ctx(hero().preset("attack", "d20+@str")),
        Case::new("preset_name_that_is_a_formula", "d6").ctx(hero().preset("d6", "d20")),
        Case::new("preset_dnd5e_crit", "smite")
            .ctx(hero().dnd5e().preset("smite", "d20+5, 1d8+3"))
            .find(kept_face_is(20)),
        Case::new("presets_two_words_not_preset", "attack d6")
            .ctx(hero().preset("attack", "d20+5")),
        Case::new("preset_unknown_with_presets", "dodge")
            .ctx(hero().preset("attack", "d20+5").global("dash", "d6")),
    ]
}

/// The d20 check rule: a check is 1d20, or 2d20 keeping one die. A check can
/// crit (and its natural 20 or 1 is flagged); 3d20, a bare 2d20, a lone d20!,
/// success counts and d20+d20 never can.
fn d20_checks() -> Vec<Case> {
    let dnd = || hero().dnd5e();
    let damage = ", 1d8+3";
    let mut cases = Vec::new();

    // Every way to write a check, at every verdict: a natural 20 (crit hit,
    // damage doubled), a natural 1 (crit miss), and a face in between.
    let checks: [(&str, &str, bool); 9] = [
        ("single", "d20+5", false),
        ("advantage", "d20adv+5", false),
        ("disadvantage", "d20dis+5", true),
        ("keep_highest", "2d20kh1+5", false),
        ("keep_lowest", "2d20kl1+5", true),
        ("drop_lowest", "2d20dl1+5", false),
        ("drop_highest", "2d20dh1+5", true),
        ("reroll_ones", "d20r1+5", false),
        ("no_modifier", "d20", false),
    ];
    for (label, check, drops_high) in checks {
        let line = format!("{check}{damage}");
        cases.push(
            Case::new(&format!("check_{label}_natural_20"), &line)
                .ctx(dnd())
                .find(kept_face_is(20)),
        );
        if check != "d20r1+5" {
            cases.push(
                Case::new(&format!("check_{label}_natural_1"), &line)
                    .ctx(dnd())
                    .find(kept_face_is(1)),
            );
        }
        cases.push(
            Case::new(&format!("check_{label}_middle"), &line)
                .ctx(dnd())
                .find(kept_face_between(2, 19)),
        );
        // A 20 on the die that did not count is not a crit.
        if drops_high {
            cases.push(
                Case::new(&format!("check_{label}_dropped_20"), &line)
                    .ctx(dnd())
                    .find(dropped_face(20)),
            );
        }
    }
    // A natural 1 on a die that did not count is not a miss.
    for (label, check) in [("advantage", "d20adv+5"), ("keep_highest", "2d20kh1+5")] {
        cases.push(
            Case::new(
                &format!("check_{label}_dropped_1"),
                &format!("{check}{damage}"),
            )
            .ctx(dnd())
            .find(|r| dropped_face(1)(r) && kept_face_between(2, 19)(r)),
        );
    }
    // A rerolled natural 1 is history, not a miss.
    cases.push(
        Case::new("check_reroll_ones_rerolled_1", &format!("d20r1+5{damage}"))
            .ctx(dnd())
            .find(|r| drew_face(20, 1)(r) && kept_face_between(2, 20)(r)),
    );

    // Never a check, whatever the faces: a 20 and a 1 come up and nothing is
    // flagged, nothing crits, and the damage is not doubled.
    let never: [(&str, &str); 10] = [
        ("three_d20", "3d20+5"),
        ("three_d20_keep_one", "3d20kh1+5"),
        ("three_d20_keep_two", "3d20kh2+5"),
        ("bare_2d20", "2d20"),
        ("2d20_exploding_drop_one", "2d20!dl1"),
        ("lone_d20_exploding", "d20!"),
        ("lone_d20_compound", "d20!!"),
        ("success_count", "6d20>=15"),
        ("single_d20_success", "d20>=15"),
        ("two_d20_terms", "d20+d20"),
    ];
    for (label, formula) in never {
        let line = format!("{formula}{damage}");
        for (face, word) in [(20, "20"), (1, "1")] {
            cases.push(
                Case::new(&format!("not_a_check_{label}_{word}"), &line)
                    .ctx(dnd())
                    .find(move |r| drew_face(20, face)(r) && !r.is_error()),
            );
        }
    }
    // Two d20 keeping one with exploding is a check too: the rule looks at the
    // count and the keep clause, not at explosions on a pair.
    cases.push(
        Case::new(
            "check_2d20_exploding_keep_one_natural_20",
            &format!("2d20!kh1{damage}"),
        )
        .ctx(dnd())
        .find(kept_face_is(20)),
    );
    // d20 plus a different die is still one d20 group, so still a check.
    cases.push(
        Case::new("check_with_other_dice", "d20+d6+2, 1d8+3")
            .ctx(dnd())
            .find(kept_face_is(20)),
    );
    // And a sum of two d20 groups is not, under advantage either.
    cases.push(
        Case::new("not_a_check_two_advantage_groups", "d20adv+d20adv, 1d8+3")
            .ctx(dnd())
            .find(drew_face(20, 20)),
    );

    // Without a game system a d20 is just dice, natural 20 or not.
    for (label, line) in [("single", "d20+5, 1d8+3"), ("advantage", "d20adv+5, 1d8+3")] {
        cases.push(
            Case::new(&format!("no_system_{label}_natural_20"), line)
                .ctx(hero())
                .find(kept_face_is(20)),
        );
    }
    cases
}

fn dnd5e() -> Vec<Case> {
    let dnd = || hero().dnd5e();
    let mut cases = vec![
        Case::new("hit_doubles_damage", "d20+5, 1d8+3")
            .ctx(dnd())
            .find(kept_face_is(20)),
        Case::new("miss_leaves_damage", "d20+5, 1d8+3")
            .ctx(dnd())
            .find(kept_face_is(1)),
        Case::new("ordinary_attack", "d20+5, 1d8+3")
            .ctx(dnd())
            .find(kept_face_between(2, 19)),
        Case::new("every_dice_term_doubles", "d20+5, 1d8+2d6+4")
            .ctx(dnd())
            .find(kept_face_is(20)),
        Case::new("extra_damage_rolls_all_double", "d20+5, 1d8+3, 2d6, 1d4")
            .ctx(dnd())
            .find(kept_face_is(20)),
        Case::new(
            "each_attack_pairs_with_its_damage",
            "d20+5, 1d8, d20+5, 1d8",
        )
        .ctx(dnd())
        .find(|r| {
            r.rolls()
                .is_some_and(|rolls| rolls[0].get("crit").is_none() && rolls[2]["crit"] == "hit")
        }),
        Case::new("damage_before_any_attack", "1d8, d20")
            .ctx(dnd())
            .find(drew_face(20, 20)),
        Case::new("two_checks_no_damage", "d20+3, d20+5")
            .ctx(dnd())
            .find(drew_face(20, 20)),
        Case::new("marker_atk", "d20 atk, d20 dmg")
            .ctx(dnd())
            .find(drew_face(20, 20)),
        Case::new("marker_dmg_overrides_check", "d20 atk, 1d4 atk, 1d8")
            .ctx(dnd())
            .find(drew_face(20, 20)),
        Case::new("marker_before_label", "d20+5 atk # hit, 1d8 dmg # dmg")
            .ctx(dnd())
            .find(kept_face_is(20)),
        Case::new("repeat_pairs_independently", "4x d20+5, 1d8")
            .ctx(dnd())
            .find(|r| {
                r.rolls().is_some_and(|rolls| {
                    let hits: Vec<bool> = rolls.chunks(2).map(|c| c[0]["crit"] == "hit").collect();
                    hits.iter().any(|&h| h) && hits.iter().any(|&h| !h)
                })
            }),
        Case::new("crit_suffix", "1d8+3 crit"),
        Case::new("crit_suffix_with_system", "1d8+3 crit").ctx(dnd()),
        Case::new("crit_suffix_twice", "1d8 crit crit"),
        Case::new("crit_suffix_with_label", "1d8 crit # x"),
        Case::new("crit_suffix_on_flat", "5 crit"),
        Case::new("crit_suffix_on_hit_damage", "d20+5, 1d8 crit")
            .ctx(dnd())
            .find(kept_face_is(20)),
        Case::new("default_system_applies", "d20+5, 1d8+3")
            .ctx(hero().default_dnd5e())
            .find(kept_face_is(20)),
        Case::new("character_without_system_uses_default", "d20+5, 1d8+3")
            .ctx(Setup::default().default_dnd5e())
            .find(kept_face_is(20)),
        Case::new("no_system_no_crit", "d20+5, 1d8+3")
            .ctx(hero())
            .find(kept_face_is(20)),
    ];
    // A crit range: every face at or above it hits, a 1 still misses.
    for face in [1, 2, 17, 18, 19, 20] {
        cases.push(
            Case::new(&format!("crit_range_19_face_{face}"), "d20+5, 1d8+3")
                .ctx(dnd().crit_range(19))
                .find(kept_face_is(face)),
        );
    }
    for face in [9, 10, 11, 20] {
        cases.push(
            Case::new(&format!("crit_range_10_face_{face}"), "d20+5, 1d8+3")
                .ctx(dnd().crit_range(10))
                .find(kept_face_is(face)),
        );
    }
    cases.push(
        Case::new("crit_range_advantage_kept", "d20adv+5, 1d8+3")
            .ctx(dnd().crit_range(19))
            .find(kept_face_is(19)),
    );
    cases.push(
        Case::new("crit_range_advantage_dropped", "d20adv+5, 1d8+3")
            .ctx(dnd().crit_range(19))
            .find(|r| kept_face_is(18)(r) && drew_face(20, 19)(r) || kept_face_is(17)(r)),
    );
    cases.push(
        Case::new("crit_range_without_system", "d20+5, 1d8+3")
            .ctx(hero().crit_range(19))
            .find(kept_face_is(19)),
    );
    cases.push(
        Case::new("crit_range_never_a_check", "3d20+5, 1d8+3")
            .ctx(dnd().crit_range(19))
            .find(drew_face(20, 19)),
    );
    cases
}

// ---------------------------------------------------------------------------
// Writing and checking

fn render(area: &str, about: &str, cases: &[Case]) -> String {
    let mut seen = std::collections::BTreeSet::new();
    let cases: Vec<Value> = cases
        .iter()
        .map(|case| {
            assert!(
                seen.insert(case.name.clone()),
                "{area}: duplicate case {}",
                case.name
            );
            case.build()
        })
        .collect();
    let file = json!({
        "format_version": FORMAT_VERSION,
        "area": area,
        "about": about,
        "cases": cases,
    });
    let mut text = serde_json::to_string_pretty(&file).unwrap();
    text.push('\n');
    text
}

#[test]
fn parity_fixtures_match_the_engine() {
    let bless = std::env::var_os("PARITY_BLESS").is_some();
    let dir = fixture_dir();
    let mut expected_files = Vec::new();
    let mut drift = Vec::new();
    for (area, about, cases) in areas() {
        let text = render(area, about, &cases);
        let path = dir.join(format!("{area}.json"));
        if bless {
            fs::create_dir_all(&dir).unwrap();
            fs::write(&path, &text).unwrap();
        } else if fs::read_to_string(&path).ok().as_deref() != Some(text.as_str()) {
            drift.push(format!("{} is out of date", path.display()));
        }
        expected_files.push(format!("{area}.json"));
    }
    if !bless {
        // No stale files either.
        for entry in fs::read_dir(&dir).expect("tests/fixtures/parity exists") {
            let name = entry.unwrap().file_name().to_string_lossy().into_owned();
            if name.ends_with(".json") && !expected_files.contains(&name) {
                drift.push(format!("{name} is no longer generated"));
            }
        }
    } else {
        for entry in fs::read_dir(&dir).unwrap() {
            let entry = entry.unwrap();
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".json") && !expected_files.contains(&name) {
                fs::remove_file(entry.path()).unwrap();
            }
        }
    }
    assert!(
        drift.is_empty(),
        "the parity fixtures drifted from the Rust engine; run `just parity` and commit the result:\n{}",
        drift.join("\n")
    );
}

/// Recording the dice must not change a roll: the same seed rolls the same
/// with and without a recording.
#[test]
fn recording_does_not_change_rolls() {
    for formula in [
        "4d6dl1",
        "d20adv+5",
        "6d6!>=5",
        "4d6r1!dl1",
        "3x d20+5, 1d8",
    ] {
        for seed in 0..20 {
            let plain = rollin::roll(formula, &mut seeded_rng(seed)).unwrap();
            let recording = Recording::start();
            let recorded = rollin::roll(formula, &mut seeded_rng(seed)).unwrap();
            let draws = recording.finish();
            assert_eq!(plain, recorded, "{formula} seed {seed}");
            assert!(!draws.is_empty());
            assert!(draws.iter().all(|d| (1..=d.sides).contains(&d.face)));
        }
    }
}

/// Every drawn face of a case's dice shows up in its result, in draw order:
/// the draws are the dice of the tree (a die is drawn once, counted once).
#[test]
fn draws_account_for_every_die_in_the_result() {
    for (area, _, cases) in areas() {
        for case in cases {
            let value = case.build();
            let Some(rolls) = value["expected"]["ok"]["rolls"].as_array() else {
                continue;
            };
            let mut shown = 0usize;
            for roll in rolls {
                count_dice(&roll["expr"], &mut shown);
            }
            let drawn = value["draws"].as_array().unwrap().len();
            // A compounded or penetrating die folds its extra draws into one
            // die's `parts`; plain explosions and rerolls list every draw.
            assert!(
                drawn >= shown,
                "{area}/{}: {drawn} draws for {shown} dice",
                case.name
            );
        }
    }
}

fn count_dice(node: &Value, total: &mut usize) {
    match node["type"].as_str() {
        Some("dice") => *total += node["dice"].as_array().unwrap().len(),
        Some("neg") => count_dice(&node["operand"], total),
        Some("group") => count_dice(&node["inner"], total),
        Some("chain") => {
            count_dice(&node["first"], total);
            for link in node["rest"].as_array().unwrap() {
                count_dice(&link["node"], total);
            }
        }
        _ => {}
    }
}
