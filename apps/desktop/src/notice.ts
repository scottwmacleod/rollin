import type { Hint, Output } from "./api/generated";
import type { Notice } from "./log/model";

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

/** What a command prints: the library's `lines` (neutral text, listings
 * included) plus hints worded for the desktop. An empty listing's hint
 * continues its line, as it does in the CLI. */
export function noticeFor(output: Output): Notice | null {
  if (output.kind === "rolls") return null;
  let lines = output.lines;
  let hints = output.hints.map(hintText);
  if (lines.length > 0 && hints.length > 0) {
    lines = [...lines.slice(0, -1), `${lines[lines.length - 1]} ${hints[0]}`];
    hints = hints.slice(1);
  }
  return { lines, hints };
}
