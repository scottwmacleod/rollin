# `--json` schema

`rollin --json <formula>` prints one JSON document on a single line. It is the
stable, machine-readable form of the result tree. `-q` is ignored
when `--json` is given, and `--color` has no effect (JSON is never colored).

The contract is enforced by the golden fixtures in `tests/fixtures/golden/`
(`tests/golden.rs`): each file pairs a formula and `--seed` with the exact
expected document. Every node type below has at least one fixture.

## Versioning

The top-level `schema_version` is an integer, currently `1`. It is bumped
whenever the shape or meaning of an existing field changes or a field is
removed. Adding a new field or a new node `type` or die `status` value is
backwards compatible and does not bump it (exploding dice added the die
status `exploded`, the die field `parts` and the dice-node field `sides`
without a bump; rerolls added the die status `rerolled` the same way; success counting added the roll and dice-node field `kind`, the dice-node fields `successes` and `failures`, and the die field `outcome` the same way; percentile dice added the dice-node field `special` the same way, and repeat and labels added the roll fields `iteration` and `label` the same way), so consumers must ignore unknown
fields and treat unknown `status` values as "not counted" unless documented
otherwise.

## Document

```json
{"schema_version": 1, "rolls": [ <roll>, ... ]}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | Schema version, see above |
| `rolls` | array of roll | One entry per comma-separated item, in order |

On error nothing is printed on stdout (the error goes to stderr and the exit
status is non-zero), so a successful run always yields a valid document.

## Roll

| Field | Type | Meaning |
| --- | --- | --- |
| `formula` | string | The item as written (trimmed) |
| `total` | integer | The roll's total; equals `expr`'s total |
| `expr` | node | The result tree |
| `kind` | string | `"count"` for a success count. **Absent for an ordinary sum**, so existing documents are unchanged |
| `label` | string | The item's `# label` text, trimmed. **Absent when the item had no label** (additive) |
| `iteration` | integer | For a formula repeated with `Nx`, which repeat (from 1) this roll belongs to. **Absent when the formula had no `Nx`** (additive) |

`formula` never includes the label. A repeated formula yields N times as many
rolls, in evaluation order: for `2x d20, d6` the rolls are iteration 1's `d20`
and `d6`, then iteration 2's. The array stays flat; group by `iteration` to
rebuild the repeats. These are additive changes: `schema_version` stays 1.

## Nodes

Every node is an object with a `type` field. All numbers are integers.

### `number`

A literal.

```json
{"type": "number", "value": 15}
```

### `dice`

A dice group. `dice` lists every die in roll order, including dropped ones;
an exploded die's extra dice follow it immediately. `subtotal` is the sum of
the dice whose status counts (`kept` and `exploded`).

```json
{"type": "dice", "term": "4d6dl1", "sides": 6,
 "dice": [{"value": 1, "status": "dropped"}, {"value": 4, "status": "kept"},
          {"value": 1, "status": "kept"}, {"value": 6, "status": "kept"}],
 "subtotal": 11}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `term` | string | The term as written, e.g. `4d6dl1` |
| `sides` | integer | Faces on each die (additive; added with exploding dice) |
| `dice` | array of die | Every die rolled |
| `subtotal` | integer | Sum of the dice whose status counts |
| `special` | string | `"percentile"` for `d%`. **Absent on ordinary dice**, so existing documents are unchanged (additive) |
| `modifiers` | array of string | The term's modifier clauses as written, in the order they apply: reroll, explode, keep/drop (or `adv`/`dis`), then success. **Absent when the term has none** (additive; see "Why a die is what it is") |

A die is `{"value": <integer>, "status": <string>}`, plus an optional `parts`
array, an optional `outcome` and an optional `reason`. Statuses:

| Status | Counts toward `subtotal` | Meaning |
| --- | --- | --- |
| `kept` | yes | An original die that was not dropped |
| `dropped` | no | Removed by a drop/keep clause (this wins over `exploded`: a dropped extra die is `dropped`) |
| `exploded` | yes | An extra die rolled because an earlier die exploded |
| `rerolled` | no | A value a reroll (`r`, `rr`) replaced; the die that replaced it follows immediately |

Later features add statuses; consumers should treat a status they do not know
as not counting.

`parts` is present only on a compounded die (`!!`) that actually exploded: the
rolls added together into `value`, in order, so `value` is their sum. A
compounded die that did not explode has no `parts`.

#### Why a die is what it is

A consumer can explain every die without re-parsing the term. The dice node
lists its `modifiers` as written (`["r1", "!", "dl1"]` for `4d6r1!dl1`; a
success clause is one entry, `">=8f1"`), and a die touched by a clause carries
`reason`:

| Field | Type | Meaning |
| --- | --- | --- |
| `clause` | string | The clause as written, one of the node's `modifiers` |
| `from` | integer | Index into the same node's `dice` of the die that caused this one. **Absent when there is no such die** |
| `also` | string | A second clause that shaped the same die: `"!!"` on a compounded die that is also a reroll replacement. **Absent otherwise** |

`reason` is absent on a die no clause touched. A die has one reason; a
`dropped` die always gets the keep/drop clause (as `dropped` wins over the
other statuses), even if it was also a reroll replacement or an extra die. A compounded (`!!`) die that is also a reroll replacement keeps the reroll reason, so its `from` link survives, and names the compound clause in `also`.

| Clause family | Die | `reason` |
| --- | --- | --- |
| reroll (`r`, `rr`) | the `rerolled` die | `{"clause": "r1"}` |
| reroll | the die that replaced it | `{"clause": "r1", "from": <index of the rerolled die>}`; with `rr`, a replacement that is itself rerolled also carries `from`, so a chain links die to die |
| explode (`!`) and penetrate (`!p`) | each `exploded` extra die | `{"clause": "!", "from": <index of the die it exploded from>}`; a chained extra points at the extra before it |
| compound (`!!`) | the one die that exploded (it has `parts`) | `{"clause": "!!"}`; if it is also a reroll replacement, `{"clause": "r1", "from": <index>, "also": "!!"}` |
| keep/drop (`dl`, `dh`, `kl`, `kh`, `adv`, `dis`) | each `dropped` die | `{"clause": "kh2"}` |

Success counting keeps using `outcome`. Examples (shortened, `rollin --json`):

Reroll, `rollin --seed 3 --json 4d6r1`: the first die showed 1 and was
rerolled into a 4.

```json
{"type": "dice", "term": "4d6r1", "sides": 6, "modifiers": ["r1"],
 "dice": [{"value": 1, "status": "rerolled", "reason": {"clause": "r1"}},
          {"value": 4, "status": "kept", "reason": {"clause": "r1", "from": 0}},
          ...]}
