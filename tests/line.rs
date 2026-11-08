//! The line runner at the library API, with no terminal: the REPL's policy
//! and the desktop's, side by side.

mod common;
use common::Cli;
use rollin::{run_line, seeded_rng, ColorWhen, LineFlags, LineOutcome, LinePolicy, Output};

fn run(cli: &Cli, policy: LinePolicy, line: &str) -> LineOutcome {
    let history = || vec!["d20".to_string(), line.to_string()];
    run_line(
        line,
        policy,
        Some(cli.config_dir().to_path_buf()),
        &mut seeded_rng(1),
        &history,
    )
}

fn rejected(outcome: LineOutcome) -> String {
    match outcome {
        LineOutcome::Rejected(message) => message,
        other => panic!("expected a rejection, got {other:?}"),
    }
}

#[test]
fn session_words_run_without_flags() {
    let cli = Cli::new();
    assert_eq!(run(&cli, LinePolicy::REPL, "QUIT"), LineOutcome::Quit);
    assert_eq!(run(&cli, LinePolicy::DESKTOP, "exit"), LineOutcome::Quit);
    assert_eq!(run(&cli, LinePolicy::REPL, "  "), LineOutcome::Empty);
    assert_eq!(
        run(&cli, LinePolicy::REPL, "history"),
        LineOutcome::Text("1  d20\n2  history\n".into())
    );
}

#[test]
fn the_repl_takes_every_flag_and_reports_the_display_ones() {
    let cli = Cli::new();
    let outcome = run(
        &cli,
        LinePolicy::REPL,
        "-q d20 --seed 1 --color NEVER --json",
    );
    let LineOutcome::Output { output, flags } = outcome else {
        panic!("{outcome:?}")
    };
    assert!(matches!(output, Output::Rolls { .. }));
    assert_eq!(
        flags,
        LineFlags {
            json: true,
            quiet: true,
            color: Some(ColorWhen::Never)
        }
    );
}

#[test]
fn a_per_line_seed_reseeds_the_rng() {
    let cli = Cli::new();
    let (mut a, mut b) = (seeded_rng(9), seeded_rng(10));
    let history = Vec::new;
    for rng in [&mut a, &mut b] {
        run_line(
            "d100 --seed=5",
            LinePolicy::REPL,
            Some(cli.config_dir().into()),
            rng,
            &history,
        );
    }
    assert_eq!(a, b);
}

#[test]
fn the_desktop_refuses_the_flags_it_does_not_have() {
    let cli = Cli::new();
    assert_eq!(
        rejected(run(&cli, LinePolicy::DESKTOP, "d20 --seed 3")),
        "--seed is not a per-line flag here; use the seed control"
    );
    for line in ["--json d20", "d20 -q", "--color always d20"] {
        assert!(
            rejected(run(&cli, LinePolicy::DESKTOP, line)).contains("not a per-line flag"),
            "{line}"
        );
    }
}

#[test]
fn both_front_ends_take_char_and_leave_global_and_force_to_the_command() {
    let cli = Cli::new();
    for policy in [LinePolicy::REPL, LinePolicy::DESKTOP] {
        assert!(matches!(
            run(&cli, policy, "save --global house d6"),
            LineOutcome::Output { .. }
        ));
        assert!(matches!(
            run(&cli, policy, "--char=default vars"),
            LineOutcome::Output { .. }
        ));
        assert_eq!(
            rejected(run(&cli, policy, "d20 --char")),
            "--char needs a character name"
        );
    }
}

#[test]
fn only_the_repl_treats_an_unknown_flag_as_an_error() {
    let cli = Cli::new();
    assert_eq!(
        rejected(run(&cli, LinePolicy::REPL, "d20 -x")),
        "unexpected argument '-x'"
    );
    assert!(matches!(
        run(&cli, LinePolicy::REPL, "-5 + d20"),
        LineOutcome::Output { .. }
    ));
    assert!(matches!(
        run(&cli, LinePolicy::DESKTOP, "d20 -x"),
        LineOutcome::Error(_)
    ));
}

#[test]
fn help_lists_only_the_flags_the_front_end_accepts() {
    let cli = Cli::new();
    let text = |policy| match run(&cli, policy, "help") {
        LineOutcome::Text(t) => t,
        other => panic!("{other:?}"),
    };
    let (repl, desktop) = (text(LinePolicy::REPL), text(LinePolicy::DESKTOP));
    for flag in ["--seed", "-q", "--json", "--color", "--char"] {
        assert!(repl.contains(flag), "REPL help lacks {flag}");
    }
    assert!(desktop.contains("--char"));
    for flag in ["--seed", "-q", "--json", "--color"] {
        assert!(
            !desktop.contains(flag),
            "desktop help advertises {flag}: {desktop}"
        );
    }
}

#[test]
fn completion_offers_only_accepted_flags() {
    let cli = Cli::new();
    let ctx = rollin::Context::new(Some(cli.config_dir().to_path_buf()));
    let offered = |policy| rollin::complete("--", 2, &ctx.completion_data(policy)).candidates;
    assert_eq!(
        offered(LinePolicy::DESKTOP),
        ["--char", "--force", "--global"]
    );
    assert_eq!(offered(LinePolicy::REPL).len(), 7);
}
