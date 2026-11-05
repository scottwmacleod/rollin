import type { Hint, Output, PresetEntry } from "./api/types";
import type { Notice } from "./log/types";

/** The desktop wording of a hint. Hints are data from the library; each front
 * end words them for itself. The desktop has one command box, so commands are
 * written as typed there, without the `rollin` prefix the CLI uses. */
export function hintText(hint: Hint): string {
  switch (hint.kind) {
    case "did_you_mean":
      return `hint: did you mean '${hint.name}'?`;
    case "did_you_mean_variable":
      return `did you mean @${hint.name}?`;
    case "list_presets":
      return "hint: run `presets` to list saved presets";
    case "create_character":
      return `hint: create it with: char new ${hint.name}`;
    case "set_variable":
      return `set it with: set ${hint.name} <value>${hint.explicit ? ` (on '${hint.character}')` : ""}`;
    case "delete_global_preset":
      return `hint: it is a global preset; delete it with: delete ${hint.name} --global`;
    case "use_help_flag":
      return "hint: for the list of commands, run `help`";
    case "defined_variables":
      return hint.names.length === 0 ? "no variables are defined" : `defined: ${hint.names.join(", ")}`;
    case "use_multiplication":
      return hint.suggestion === null
        ? "hint: for multiplication use *"
        : `hint: for multiplication use *; did you mean ${hint.suggestion}?`;
    case "add_preset":
      return "Add one with: save <name> <formula>";
    case "add_variable":
      return "Add one with: set <name> <integer>";
  }
}

function presetLines(presets: PresetEntry[]): string[] {
  const width = (f: (p: PresetEntry) => string) => Math.max(...presets.map((p) => [...f(p)].length));
  const nameW = width((p) => p.name);
  const formulaW = width((p) => p.formula);
  const pad = (s: string, w: number) => s + " ".repeat(w - [...s].length);
  return presets.map((p) => {
    const source = p.source.kind === "global" ? "global" : p.source.name;
    const note =
      p.shadow.kind === "shadows" ? ", shadows global" : p.shadow.kind === "shadowed_by" ? `, shadowed by ${p.shadow.by}` : "";
    return `${pad(p.name, nameW)}  ${pad(p.formula, formulaW)}  [${source}${note}]`;
  });
}

/** What a command prints. The library's `lines` are the neutral text for
 * single-line results; listings (`vars`, `presets`, `characters`) come back
 * empty and are laid out here from the typed data, as the CLI does. An empty
 * listing's hint continues its line, as it does in the CLI. */
export function noticeFor(output: Output): Notice | null {
  let lines = output.lines;
  let hints = output.hints.map(hintText);
  switch (output.kind) {
    case "rolls":
      return null;
    case "characters": {
      lines = output.names.map((n) => `${n === output.active ? "*" : " "} ${n}`);
      if (!output.names.includes(output.active)) lines.push(`* ${output.active} (missing)`);
      break;
    }
    case "vars":
      if (output.vars.length > 0) lines = output.vars.map(([name, value]) => `${name} = ${value}`);
      break;
    case "presets":
      if (output.presets.length > 0) lines = presetLines(output.presets);
      break;
  }
  if (lines.length > 0 && hints.length > 0 && output.lines.length > 0) {
    // Single-line outputs: the first hint continues the last line.
    lines = [...lines.slice(0, -1), `${lines[lines.length - 1]} ${hints[0]}`];
    hints = hints.slice(1);
  }
  return { lines, hints };
}
