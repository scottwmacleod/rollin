//! The desktop app's backend logic, free of Tauri so it builds and tests on
//! any machine (ADR-0007). `src-tauri` wraps [`Session`] in managed state and
//! exposes each method as a Tauri command; nothing here knows about windows.
//!
//! One [`Session`] is one app run: an RNG (entropy until `seed`), the typed
//! lines, and the config directory shared with the CLI. The active character
//! lives in the TOML files, not here, so `rollin char x` in a terminal and
//! the app always agree.

use rand_chacha::ChaCha8Rng;
use rollin::{
    entropy_rng, execute, run_line, seeded_rng, Command, CommandError, Context, ErrorReport,
    LineOutcome, LinePolicy, Output, OutputReport, PresetEntry, PresetSource,
};
use serde::Serialize;
use std::ops::Range;
use std::path::PathBuf;

/// The licence the app and the library ship under.
pub const LICENSE: &str = "MIT";

/// Where the source lives.
pub const REPOSITORY: &str = "https://github.com/scottwmacleod/rollin";

/// What the About view shows. The versions come from the build, never from
/// strings typed into the front end.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct About {
    pub name: &'static str,
    /// The desktop app's version (the bundle version in `tauri.conf.json`).
    pub app_version: String,
    /// The `rollin` library the app links against.
    pub library_version: &'static str,
    pub license: &'static str,
    pub repository: &'static str,
}

/// Builds the About data. The app version is the shell's to know, so it is
/// passed in; the rest is fixed or comes from the linked library.
pub fn about(app_version: &str) -> About {
    About {
        name: "Rollin",
        app_version: app_version.to_string(),
        library_version: rollin::version(),
        license: LICENSE,
        repository: REPOSITORY,
    }
}

/// The result of one typed line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Execution {
    /// A command ran; `Output` carries its text and hints when serialised.
    Output(Output),
    /// A command failed.
    Error(CommandError),
    /// Text from a session word (`help`, `history`).
    Text(Vec<String>),
    /// The line asked something the app does not do (a per-line `--seed`).
    Rejected(String),
    /// `quit` / `exit`: the front end decides what that means.
    Quit,
    /// A blank line.
    Empty,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum ExecutionWire<'a> {
    Ok {
        output: OutputReport<'a>,
    },
    Error {
        error: ErrorReport<'a>,
        /// The byte range of the formula the error points at, if any.
        span: Option<Range<usize>>,
        /// The formula text that `span` indexes into, if any.
        source: Option<&'a str>,
    },
    Text {
        lines: &'a [String],
    },
    Rejected {
        message: &'a str,
    },
    Quit,
    Empty,
}

/// Where in the formula an error points, with the text it indexes.
fn locate(error: &CommandError) -> (Option<Range<usize>>, Option<&str>) {
    match error {
        CommandError::Formula { source, error } => (Some(error.span()), Some(source)),
        CommandError::UndefinedVariable(u) => (Some(u.error.span()), Some(&u.source)),
        _ => (None, None),
    }
}

impl Serialize for Execution {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Execution::Output(output) => ExecutionWire::Ok {
                output: output.report(),
            },
            Execution::Error(error) => {
                let (span, source) = locate(error);
                ExecutionWire::Error {
                    error: error.report(),
                    span,
                    source,
                }
            }
            Execution::Text(lines) => ExecutionWire::Text { lines },
            Execution::Rejected(message) => ExecutionWire::Rejected { message },
            Execution::Quit => ExecutionWire::Quit,
            Execution::Empty => ExecutionWire::Empty,
        }
        .serialize(serializer)
    }
}

/// A [`CommandError`] on its own, for commands that return `Result`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Failure(pub CommandError);

impl Serialize for Failure {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let (span, source) = locate(&self.0);
        ExecutionWire::Error {
            error: self.0.report(),
            span,
            source,
        }
        .serialize(serializer)
    }
}

impl From<CommandError> for Failure {
    fn from(error: CommandError) -> Self {
        Failure(error)
    }
}

/// Everything the sidebar shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct State {
    pub active_character: String,
    pub characters: Vec<String>,
    /// The active character's variables, sorted by name.
    pub vars: Vec<(String, i64)>,
    /// The active character's own presets.
    pub presets: Vec<PresetEntry>,
    /// Global presets.
    pub global_presets: Vec<PresetEntry>,
    /// The active character's own game system, if it names one.
    pub system: Option<String>,
    /// The global default game system, if one is set.
    pub default_system: Option<String>,
    /// The game system rolls run under: the character's own, else the global
    /// default, else none.
    pub effective_system: Option<String>,
    /// Every game system that can be chosen.
    pub systems: Vec<String>,
    /// The session seed; `None` while the RNG comes from entropy.
    pub seed: Option<u64>,
    /// Lines typed this session, oldest first, consecutive repeats dropped.
    pub history: Vec<String>,
}

/// Completion candidates for the word ending at a cursor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Completions {
    /// Byte offset in the line where the replacement starts.
    pub start: usize,
    pub candidates: Vec<String>,
}

/// Which setting a game-system change is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SystemScope {
    /// A character's own `system`.
    Character,
    /// The global default in `settings.toml`.
    Default,
}

