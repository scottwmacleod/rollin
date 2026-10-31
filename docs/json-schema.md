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
backwards compatible and does not bump it, so consumers must ignore unknown
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

A dice group. `dice` lists every die in roll order, including dropped ones.
`subtotal` is the sum of the `kept` dice.

```json
{"type": "dice", "term": "4d6dl1",
 "dice": [{"value": 1, "status": "dropped"}, {"value": 4, "status": "kept"},
          {"value": 1, "status": "kept"}, {"value": 6, "status": "kept"}],
 "subtotal": 11}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `term` | string | The term as written, e.g. `4d6dl1` |
| `dice` | array of die | Every die rolled |
| `subtotal` | integer | Sum of kept dice |

A die is `{"value": <integer>, "status": <string>}`. Statuses today are
`kept` (counts toward the subtotal) and `dropped` (does not). Later features
add statuses such as exploded and rerolled dice.

### `neg`

Unary minus.

```json
{"type": "neg", "operand": {"type": "dice", "term": "d6",
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
 "first": {"type": "dice", "term": "d20",
           "dice": [{"value": 3, "status": "kept"}], "subtotal": 3},
 "rest": [{"op": "+", "node": {"type": "number", "value": 5}}],
 "total": 8}
```

## Complete example

`rollin --seed 1 --json "d20+8, d10+5"` (a comma list gives one roll each):

```json
{"schema_version": 1, "rolls": [
  {"formula": "d20+8", "total": 17, "expr": {"type": "chain",
    "first": {"type": "dice", "term": "d20", "dice": [{"value": 9, "status": "kept"}], "subtotal": 9},
    "rest": [{"op": "+", "node": {"type": "number", "value": 8}}], "total": 17}},
  {"formula": "d10+5", "total": 8, "expr": {"type": "chain",
    "first": {"type": "dice", "term": "d10", "dice": [{"value": 3, "status": "kept"}], "subtotal": 3},
    "rest": [{"op": "+", "node": {"type": "number", "value": 5}}], "total": 8}}
]}
```

(The real output is a single line; it is wrapped here for reading.)
