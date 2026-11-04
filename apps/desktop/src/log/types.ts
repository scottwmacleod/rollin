// The `--json` document (docs/json-schema.md), as the front end receives it.
// Consumers ignore unknown fields and treat unknown statuses as "not counted".

export type DieStatus = "kept" | "dropped" | "exploded" | "rerolled" | (string & {});

export interface DieReason {
  clause: string;
  /** Index into the same node's `dice` of the die that caused this one. */
  from?: number;
  also?: string;
}

export interface Die {
  value: number;
  status: DieStatus;
  parts?: number[];
  outcome?: "success" | "failure";
  reason?: DieReason;
}

export type Op = "+" | "-" | "*" | "/";

export type Node =
  | { type: "number"; value: number }
  | {
      type: "dice";
      term: string;
      sides: number;
      dice: Die[];
      subtotal: number;
      special?: string;
      modifiers?: string[];
      kind?: "count";
      successes?: number;
      failures?: number;
    }
  | { type: "neg"; operand: Node; total: number }
  | { type: "group"; inner: Node; total: number }
  | { type: "chain"; first: Node; rest: { op: Op; node: Node }[]; total: number };

export interface Roll {
  formula: string;
  total: number;
  expr: Node;
  kind?: "count";
  label?: string;
  iteration?: number;
}

export interface RollDocument {
  schema_version: number;
  rolls: Roll[];
}

/** A formula error: the CLI's message plus the byte range it points at. */
export interface ErrorResult {
  message: string;
  /** The text the error is about, when it is a formula. */
  source?: string;
  /** UTF-8 byte range into `source`. */
  span?: [number, number];
}

/** One submit. */
export interface LogEntry {
  id: string | number;
  time: Date;
  /** What was typed. */
  input: string;
  /** What a preset expanded to, e.g. `adv-attack`, `d20adv+5`. */
  preset?: { name: string; expansion: string };
  result: { ok: true; doc: RollDocument } | ({ ok: false } & ErrorResult);
}