/// One app run's state.
pub struct Session {
    config_dir: Option<PathBuf>,
    rng: ChaCha8Rng,
    /// Rolls previews, so a sample never moves the session RNG.
    sample_rng: ChaCha8Rng,
    seed: Option<u64>,
    history: Vec<String>,
}

impl Session {
    /// A session over `config_dir` (see [`rollin::config_dir`]), seeded from
    /// OS entropy.
    pub fn new(config_dir: Option<PathBuf>) -> Self {
        Session {
            config_dir,
            rng: entropy_rng(),
            sample_rng: entropy_rng(),
            seed: None,
            history: Vec::new(),
        }
    }

    fn context(&self) -> Context {
        Context::new(self.config_dir.clone())
    }

    /// Seeds the session RNG: `Some(n)` is the same stream as
    /// `rollin --seed n` in a REPL; `None` goes back to entropy.
    pub fn seed(&mut self, seed: Option<u64>) {
        self.rng = seed.map_or_else(entropy_rng, seeded_rng);
        self.seed = seed;
    }

    pub fn current_seed(&self) -> Option<u64> {
        self.seed
    }

    /// Runs one line as the REPL would: session words first, then rolls and
    /// every command. `--char NAME` applies to this line only.
    pub fn execute(&mut self, line: &str) -> Execution {
        let line = line.trim();
        if line.is_empty() {
            return Execution::Empty;
        }
        if self.history.last().map(String::as_str) != Some(line) {
            self.history.push(line.to_string());
        }
        match run_line(
            line,
            LinePolicy::DESKTOP,
            self.config_dir.clone(),
            &mut self.rng,
            &|| self.history.clone(),
        ) {
            LineOutcome::Empty => Execution::Empty,
            LineOutcome::Quit => Execution::Quit,
            LineOutcome::Text(lines) => text(&lines),
            LineOutcome::Output { output, .. } => Execution::Output(output),
            LineOutcome::Error(e) => Execution::Error(e),
            LineOutcome::Rejected(message) => Execution::Rejected(message),
        }
    }

    /// The lines typed this session, oldest first, consecutive repeats
    /// dropped. The formula box's ↑ and ↓ walk this list.
    pub fn history(&self) -> &[String] {
        &self.history
    }

    /// Completes the word ending at byte offset `pos` of `line`.
    pub fn complete(&self, line: &str, pos: usize) -> Completions {
        let c = rollin::complete(
            line,
            pos,
            &self.context().completion_data(LinePolicy::DESKTOP),
        );
        Completions {
            start: c.start,
            candidates: c.candidates,
        }
    }

    /// Whether `formula` (or a preset name) would roll, without rolling.
    pub fn check(&self, formula: &str) -> Result<(), Failure> {
        Ok(rollin::check(formula, &self.context())?)
    }

    /// A sample roll of `formula` for a preview. It draws from its own entropy
    /// RNG, so the session RNG (seeded or not) does not move, and it makes no
    /// history entry.
    pub fn sample(&mut self, formula: &str) -> Result<Vec<rollin::RollResult>, Failure> {
        let ctx = self.context();
        Ok(rollin::sample(formula, &ctx, &mut self.sample_rng)?)
    }

    /// Sets (`Some`) or clears (`None`) a game system: a character's own
    /// (`character`, else the active one), or the global default every
    /// character without one falls back to. Writes the same TOML the CLI
    /// reads. An unknown name is the library's error.
    pub fn set_system(
        &self,
        scope: SystemScope,
        character: Option<&str>,
        system: Option<&str>,
    ) -> Result<(), Failure> {
        let mut ctx = self.context();
        ctx.character = character.map(str::to_string);
        match scope {
            SystemScope::Character => ctx.set_character_system(system),
            SystemScope::Default => ctx.set_default_system(system),
        }?;
        Ok(())
    }

    /// The sidebar's data, read fresh from the files the CLI also uses.
    pub fn state(&mut self) -> Result<State, Failure> {
        let ctx = self.context();
        // Reads only: these commands never touch the RNG.
        let mut run = |command: Command| execute(&command, &ctx, &mut self.rng);
        let Output::Characters {
            names: characters,
            active,
        } = run(Command::Characters)?
        else {
            unreachable!("characters gives Characters");
        };
        let Output::Vars { vars } = run(Command::Vars)? else {
            unreachable!("vars gives Vars");
        };
        let Output::Presets { presets } = run(Command::Presets)? else {
            unreachable!("presets gives Presets");
        };
        let (global_presets, presets) = presets
            .into_iter()
            .partition(|p| p.source == PresetSource::Global);
        Ok(State {
            active_character: active,
            characters,
            vars,
            presets,
            global_presets,
            system: ctx.character_system()?.map(|s| s.as_str().to_string()),
            default_system: ctx.default_system()?.map(|s| s.as_str().to_string()),
            effective_system: ctx.rules()?.system().map(|s| s.as_str().to_string()),
            systems: rollin::System::ALL
                .iter()
                .map(|s| s.as_str().to_string())
                .collect(),
            seed: self.seed,
            history: self.history.clone(),
        })
    }
}

fn text(text: &str) -> Execution {
    Execution::Text(text.lines().map(str::to_string).collect())
}
