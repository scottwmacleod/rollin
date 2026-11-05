import type { Execution } from "./api/types";
import type { LogEntry, RollDocument } from "./log/types";

let nextId = 1;

/**
 * The log entry for one executed line, or null if it has nothing to show
 * there. Only rolls and errors have a log form; the other outputs (`save`,
 * `set`, `help`, ...) change the sidebar instead.
 */
export function entryFor(line: string, execution: Execution, time: Date = new Date()): LogEntry | null {
  const id = nextId++;
  switch (execution.status) {
    case "ok": {
      const out = execution.output;
      if (out.kind !== "rolls") return null;
      const preset = out.preset ? { name: out.preset[0], expansion: out.preset[1] } : undefined;
      return {
        id,
        time,
        input: line,
        preset,
        // The wire `Roll` is the `--json` roll; the log types it a little more narrowly.
        result: { ok: true, doc: { schema_version: 1, rolls: out.rolls as RollDocument["rolls"] } },
      };
    }
    case "error": {
      const { span, source, error } = execution;
      return {
        id,
        time,
        input: line,
        result: {
          ok: false,
          message: error.message,
          ...(source !== null && span !== null ? { source, span: [span.start, span.end] as [number, number] } : {}),
        },
      };
    }
    case "rejected":
      return { id, time, input: line, result: { ok: false, message: execution.message } };
    default:
      return null;
  }
}
