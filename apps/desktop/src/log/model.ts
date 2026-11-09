// The log's own types: what one submit looks like once the front end has
// turned a Session result into something to draw. The wire types it is built
// from are generated (api/generated.ts); none are redefined here.

import type { Roll } from "../api/generated";

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
  /** Next-step hints, already worded for the desktop. */
  hints?: string[];
}

/** What a command other than a roll printed: its lines, then any next-step hints. */
export interface Notice {
  lines: string[];
  hints: string[];
}

/** One submit. */
export interface LogEntry {
  id: string | number;
  time: Date;
  /** What was typed. */
  input: string;
  /** What a preset expanded to, e.g. `adv-attack`, `d20adv+5`. */
  preset?: { name: string; expansion: string };
  result: { ok: true; doc: RollDocument } | { ok: true; notice: Notice } | ({ ok: false } & ErrorResult);
}