```

Explode, `rollin --seed 2 --json 3d6!`: the extra die at index 2 exploded from
the 6 at index 1.

```json
{"type": "dice", "term": "3d6!", "sides": 6, "modifiers": ["!"],
 "dice": [{"value": 2, "status": "kept"}, {"value": 6, "status": "kept"},
          {"value": 4, "status": "exploded", "reason": {"clause": "!", "from": 1}},
          {"value": 4, "status": "kept"}],
 "subtotal": 16}
```

Compound, `rollin --seed 2 --json 3d6!!`:

```json
{"value": 10, "status": "kept", "parts": [6, 4], "reason": {"clause": "!!"}}
```

Penetrate, `rollin --seed 2 --json 3d6!p`: as for `!`, with the clause `!p`.

```json
{"value": 3, "status": "exploded", "reason": {"clause": "!p", "from": 1}}
```

Keep/drop, `rollin --seed 3 --json 4d6dl1`:

```json
{"type": "dice", "term": "4d6dl1", "sides": 6, "modifiers": ["dl1"],
 "dice": [{"value": 1, "status": "dropped", "reason": {"clause": "dl1"}},
          {"value": 4, "status": "kept"}, {"value": 1, "status": "kept"},
          {"value": 6, "status": "kept"}],
 "subtotal": 11}
```

`d20dis` gives `"modifiers": ["dis"]` and a dropped die with
`{"clause": "dis"}`. This is an additive change: `schema_version` stays 1.

#### Exploding dice

`3d6!` explodes each die showing its maximum: the extra die appears right
after the die that triggered it with status `exploded` (and can itself
trigger another). With `!!` the extra rolls are folded into the one die
(`parts`). With `!p` the extras are separate `exploded` dice whose `value` is
the roll minus one (a roll of 1 counts 0; whether a die explodes is decided
by the roll before the subtraction). Keep/drop clauses apply to the whole pool
after exploding. `rollin --seed 2 --json 3d6!` (shortened):

```json
{"type": "dice", "term": "3d6!", "sides": 6,
 "dice": [{"value": 2, "status": "kept"}, {"value": 6, "status": "kept"},
          {"value": 4, "status": "exploded"}, {"value": 4, "status": "kept"}],
 "subtotal": 16}
