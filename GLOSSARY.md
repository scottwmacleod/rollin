# rollin

A command-line dice roller for tabletop RPGs. Players type dice formulas, optionally against a saved character, and see how each die contributed to the result.

## Language

### Rolling

**Formula**:
Text a player types that describes one or more rolls, e.g. `4d6dl1, d20+@str # attack`.
_Avoid_: Expression, command, notation

**Roll**:
One comma-separated part of a formula, and its evaluation, which produces a result. In code, `ast::Roll` is the parsed roll and `RollResult` is what evaluating it returns.
_Avoid_: Throw, check

**Term**:
One dice group or number within a roll, e.g. `4d6dl1` or `+3`. In code, a dice group is `DiceTerm`; the arithmetic that combines terms is `Arith`.
_Avoid_: Component, operand

**Die**:
One individual random value inside a term, with a record of whether it was kept, dropped, rerolled, or exploded.
_Avoid_: Dice result, face

**Total**:
The single number a roll produces.
_Avoid_: Sum, score

**Success count**:
A total made of how many dice met a condition instead of a sum of faces, e.g. `6d10>=8`; failures (`f1`) subtract, so it is successes minus failures and can be zero or negative. Cannot be mixed into arithmetic.
_Avoid_: Hits, pool result

**Advantage / disadvantage**:
The `adv` / `dis` suffix on a single die, e.g. `d20adv`: roll two dice and keep the highest (advantage) or lowest (disadvantage). Exactly `2d20kh1` / `2d20kl1`.
_Avoid_: Roll twice, double roll

**Label**:
A `#` note attached to one roll that is shown in the output, e.g. `# attack`.
_Avoid_: Comment, tag

**Game system**:
A rule set a character plays under (`dnd5e` so far) that gives rolls meaning: an **attack** (a **d20 check**) can be a **critical hit** (natural 20 on the kept die, or any kept d20 at or above the character's `crit_range`) or **critical miss** (natural 1), and a critical hit doubles the dice of its **damage** (later rolls without a d20, or marked `atk` / `dmg`).
_Avoid_: Ruleset, mode

**d20 check**:
A roll with exactly one d20 group that is either one d20, or two d20s keeping one (`adv`, `dis`, `kh1`, `kl1`). Its result is the one die left standing, and a natural 20 or 1 on it can crit. Other terms (`+5`) do not matter. Three or more d20s, a bare `2d20`, a success count (`6d20>=15`) and two separate d20 terms (`d20+d20`) are never a check. A game system uses this one rule for both a roll's attack role and its crit verdict.
_Avoid_: Attack roll, save

**Repeat**:
Evaluating the same list of rolls N times, written `Nx`.
_Avoid_: Loop, batch

### Saved data

**Preset**:
A named formula saved for reuse. Variables inside it are resolved when it is rolled, not when it is saved.
_Avoid_: Macro, alias, shortcut

**Character**:
A named sheet holding variables and presets for one player character. One is always active.
_Avoid_: Profile, sheet owner, user

**Variable**:
A named integer on a character, referenced as `@name`.
_Avoid_: Stat, attribute, modifier

**Global preset**:
A preset shared by all characters. A character's own preset of the same name shadows it.
_Avoid_: Default preset
