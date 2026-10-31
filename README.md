# rollin

A dice roller for the command line.

## Install

rollin is a Rust program (macOS is the supported platform for now; it is not
published to crates.io or packaged anywhere yet). Build it from a checkout:

```sh
cargo build --release          # binary at target/release/rollin
cargo install --path .         # or install it onto your PATH
```

This is version 2.0.0, a rewrite of the original Python v1 (preserved at the
git tag `v1.0`). Every v1 formula and preset works unchanged, `roll <formula>`
and `roll <name>` still work, and `rollin import presets.json` brings v1
presets across (see [Importing v1 presets](#presets)). What changed is the
interface: there is a one-shot mode, the output format is new, and presets
live in TOML files instead of the source tree. `rollin --help` lists every
flag with examples.

## Usage

```sh
rollin 4d6dl1              # 4d6dl1  [5, 3, 4, (1)]  →  12
rollin "d20+8, d10+5"      # one line per roll
rollin d20+8, d10+5        # unquoted also works (arguments are joined)
rollin 2d6+3 --seed 7      # reproducible
rollin 2d6+3 --json        # machine-readable, with kept/dropped per die
rollin -q 2d6+3            # just the total
rollin 6x 4d6dl1           # repeat: six numbered stat rolls
rollin 'd20+8 # attack'    # a label (quote the #)
rollin                     # no formula: start an interactive session
```

Dropped dice are shown in parentheses and do not count toward the total.
Each dice group shows its dice, joined by the formula's operators:

```
$ rollin "(d20+5)*2" --seed 3
(d20+5)*2  ([3] + 5) * 2  →  16
$ rollin 2d6+1d4+3 --seed 3
2d6+1d4+3  [1, 4] + [1] + 3  →  9
```

### Formula syntax

Formulas are case-insensitive and spaces are ignored (except that a space
ends a `@variable` name; see [Characters and variables](#characters-and-variables)). Every v1 formula means
the same thing here; arithmetic is an addition on top.

| Formula | Meaning |
| --- | --- |
| `d20` | One d20 (`dM` is `1dM`) |
| `2d6` | Two d6s |
| `3d8+5`, `2d6-2` | Dice plus or minus a flat number |
| `4d6dl1` | Drop the lowest 1 |
| `4d6dh1` | Drop the highest 1 |
| `4d6dl`, `4d6dh` | Drop count defaults to 1 |
| `4d6kh3` | Keep the highest 3 |
| `4d6kl2` | Keep the lowest 2 |
| `4d6kh` | Keep count defaults to 1 |
| `2d20kh+8` | Keep clause, then modifier |
| `3d6!` | Exploding: each die showing its maximum rolls another die, which can explode too |
| `3d6!>5`, `d10!>=8`, `3d6!<2`, `3d6!<=2`, `3d6!=4` | Explode on a condition instead of the maximum |
| `3d6!!`, `3d6!!>5` | Compounding: the extra rolls are added into the same die, which shows one combined value |
| `3d6!p`, `3d6!p>5` | Penetrating: like `!`, but each extra die counts one less than it rolled (a 1 counts 0) |
| `4d6!dl1`, `4d6!!kh2` | Explode first, then keep/drop applies to the whole resulting pool |
| `4d6r1`, `4d6r=1` | Reroll any die showing 1, once; the second result stands even if it is also a 1 |
| `4d6r<2`, `4d6r<=2`, `d20r>5`, `d20r>=19` | Reroll once on a comparison (`<`, `<=`, `>`, `>=`, `=`) instead of equals |
| `4d6rr1`, `4d6rr<=2` | Reroll repeatedly until the die no longer matches |
| `4d6r1!dl1` | Order of operations: reroll, then explode, then keep/drop |
| `6d10>=8`, `6d10>7`, `6d10<=3`, `6d10<3`, `6d10=10` | Success count: the roll is how many dice meet the condition, not a sum |
| `6d10>=8f1`, `6d10>=8f<=2`, `6d10>=8 f1` | Failure clause: each counting die matching it (and not a success) subtracts 1 |
| `4d6dl1>=5`, `6d10r1!=10kh4>=8f1` | Order of operations: reroll, explode, keep/drop, then success counting |
| `d20adv`, `d20dis` | Advantage / disadvantage: roll two d20s and keep the highest / lowest; exactly `2d20kh1` / `2d20kl1` |
| `d20adv+8`, `(d20dis+3)*2`, `d20r1adv`, `d10adv>=7` | `adv`/`dis` combine with modifiers: reroll and explode go before it, a success clause after |
| `d%`, `2d%`, `3d%dl1` | Percentile: `d%` is a d100, same results as `d100` under the same seed, and takes the same modifiers |
| `15` | A bare number is its own total |
| `2d6+1d4+3`, `d20+d4-2` | Add and subtract any dice groups and numbers |
| `d20*2`, `10/4` | Multiply and divide; they bind tighter than `+` and `-` |
| `(d20+5)*2` | Parentheses group |
| `-d6`, `10 + -2` | Unary minus (unary `+` is accepted and ignored) |
| `d20+8, d10+5` | Comma-separated list: each item is its own roll on its own line |
| `6x 4d6dl1`, `6 x 4d6dl1`, `6X 4d6dl1` | Repeat: roll everything after `Nx` N times (1 to 100); the space is optional |
| `3x d20+8, d10+5` | Repeat a whole list: each iteration rolls every item |
| `d20+8 # attack` | Label: `#` and the rest of the item is a note shown with that roll |
| `3x d20+8 # attack, d10+5 # damage` | Repeat and labels together |

**Repeat.** A formula is `[N x] item, item, ...`. `Nx` goes at the very start
and repeats everything after it, the whole comma list, N times; N is an
integer from 1 to 100 (`0x` is an error, and `101x` is an error naming the
repeat cap of 100). The `x` may be lower or upper case and may touch the number
or not (`6x`, `6 x`, `6X`). Output lines are numbered by iteration, see
[Output modes](#output-modes). It is an error to use `Nx` a second time
(`2x 3x d20`) or anywhere but the start of the formula (`d20, 3x d6`), and an
`Nx` with nothing after it (`6x`) is an error. So is `Nx` over a body that
rolls no dice (`2x3`): `x` is repeat, not multiplication (use `*`). The
10000-dice limit below is per roll, not per repeat, and `Nx` over a success
count or `adv`
formula works like it does without the `Nx`.

**Repeat and parentheses.** `Nx` always applies to the whole rest of the
formula; it cannot wrap a parenthesised group, because a label runs to the
next comma and would swallow a closing `)`. Parentheses keep their ordinary
arithmetic meaning: `3x (d20+5)*2` repeats the roll `(d20+5)*2` three times.

**Labels.** `#` starts a label that runs to the end of its comma-separated
item (the next comma, or the end of the formula). The text is trimmed and
may hold anything except a comma, unicode included (`d20 # Fireball (3d6) ✨`);
a comma ends the label and starts the next item. A label belongs to the one
roll before it, and must have text (`d20 #` is an error pointing at the `#`).
A label with no roll is an error (`# x`, `d20, # x`), though empty items
without a label are still ignored as in v1 (`d20,,d6`). Labels change nothing
about the dice or totals. Because a label runs to the comma, put it at the
end of an item: a `#` inside parentheses swallows the `)` and gives an
"unclosed '('" error. Many shells treat `#` specially (bash and others read
it as a comment when it starts a word), so quote formulas with labels:
`rollin 'd20+8 # attack'`.

Arithmetic is integer-only. Division truncates toward zero (`7/2` is 3,
`-7/2` is -3), and `*` and `/` are applied left to right (`100/5/2` is 10).
Division by zero and integer overflow are errors, never wrapped values.

Exploding dice stop at 100 explosions per die: a longer chain is an error
naming the cap and the term, not a truncated result. Extra dice count toward
the 10000-dice limit below. A condition that holds for every face (`d6!>=1`,
`d6!<7`, `d6!!<=6`) would explode forever and is rejected before rolling;
one that never holds (`d6!>6`) is allowed and simply never explodes. Keep
and drop counts are checked against the dice written, but apply to every die
in the exploded pool (`4d6!kh2` keeps the two highest of all of them).
A reroll replaces the original die's value; the rerolled-away values stay in
the result (see the output modes) but never count toward the total. A reroll
needs a condition (`4d6r` is an error) and goes straight after the dice,
before any `!` and keep/drop. `rr` stops at 100 rerolls per die: a longer
chain is an error naming the cap and the term. Rerolled dice count toward
the 10000-dice limit below. An `rr` condition that holds for every face
(`d6rr<=6`, `d6rr>=1`, `d6rr<7`) would reroll forever and is rejected before
rolling; plain `r` with such a condition is allowed (it just rerolls every
die once), and a condition that never holds (`d6rr>6`) is allowed and does
nothing. Keep and drop counts are checked against the dice written
(`4d6r1dl4` is an error), and apply to the dice that stand, not to
rerolled-away values.
A success clause goes last on the dice group, after reroll, explode and
keep/drop: it is a comparison operator (`>=`, `>`, `<=`, `<`, `=`) and a
number. A bare number is not a success clause (`6d10=10`, not `6d10 10`). The
optional failure clause `f` must come straight after it and takes a bare
number (equals) or a comparison, like a reroll condition. Only dice that
count are scored: dropped and rerolled-away dice are not, exploded extra dice
are, and a compounded or penetrating die is scored by its counted value.
The result is a success count: successes minus failures, so it can be zero
or negative. A die that matches both clauses is a success (success wins),
so `d6>=5f>=3` fails only on a 3 or 4. Always-true and never-true
conditions are legal (`5d6>=1` is always 5).
A `!` takes the comparison right after it as its own explode condition, so
`8d10!>=8` is an exploding d10 that sums (it explodes on 8 or more) and is
not a success count; put the success clause after an explicit explode
condition: `8d10!>=8>=8`, `4d6!>5>=6`, or `4d6!=6>=5`. The same goes for
a reroll (`6d10r<2>=8`).
A success count is a different kind of result from a sum, so it cannot be
mixed into arithmetic: `6d10>=8 + 3`, `3 + 6d10>=8`, `-6d10>=8`,
`2*6d10>=8`, `(6d10>=8)+1` and two counts added are errors. A whole roll
may be parenthesised, `(6d10>=8)`, and counts and sums can sit side by side
in a comma list: `6d10>=8, d20`.
`adv` and `dis` are suffixes on a dice group written with exactly one die
(`d20adv` or `1d20adv`; `2d20adv` is an error; use `2d20kh1`, or `kh`/`kl` for bigger pools). They take the keep/drop slot, so combining them with `dl`, `dh`,
`kl` or `kh` in either order (`d20advdl1`, `3d20kh1adv`) is an error. The
output shows both dice with the loser dropped, as in `2d20kh1`; the formula
is echoed as typed, and `d20adv` counts as two dice toward the dice limits.
A natural 20 or 1 is highlighted only on a lone single-die roll, so `d20adv`
is never highlighted.
`d%` is a d100 whose faces and RNG use are identical to `d100`; the formula
and term are echoed as typed (`d%`), and `--json` marks the group with
`"special": "percentile"` and `"sides": 100`.
Quote formulas containing `!` in an interactive shell (`rollin '3d6!'`), where
`!` can trigger history expansion.

Limits: 1 to 1000 dice per term, 2 to 10000 sides, 10000 dice rolled per
roll (one comma-separated item, explosion dice included), and nesting (parentheses and unary minus)
32 deep. Dropping or keeping that leaves no dice is an error.
A bare negative number works (`rollin -5`), but a formula that starts with a
minus sign and goes on (`-3+d6`) needs `--` so it is not read as an option:
`rollin -- -3+d6` (flags such as `--seed` must then come before the `--`).

### Presets

A preset is a named formula you save once and roll by name. By default a
preset belongs to the active [character](#characters-and-variables) (the
`default` character if you never made one); `--global` saves one every
character can use. The same commands work for every invocation
(`rollin <command> ...`):

```
$ rollin save atk 'd20+8'
saved 'atk' on 'default': d20+8
$ rollin save sneak 'd20+5, 2d6'        # a comma list is fine
saved 'sneak' on 'default': d20+5, 2d6
$ rollin presets                        # the character's, then global; sorted
atk    d20+8       [default]
sneak  d20+5, 2d6  [default]
$ rollin atk --seed 3                   # bare name, or: rollin roll atk
(preset 'atk': d20+8)
d20+8  [3] + 8  →  11
$ rollin roll sneak --seed 3 -q         # --json and -q print no header line
8
5
$ rollin delete atk
deleted 'atk' from 'default'
$ rollin save --global house d6         # global; also: delete --global house
saved 'house': d6
```

- `save <name> <formula> [--global]` checks the formula at save time (the
  usual error with carets if it is invalid) and replaces an existing preset
  of that name, saying `replaced 'atk' on 'default' (was d20+8): d20+9`. A
  formula with `@variables` is only syntax-checked (see below). `--global`
  may go anywhere after `save`.
- `roll <x>` takes a formula or a preset name. A bare word that is not a
  formula is looked up as a preset; an unknown one is an error that suggests
  `rollin presets` and, if a saved name is within two edits, `did you mean`.
- `--seed`, `-q`, `--json` and `--color` work with presets as with any
  roll. The `(preset 'name': formula)` header is printed in the default and
  default mode only, so `--json` and `-q` stay machine-clean. `presets`,
  `save`, `delete` and `import` print plain text whatever the mode.
- `delete <name> [--global]` removes the preset from the active character.
  A name the character does not have is an error (exit 1); if a global preset
  has that name the error says to use `delete --global <name>`.

**Names** are stored lowercase (`save Atk ...` and `rollin ATK` both mean
`atk`) and must match `[a-z][a-z0-9_-]*`, so v1 names such as `adv-attack`
work. A name is rejected at `save` (and skipped by `import`) when it is a
command word (`save presets delete import roll set unset vars char
characters help quit exit history`; the last four are session-only, see
[Session](#session)), a reserved dice keyword
(`adv dis dl dh kl kh r rr p f d`), or would itself parse as a dice formula
(`d20`, `D6`). The error says which rule failed.

**File.** Global presets live in `$XDG_CONFIG_HOME/rollin/presets.toml` (an empty or
relative `XDG_CONFIG_HOME` is ignored; the default is
`~/.config/rollin/presets.toml`). It is hand-editable:

```toml
[presets]
atk = "d20+8"
sneak = "d20+5, 2d6"
```

Writes are atomic (a temp file in the same directory, then a rename). A
missing file just means no presets. A file that is not valid TOML, or whose
`presets` is not a table of strings, makes every preset command fail with an
error naming the file; it is never overwritten by a failed command. Saving
edits the file in place: your comments, key order and formatting survive;
only the entries that changed are touched, and new presets are appended.

**Importing v1 presets.** `rollin import presets.json` merges a v1
`presets.json` (a flat JSON object of name to formula) into the store:

```
$ rollin import tests/fixtures/presets.json
imported 10, skipped 0
$ rollin import tests/fixtures/presets.json
skipped 'adv-attack': already exists (use --force to overwrite)
...
imported 0, skipped 10
```

(Run these two in a scratch config directory, for example with
`XDG_CONFIG_HOME=$(mktemp -d)`, if you are replaying the examples in order:
the imported presets would otherwise appear in the later `presets` listing.)

Existing names are skipped unless you add `--force`. Entries with an invalid
name, an invalid formula or a non-string value are skipped, each reported with
its reason; the rest are still imported. Only an unreadable file or one that
is not a JSON object is an error (exit 1). Nothing is imported automatically.

### Characters and variables

A **character** holds named integer **variables** and its own presets. There
is always one active character, and a character called `default` always
exists, so plain use needs no setup. The examples from the Presets section
through this one are a single continuous session, replayed in order.

```
$ rollin set str 3                      # on the active character (default)
set str = 3 on 'default'
$ rollin 'd20+@str' --seed 1            # @str is replaced by 3
d20+@str  [9] + 3  →  12
$ rollin char new grog                  # create and switch to a character
created character 'grog' and made it active
$ rollin set str 5
set str = 5 on 'grog'
$ rollin set dex 2
set dex = 2 on 'grog'
$ rollin vars                           # sorted
dex = 2
str = 5
$ rollin characters                     # * marks the active one
  default
* grog
$ rollin --char default vars            # one call as another character
str = 3
$ rollin char default                   # switch back (persists)
active character: default
$ rollin char gorg
error: no character named 'gorg'
hint: did you mean 'grog'?
hint: create it with: rollin char new gorg
```

- `set <name> <integer>`, `unset <name>`, `vars` work on the active character.
  A value must be a whole number that fits in a 64-bit signed integer
  (`-1` is fine; `3.5`, `abc` and overflow are rejected). Names are
  case-insensitive, stored lowercase, and match `[a-z][a-z0-9_]*`.
- `characters` lists every character; `char` shows the active one;
  `char <name>` switches to an existing character; `char new <name>` creates
  an empty one and switches to it; `char delete <name>` removes one (deleting
  the active character switches back to `default`).
- `--char <name>` runs one command as another character and never changes
  the active one. It applies to rolls, presets and variables. The character
  must exist (or be `default`).

**Variables in formulas.** `@name` (any letter case) can be used anywhere a
number can: modifiers, dice count and sides, keep/drop counts, explode,
reroll and success thresholds, and the repeat count:

```
$ rollin set level 3
set level = 3 on 'default'
$ rollin set sides 8
set sides = 8 on 'default'
$ rollin set n 2
set n = 2 on 'default'
$ rollin set keep 2
set keep = 2 on 'default'
$ rollin set dc 8
set dc = 8 on 'default'
$ rollin '@level d6' --seed 2           # 3d6 when level is 3
@level d6  [2, 6, 4]  →  12
$ rollin 'd@sides' --seed 2             # d8 when sides is 8
d@sides  [8]  →  8
$ rollin '@n x 4d6kh@keep' --seed 1     # two stat rolls
1: 4d6kh@keep  [4, 3, (1), (2)]  →  7
2: 4d6kh@keep  [4, 3, (2), (2)]  →  7
$ rollin '6d10>=@dc' --seed 1           # a success pool
6d10>=@dc  [6, 5, 3, 3, 9✓, 10✓]  →  2 successes
$ rollin set sides 1
set sides = 1 on 'default'
$ rollin 'd@sides'
error: @sides is 1 but sides must be between 2 and 10000
  d@sides
   ^^^^^^
$ rollin set sides 8
set sides = 8 on 'default'
```

A variable is replaced by its number before the formula is parsed, so
`d20+@str` rolls exactly like `d20+5`. A variable name takes every letter,
digit and `_` after the `@`, so **put a space between a variable and a dice
letter that follows it**: write `@level d6`, not `@leveld6` (which is the
variable `leveld6`). After the `d` the name ends at the next character that
cannot be in a name, so `d@sides+1`, `d@sides!` and `(d@sides)` are fine, but
`d@sideskh1` is the variable `sideskh1`. A negative variable acts like a
typed negative number (`d20+@str` with `str = -1` is `d20-1`), but as a dice
count or sides it is an error. `@` alone, or `@` followed by a digit or `_`,
is a syntax error.

Errors about a variable's value underline the `@name` and say what it was
(see `d@sides` with `sides` set to 1 above).

**Undefined variables** name the character, list what is defined, suggest a
near miss (within two edits) and show the fix; `--char` appears in the fix
only when you used it:

```
$ rollin char grog
active character: grog
$ rollin 'd20+@dx'
error: undefined variable @dx on character 'grog'
  d20+@dx
      ^^^
defined: dex, str
did you mean @dex?
set it with: rollin set dx <value>
$ rollin --char default 'd20+@dex'
error: undefined variable @dex on character 'default'
  d20+@dex
      ^^^^
defined: dc, keep, level, n, sides, str
did you mean @dc?
set it with: rollin --char default set dex <value>
```

**Character presets.** A character's presets are looked up before global
ones, so a character preset shadows a global one of the same name; the
listing says so, and `--char` or `char` shows the other side:

```
$ rollin save atk 'd20+@str'            # on grog; the variable need not exist yet
saved 'atk' on 'grog': d20+@str
$ rollin save --global atk d20
saved 'atk': d20
$ rollin presets
atk    d20+@str  [grog, shadows global]
atk    d20       [global, shadowed by grog]
house  d6        [global]
$ rollin atk --seed 3                   # grog's atk, with grog's @str
(preset 'atk': d20+@str)
d20+@str  [3] + 5  →  8
$ rollin --char default atk --seed 3    # the global one
(preset 'atk': d20)
d20  [3]  →  3
$ rollin char delete grog               # deleting the active character falls back to default
deleted character 'grog'; active character is now 'default'
```

Presets resolve their variables **when rolled**, not when saved, so changing
`str` changes `atk`. Because the variables may not exist yet, `save` only
checks a formula that uses `@` for syntax: it tries each `@name` as `2` and
ignores any other error that involves a variable (a bad side count, say),
which is reported when the preset is rolled. Formulas without `@` are checked
fully, as before. `import` writes global presets and applies the same check.

**Files.** Under `$XDG_CONFIG_HOME/rollin` (default `~/.config/rollin`):

```
presets.toml            global presets        [presets]
state.toml              active = "grog"
characters/grog.toml    [vars] str = 5        [presets] atk = "d20+@str"
```

All are hand-editable TOML and written atomically; saves edit an existing
file in place, so your comments and layout are kept. `default` is virtual until
something is saved on it: it appears in `characters` and can be used with no
file. If `state.toml` names a character whose file is gone, commands fail
with a message suggesting `rollin char default`. A file that is not valid
TOML or has the wrong types (a non-integer variable, say) is an error naming
the file; it is never overwritten by a failed command.

### Errors

An invalid formula prints the problem on stderr, repeats the formula with
carets under the offending part, and exits non-zero (nothing is printed on
stdout):

```
$ rollin "d20+"
error: expected a number, a dice group or '(', found end of input
  d20+
      ^
$ rollin "d20 / (3-3)"
error: division by zero
  d20 / (3-3)
        ^^^^^
$ rollin "6d10>=8 + 3"
error: a success count cannot be used in arithmetic; use it as a whole roll, or drop the success clause to sum the dice
  6d10>=8 + 3
  ^^^^^^^
$ rollin "2d6+1001d6"
error: dice per term cap (1000) exceeded by '1001d6'
  2d6+1001d6
      ^^^^
$ rollin 2x3
error: 'x' means repeat, and '3' has no dice to repeat
  2x3
  ^^
hint: for multiplication use *; did you mean 2*3?
$ rollin quit
error: 'quit' is a session command; run `rollin` with no arguments to start a session and type it there
$ rollin help
error: 'help' is a session command; run `rollin` with no arguments to start a session and type it there
hint: for command-line help, run `rollin --help`
```

Exceeding a cap names the cap and the term. Other errors: `unclosed '('`,
`arithmetic overflow`, `sides must be between 2 and 10000`, and so on.

### Output modes

By default each roll prints on one line, as above. Flags change the renderer;
all of them draw from the same result tree.

**Color.** On a terminal, dropped dice are dimmed, totals are bold, and when
the whole roll is a single d20 (`d20`, `d20+5`, `1d20-2`) a natural 20 is
bold green and a natural 1 bold red. Color is off when stdout is not a
terminal (for example piped) or when `NO_COLOR` is set to a non-empty value.
`--color <auto|always|never>` overrides it; the default is `auto`. Precedence:
`--color never` beats `--color always`, which beats `NO_COLOR`, which beats
terminal detection. Errors on stderr are always plain.

**Repeat and labels.** In the default output every line of a repeated formula
starts with its iteration number and `: `, right-aligned so the lines stay
lined up from 10 iterations up. With a list, each item's line in iteration k
carries `k`. A label trails the line after two spaces as `# text`, dimmed when
color is on. A formula without `Nx` or labels prints exactly as before.

```
$ rollin --seed 1 6x 4d6dl1
1: 4d6dl1  [4, 3, (1), 2]  →  9
2: 4d6dl1  [4, 3, (2), 2]  →  9
3: 4d6dl1  [6, 5, 5, (1)]  →  16
4: 4d6dl1  [6, 2, 5, (1)]  →  13
5: 4d6dl1  [6, 4, 6, (1)]  →  16
6: 4d6dl1  [(2), 3, 3, 3]  →  9
$ rollin --seed 1 '3x d20+8 # attack, d10+5 # damage'
1: d20+8  [9] + 8  →  17  # attack
1: d10+5  [3] + 5  →  8  # damage
2: d20+8  [5] + 8  →  13  # attack
2: d10+5  [9] + 5  →  14  # damage
3: d20+8  [19] + 8  →  27  # attack
3: d10+5  [8] + 5  →  13  # damage
$ rollin --seed 1 'd20+8 # attack'
d20+8  [9] + 8  →  17  # attack
```

`-q` prints one total per line, in order. `--json` adds `"iteration"` to each
roll of a repeated formula and `"label"` to each labelled roll (see the
schema doc); the rolls array stays flat, in the order rolled.

```
$ rollin --seed 1 -q 3x d20+8
17
10
13
```

Exploded dice are marked with a trailing `!` in the default output and the
word `exploded` in `--json`; a compounded die is one entry marked `!` whose
`--json` node lists the rolls it combined (`"parts"`):

```
$ rollin --seed 2 3d6!
3d6!  [2, 6, 4!, 4]  →  16
$ rollin --seed 2 3d6!!
3d6!!  [2, 10!, 4]  →  16
$ rollin --seed 2 3d6!p
3d6!p  [2, 6, 3!, 4]  →  15
```

Dice a reroll replaced are shown between tildes (`~1~`) in the default
output, with the die that replaced them right after, and as `rerolled` in
`--json`. With color on they are dim and crossed out (dropped dice are dim only):

```
$ rollin --seed 3 4d6r1
4d6r1  [~1~, 4, ~1~, 6, ~1~, 5, 4]  →  19
$ rollin --seed 8 4d6rr1
4d6rr1  [2, ~1~, ~1~, 5, 5, 6]  →  18
```

Success counts show each counting die's outcome after its value, `✓` for a
success and `✗` for a failure, and label the total as a count so it cannot
be mistaken for a sum: `3 successes`, `1 success`. When any die failed, the net
is followed by the breakdown, `2 successes (3 - 1 failure)`. With color on,
successes are green and failures red. `--json` carries each die's outcome and the tally; `-q` prints just the net number.

```
$ rollin --seed 6 6d10>=8
6d10>=8  [4, 5, 6, 4, 4, 1]  →  0 successes
$ rollin --seed 2 6d10>=8f1
6d10>=8f1  [6, 6, 1✗, 3, 9✓, 3]  →  0 successes (1 - 1 failure)
```

**Quiet (`-q`, `--quiet`).** Only the total of each roll, one per line, so
`$(rollin -q 2d6+3)` works in scripts. Errors still go to stderr with a
non-zero exit and nothing on stdout.

```
$ rollin -q "d20+8, d10+5" --seed 1
17
8
```

**JSON (`--json`).** The result tree as one line of JSON with a
`schema_version`; see [docs/json-schema.md](docs/json-schema.md) for the
schema and an example of every node type. `--json` wins over `-q`
(which is ignored).

## Session

`rollin` with no formula starts an interactive session, so you can roll
without retyping the program name:

```
$ rollin
rollin 2.0.0 — type 'help' for commands, 'quit' to exit
rollin> d20+5 --seed 4
d20+5  [15] + 5  →  20
rollin> set str 3
set str = 3 on 'default'
rollin> char new grog
created character 'grog' and made it active
rollin[grog]> set str 5
set str = 5 on 'grog'
rollin[grog]> save atk d20+@str # attack
saved 'atk' on 'grog': d20+@str # attack
rollin[grog]> atk --seed 4
(preset 'atk': d20+@str # attack)
d20+@str  [15] + 5  →  20  # attack
rollin[grog]> --char default d20+@str --seed 4
d20+@str  [15] + 3  →  18
rollin[grog]> d20+
error: expected a number, a dice group or '(', found end of input
  d20+
      ^
rollin[grog]> -q 2d6 --seed 1
7
rollin[grog]> history
 1  d20+5 --seed 4
 2  set str 3
 3  char new grog
 4  set str 5
 5  save atk d20+@str # attack
 6  atk --seed 4
 7  --char default d20+@str --seed 4
 8  d20+
 9  -q 2d6 --seed 1
10  history
rollin[grog]> quit
```

(The output lines above are real, from piping this script into `rollin`; the
prompts and the banner only appear on a terminal.)

**Every line is a one-shot command.** A line is split on whitespace into
words and run exactly like `rollin <words>`: the same flags (`--seed N`,
`-q`, `--json`, `--color X`, `--char X`, ...) work and apply to that line
only, and the output and errors are the same bytes. Quotes are unnecessary
(and would be taken literally): `#` labels and spaces work as typed, so
`d20+8 # attack` is the whole line. An error, including a bad flag, is printed
and the session carries on. Without `--seed` the session draws from one
entropy-seeded generator; a line that gives `--seed N` reseeds it, and
`rollin --seed N` at startup seeds the session once.

**Session-only commands.** `help` (a short summary), `quit` or `exit` (also
Ctrl-D), and `history` (the numbered lines typed, persisted ones first).
Ctrl-C discards the line being typed and keeps going. They are single words.
Alone as one-shot words they give an error saying they are session commands
(`rollin help` points to `rollin --help`); with other words after them they
are not special and give the usual `'help me' is not a valid formula` style
error. They cannot be preset or character names.

**Prompt.** `rollin> ` for the `default` character, `rollin[grog]> ` for any
other; it changes as soon as `char` does. If the active character cannot be
read the prompt is the plain one and the command that needs it reports the
error.

**Completion.** Tab completes (case-insensitively; several matches are listed
and the common part inserted):

- the first word: commands and preset names (`sn<Tab>` becomes `sneak`)
- after `roll` or `delete`: preset names; after `char`: `new`, `delete` and
  character names; after `char delete` and `--char`: character names
- after `set` and `unset`: variable names
- any word, or part of a formula, starting at an `@`: variable names, so
  `d20+@st<Tab>` becomes `d20+@str`
- a word starting with `-`: the long flags

Names come from the store afresh on each Tab; if it cannot be read there are
simply no candidates.

**History.** Lines are kept in `$XDG_CONFIG_HOME/rollin/history` (default
`~/.config/rollin/history`), a plain text file of up to 1000 lines: loaded
at the start and appended as you go. Blank lines, consecutive repeats and
`quit`/`exit` are not recorded. A history file that cannot be read or written
is a warning on stderr, never a failure.

**Piped input.** When stdin is not a terminal (`printf 'd20\n6x d6\n' | rollin`),
the same loop runs with no prompt, banner, editing or history file, reading
lines until end of input and exiting 0; `history` then lists this run's lines.

## Development

Requires a stable Rust toolchain (see `rust-toolchain.toml`).

```sh
cargo test
cargo fmt
cargo clippy --all-targets -- -D warnings
```

### Tests

Behaviour tests go through the CLI seam: the compiled `rollin` binary is run
as a process with `--seed`, `--json`, and a fresh temporary `XDG_CONFIG_HOME`
per test. `HOME` and the working directory are temporary too, so no test can
touch your real config or the checkout, even with `XDG_CONFIG_HOME` unset;
`tests/sandbox.rs` guards that and fails if a test spawns `rollin` by hand. The helper is `tests/common/mod.rs` (`Cli::new()`, `cli.run(&[..])`).

| Test file | What it covers |
| --- | --- |
| `tests/roll.rs` | End-to-end rolls, e.g. `rollin d20 --seed 1` |
| `tests/arithmetic.rs` | `+ - * /`, precedence, parentheses, result tree |
| `tests/errors.rs` | Error text with underlined spans, caps, overflow |
| `tests/repeat_labels.rs` | `Nx` repeat and `#` labels in every output mode, caps and errors, presets |
| `tests/output_modes.rs` | Color, `-q` and `--json` flag behaviour |
| `tests/presets.rs` | Preset commands, name rules, the TOML store, `import`, against a temp config dir |
| `tests/golden.rs` | Golden fixtures (the `--json` contract): formula + seed to expected output |
| `tests/v1_spec.rs` | The Python v1 test cases as a parity spec |
| `tests/session.rs` | The session over piped stdin: byte-for-byte parity with one-shot for a table of lines, parse errors, `help`, `quit`, `history` |
| `tests/session_lib.rs` | Prompt text and `Context::completion_data`, at the library API |
| `tests/completion.rs` | Tab completion as pure functions (`complete`), including `proptest` invariants |
| `tests/pty.rs` | Smoke tests in a real pseudo-terminal: starts and quits, Tab completes a name, history survives a restart, Ctrl-C clears the line, Ctrl-D exits 0, an unwritable history file warns once |
| `tests/readme_session.rs` | Replays the README's Session transcript through the binary and fails if the documented output drifts |
| `tests/sandbox.rs` | The harness keeps every spawn off the real `HOME`/config and out of the checkout |
| `tests/properties.rs` | `proptest` invariants at the library API, including "never panics" |
| `tests/fixtures_present.rs` | Committed fixtures (`presets.json`) are well-formed (`tests/presets.rs` imports and rolls it) |

The preset commands share one command layer in the library (`parse_command`
turns a list of words into a `Command`, `execute` runs it against a `Context`
and returns an `Output` for the binary to print); the one-shot binary and the
interactive session feed it the same way, through one `run_line`.

The pty tests (`rexpect`) are the one exception to the CLI-seam rule: a line
editor can only be exercised on a terminal. They use a 10 second timeout,
`TERM=xterm` and a temporary `HOME` and `XDG_CONFIG_HOME`, and match plain ASCII output
(rexpect reads bytes as Latin-1, so the `→` of the default output is avoided;
`--json` is used instead). Everything else about the session is tested with
piped stdin.

Run everything with `cargo test`. The CI jobs are `lint` (`cargo fmt --check`,
clippy with `-D warnings`) and `test` (`cargo test`).

#### Seeds and the pinned RNG

`--seed <N>` seeds a `rand_chacha::ChaCha8Rng` via `seed_from_u64`, so the same
seed and formula always print the same roll. Without `--seed`, the RNG is
seeded from OS entropy. The algorithm is pinned to ChaCha8 on purpose: changing
it (or the way dice are drawn) changes seeded output and invalidates every
golden fixture, so treat it as a deliberate decision.

#### Adding a golden case (data only)

Add a file `tests/fixtures/golden/<name>.json`; no Rust changes are needed:

```json
{ "formula": "2d6", "seed": 7, "expected": { "rolls": [ ... ] } }
```

Generate `expected` by running `rollin --seed <N> --json -- <formula>`, then check
by eye that the values are plausible (within die ranges) before committing. A
failing case is reported by file name.

#### Un-ignoring a v1 spec case

`tests/fixtures/v1_spec.toml` holds the Python v1 tests as data. Cases for
features not built yet have `status = "ignored"` and a `reason` naming the
ticket that owns them. When that ticket's feature works, change the case to
`status = "live"` and delete its `reason` line. Live cases must pass; ignored
cases are skipped and counted (run `cargo test --test v1_spec -- --nocapture`
to see the live/ignored totals).

## Data files

Everything rollin stores lives under `$XDG_CONFIG_HOME/rollin` (default
`~/.config/rollin`; an empty or relative `XDG_CONFIG_HOME` is ignored):

| Path | Contents |
| --- | --- |
| `presets.toml` | Global presets |
| `state.toml` | The active character |
| `characters/<name>.toml` | One character's variables and presets |
| `history` | Interactive-session history |

The TOML files are hand-editable and written atomically; see
[Presets](#presets) and [Characters and variables](#characters-and-variables)
for their layout. Set `XDG_CONFIG_HOME` to a scratch directory to try rollin
without touching your real data.

## Development

The crate is a library core (tokenizer, parser, evaluator with an injected
RNG, which never prints) plus a binary that owns arguments, rendering and
I/O. Design decisions are in [docs/adr](docs/adr), the glossary in
[CONTEXT.md](CONTEXT.md), and the `--json` schema in
[docs/json-schema.md](docs/json-schema.md).

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

CI runs these three on every pull request into `main`. Tests drive the
compiled binary as a process with `--seed` and a temporary
`XDG_CONFIG_HOME` (see `tests/common/mod.rs`); `proptest` covers library
invariants, and a pty test covers the interactive session. The formula
fixtures live in `tests/fixtures`.
