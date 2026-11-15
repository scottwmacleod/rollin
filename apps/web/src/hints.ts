import type { Hint } from "@rollin/engine";

/** The web wording of a hint. Hints are data from the engine; each front end words them. */
export function hintText(hint: Hint): string {
  switch (hint.kind) {
    case "did_you_mean":
      return `hint: did you mean '${hint.name}'?`;
    case "did_you_mean_variable":
      return `did you mean @${hint.name}?`;
    case "list_presets":
      return "hint: your saved presets are in the sidebar";
    case "create_character":
      return `hint: create it with: char new ${hint.name}`;
    case "set_variable":
      return `set it with: set ${hint.name} <value>${hint.explicit ? ` (on '${hint.character}')` : ""}`;
    case "delete_global_preset":
      return `hint: it is a global preset; delete it with: delete ${hint.name} --global`;
    case "use_help_flag":
      return "hint: for the list of commands, run `help`";
    case "defined_variables":
      return hint.names.length === 0
        ? "no variables are defined"
        : `defined: ${hint.names.join(", ")}`;
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