```

and `rollin --seed 2 --json 3d6!!` has the die
`{"value": 10, "status": "kept", "parts": [6, 4]}`.

#### Rerolls

`4d6r1` rerolls each die showing 1, once; `rr` rerolls until the die no
longer matches (at most 100 rerolls per die). The value a reroll replaced
stays in `dice` with status `rerolled`, immediately before the die that
replaced it (several in a row under `rr`). That replacement is an ordinary
`kept` die (or `dropped` by a keep/drop clause, which only sees the dice that
stand). Rerolled dice never count toward `subtotal`. Order of operations:
reroll, then explode, then keep/drop. `rollin --seed 8 --json 4d6rr1`
(shortened):

```json
{"type": "dice", "term": "4d6rr1", "sides": 6,
 "dice": [{"value": 2, "status": "kept"}, {"value": 1, "status": "rerolled"},
          {"value": 1, "status": "rerolled"}, {"value": 5, "status": "kept"},
          {"value": 5, "status": "kept"}, {"value": 6, "status": "kept"}],
 "subtotal": 18}
```

This is an additive change: `schema_version` stays 1.

#### Success counting

`6d10>=8` is a success count: its `total` is a number of dice, not a sum of
faces. The roll gets `"kind": "count"` and so does the dice node, which also
gets `successes` and `failures` (both always present on a count; `failures` is
0 without an `f` clause). `subtotal` and the roll's `total` are the net,
`successes - failures`, and may be zero or negative. Only dice that count
(`kept`, `exploded`) are scored: each carries `"outcome": "success"` if it
met the success condition, or `"failure"` if it did not but met the failure
condition (success wins when both match). `outcome` is absent on every other
die, and on every die of a sum. A consumer that sees no `kind` has a sum.
Order of operations: reroll, explode, keep/drop, then success counting.
`rollin --seed 2 --json 6d10>=8f1` (shortened):

```json
{"formula": "6d10>=8f1", "kind": "count", "total": 0,
 "expr": {"type": "dice", "term": "6d10>=8f1", "sides": 10,
  "dice": [{"value": 6, "status": "kept"}, {"value": 6, "status": "kept"},
           {"value": 1, "status": "kept", "outcome": "failure"},
           {"value": 3, "status": "kept"},
           {"value": 9, "status": "kept", "outcome": "success"},
           {"value": 3, "status": "kept"}],
  "subtotal": 0, "kind": "count", "successes": 1, "failures": 1}}
```

A success count is never an operand: `neg`, `chain` and arithmetic never
contain one, and at most it appears inside `group` nodes. This is an additive
change: `schema_version` stays 1.

#### Advantage and percentile dice

`d20adv` and `d20dis` are sugar for `2d20kh1` and `2d20kl1`: the node is the
same as for those formulas (two dice, the loser `dropped`) except `term`,
which is what was typed (`d20adv`). They add nothing to the schema.

`d%` is a d100: `sides` is 100 and `special` is `"percentile"`.

This is an additive change: `schema_version` stays 1.

### `neg`

Unary minus.

```json
{"type": "neg", "operand": {"type": "dice", "term": "d6", "sides": 6,
 "dice": [{"value": 2, "status": "kept"}], "subtotal": 2}, "total": -2}
```

### `group`

A parenthesised expression; `total` equals the inner total.

```json
{"type": "group", "inner": <node>, "total": 8}
```

### `chain`

Operands joined by operators of one precedence level, applied left to right.
`first` is the leftmost operand and `rest` the following `{op, node}` links;
`op` is one of `"+"`, `"-"`, `"*"`, `"/"` (division truncates toward zero).
A higher-precedence operation appears as a nested `chain` operand.

```json
{"type": "chain",
 "first": {"type": "dice", "term": "d20", "sides": 20,
           "dice": [{"value": 3, "status": "kept"}], "subtotal": 3},
 "rest": [{"op": "+", "node": {"type": "number", "value": 5}}],
 "total": 8}
```

## Complete example

`rollin --seed 1 --json "d20+8, d10+5"` (a comma list gives one roll each):

```json
{"schema_version": 1, "rolls": [
  {"formula": "d20+8", "total": 17, "expr": {"type": "chain",
    "first": {"type": "dice", "term": "d20", "sides": 20, "dice": [{"value": 9, "status": "kept"}], "subtotal": 9},
    "rest": [{"op": "+", "node": {"type": "number", "value": 8}}], "total": 17}},
  {"formula": "d10+5", "total": 8, "expr": {"type": "chain",
    "first": {"type": "dice", "term": "d10", "sides": 10, "dice": [{"value": 3, "status": "kept"}], "subtotal": 3},
    "rest": [{"op": "+", "node": {"type": "number", "value": 5}}], "total": 8}}
]}
```

With repeat and labels, `rollin --seed 1 --json "2x d20+8 # attack"` adds
`"label": "attack"` and `"iteration": 1` (then `2`) to each roll
(`expr` shortened):

```json
{"schema_version": 1, "rolls": [
  {"formula": "d20+8", "total": 17, "expr": {...}, "label": "attack", "iteration": 1},
  {"formula": "d20+8", "total": 10, "expr": {...}, "label": "attack", "iteration": 2}
]}
```

(The real output is a single line; it is wrapped here for reading.)
