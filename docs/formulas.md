# Formula reference

What a player can type into rollin. Terms are defined in [GLOSSARY.md](../GLOSSARY.md). The behaviour here is pinned by the engine's tests and by the parity fixtures in `packages/engine/fixtures/parity`.

## Formula syntax

Formulas are case-insensitive and spaces are ignored (except that a space
ends a `@variable` name; see [Variables](#variables)). Every v1 formula means
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
| `8d10!>=8>=8`, `4d6!>5>=6` | Explode and count successes: `!` takes the first comparison as its explode condition, so the success clause needs its own (`8d10!>=8` is a sum that explodes on 8+, not a count) |
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
or not (`6x`, `6 x`, `6X`). Each iteration is numbered in the roll log. It is an error to use `Nx` a second time
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
"unclosed '('" error.

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
the result but never count toward the total. A reroll
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
A natural 20 or 1 is highlighted on the kept die of a d20 check, so in `d20adv` the winning die is highlighted and the dropped one never.
`d%` is a d100 whose faces and RNG use are identical to `d100`; the formula
and term are echoed as typed (`d%`).

Limits: 1 to 1000 dice per term, 2 to 10000 sides, 10000 dice rolled per
roll (one comma-separated item, explosion dice included), and nesting (parentheses and unary minus)
32 deep. Dropping or keeping that leaves no dice is an error.


## Variables

A **character** holds named integer **variables**. `@name` (any letter case) can be used anywhere a number can: modifiers, dice count and sides, keep/drop counts, explode, reroll and success thresholds, and the repeat count.

| Formula | With `level = 3`, `sides = 8`, `n = 2`, `keep = 2`, `dc = 8` |
| --- | --- |
| `@level d6` | `3d6` |
| `d@sides` | `d8` |
| `@n x 4d6kh@keep` | two rolls of `4d6kh2` |
| `6d10>=@dc` | `6d10>=8` |

A variable is replaced by its number before the formula is parsed, so `d20+@str` rolls exactly like `d20+5`. A variable name takes every letter, digit and `_` after the `@`, so **put a space between a variable and a dice letter that follows it**: write `@level d6`, not `@leveld6` (which is the variable `leveld6`). After the `d` the name ends at the next character that cannot be in a name, so `d@sides+1`, `d@sides!` and `(d@sides)` are fine, but `d@sideskh1` is the variable `sideskh1`. A negative variable acts like a typed negative number (`d20+@str` with `str = -1` is `d20-1`), but as a dice count or sides it is an error. `@` alone, or `@` followed by a digit or `_`, is a syntax error.

Variable names are case-insensitive, stored lowercase, and match `[a-z][a-z0-9_]*`. A value is a whole number.

An error about a variable's value underlines the `@name` and says what it was. An undefined variable names the character, lists what is defined, and suggests a near miss (within two edits).

## Presets

A **preset** is a named formula saved once and rolled by name. A preset belongs to a character, or is **global** and available to every character. A character's own preset shadows a global preset of the same name.

Presets resolve their variables **when rolled**, not when saved, so changing `str` changes `atk`. Saving checks the formula's syntax only when it uses `@` (the variable may not exist yet); a formula without `@` is checked fully.

**Names** are stored lowercase and must match `[a-z][a-z0-9_-]*`. A name is rejected when it is a reserved dice keyword (`adv dis dl dh kl kh r rr p f d`), or would itself parse as a dice formula (`d20`, `D6`).

## Characters

There is always one active character, and a character called `default` always exists, so plain use needs no setup.

## Game systems

A character can play under a game system, which gives some rolls meaning beyond their total. The only system is `dnd5e`. Without one, no roll is ever a critical hit.

Under `dnd5e`, a roll with a single d20 is an attack, and a natural 20 on its kept die (so `d20adv` counts) is a critical hit; a natural 1 is a critical miss, which only flags the roll. Every later roll in the formula with no d20 is damage from the nearest attack before it. When that attack is a critical hit the damage rolls twice as many dice (`1d8+3` rolls `2d8+3`; flat numbers are added once).

```
d20+5, 1d8+3, 2d6 # sneak
d20+5  [20] + 5  →  25  CRITICAL HIT
1d8+3  [8, 3] + 3  →  14  (dice doubled)
2d6  [1, 6, 4, 4]  →  15  (dice doubled)  # sneak
```

An `atk` or `dmg` word after a roll, before any `# label`, sets its role instead of inferring it: `d20+5 atk, 1d8 dmg`. Without a system the words change nothing. Each `Nx` repeat pairs its attacks and damage afresh.

A character can widen its critical hits with a **crit range**, the lowest kept d20 that counts (`19` means 19-20, as for a Champion fighter). It takes an integer from 2 to 20, defaults to 20, and applies under a system only; a natural 1 stays the only critical miss. The die is highlighted only on a natural 20 or 1, so a 19 shows `CRITICAL HIT` without the highlight.

A `crit` word after a roll (before any `# label`, and in either order with `atk` / `dmg`) doubles that roll's dice by hand, with or without a system: `1d8+3 crit` rolls `2d8+3`. It marks the roll `(dice doubled)`, but never as a critical hit, which is only for a natural roll. A roll with no dice is unchanged, and it overrides the attack pairing: the `crit` roll doubles whatever the attack was.

### The d20 check rule

A check is `1d20`, or `2d20` keeping one die (`adv`, `dis`, `kh1`, `kl1`, `dl1`, `dh1`). Never a check, even when a 20 or a 1 comes up: `3d20`, a bare `2d20`, a lone `d20!` or `d20!!`, any exploding group (`2d20!kh1`), success counts, and `d20+d20`.

## Errors

An invalid formula gives an error with the offending part marked, and often a hint:

| Formula | Error |
| --- | --- |
| `d20+` | expected a number, a dice group or `(`, found end of input |
| `d20 / (3-3)` | division by zero |
| `6d10>=8 + 3` | a success count cannot be used in arithmetic |
| `2d6+1001d6` | dice per term cap (1000) exceeded by `1001d6` |
| `2x3` | `x` means repeat, and `3` has no dice to repeat; hint: for multiplication use `*` |

Exceeding a cap names the cap and the term. Other errors: `unclosed '('`, `number is too large`, `sides must be between 2 and 10000`, and so on.
