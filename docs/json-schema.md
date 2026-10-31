# `--json` schema

`rollin --json <formula>` prints one JSON document on a single line. It is the
stable, machine-readable form of the result tree. `-q` and `-v` are ignored
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
without a bump), so consumers must ignore unknown
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

A die is `{"value": <integer>, "status": <string>}`, plus an optional `parts`
array. Statuses:

| Status | Counts toward `subtotal` | Meaning |
| --- | --- | --- |
| `kept` | yes | An original die that was not dropped |
| `dropped` | no | Removed by a drop/keep clause (this wins over `exploded`: a dropped extra die is `dropped`) |
| `exploded` | yes | An extra die rolled because an earlier die exploded |

Later features add statuses (rerolls add `rerolled`, which will not count);
consumers should treat a status they do not know as not counting.

`parts` is present only on a compounded die (`!!`) that actually exploded: the
rolls added together into `value`, in order, so `value` is their sum. A
compounded die that did not explode has no `parts`.

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

(The real output is a single line; it is wrapped here for reading.)
