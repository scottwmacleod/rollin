#!/usr/bin/env python3
import re
from datetime import datetime

from prompt_toolkit import PromptSession
from prompt_toolkit.completion import Completer, Completion

import parser as dice_parser
import presets as preset_store
import roller


# ── Tab completion ──────────────────────────────────────────────────────────

COMMANDS = ["delete", "help", "history", "presets", "quit", "roll", "save"]
PRESET_COMMANDS = {"roll", "delete"}

_WORD_RE = re.compile(r"[^\s]+")


class DiceCompleter(Completer):
    def get_completions(self, document, complete_event):
        text = document.text_before_cursor
        word = document.get_word_before_cursor(pattern=_WORD_RE)
        tokens = text.lstrip().split()

        if not tokens or (len(tokens) == 1 and not text.endswith(" ")):
            for cmd in COMMANDS:
                if cmd.startswith(word):
                    yield Completion(cmd, start_position=-len(word))
            return

        cmd = tokens[0].lower()
        if cmd in PRESET_COMMANDS and (len(tokens) == 1 or (len(tokens) == 2 and not text.endswith(" "))):
            for name in sorted(preset_store.load_presets().keys()):
                if name.startswith(word):
                    yield Completion(name, start_position=-len(word))


# ── Formatting ─────────────────────────────────────────────────────────────

def format_result(result: roller.RollResult) -> str:
    parts = []
    for d in result.dice_results:
        if d.dropped:
            parts.append(f"({d.value})")
        else:
            parts.append(str(d.value))

    dice_str = "[" + ", ".join(parts) + "]"

    if result.modifier > 0:
        expr = f"{dice_str} + {result.modifier}"
    elif result.modifier < 0:
        expr = f"{dice_str} - {abs(result.modifier)}"
    else:
        expr = dice_str

    return f"  {result.formula:<18} {expr}  →  {result.total}"


def do_roll(formula_text: str, history: list) -> None:
    try:
        parsed_list = dice_parser.parse_formulas(formula_text)
    except dice_parser.FormulaError as e:
        print(f"Error: {e}")
        return

    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{timestamp}]")

    results = []
    for pf in parsed_list:
        if pf.fixed_value is not None:
            print(f"  {pf.raw:<18} →  {pf.fixed_value}")
            continue
        result = roller.roll(
            formula=pf.raw,
            count=pf.count,
            sides=pf.sides,
            modifier=pf.modifier,
            drop_lowest=pf.drop_lowest,
            drop_highest=pf.drop_highest,
        )
        print(format_result(result))
        results.append(result)

    history.append({"time": timestamp, "input": formula_text, "results": results})
    print()


# ── Commands ───────────────────────────────────────────────────────────────

def cmd_roll(args: str, history: list) -> None:
    if not args:
        print("Usage: roll <formula> [, formula2, ...]  or  roll <preset-name>")
        return

    # Check if it's a preset name (single token, no spaces or commas)
    if " " not in args and "," not in args:
        formula = preset_store.get_preset(args.strip())
        if formula:
            print(f"  (preset '{args.strip()}': {formula})")
            do_roll(formula, history)
            return

    do_roll(args, history)


def cmd_save(args: str) -> None:
    parts = args.split(None, 1)
    if len(parts) < 2:
        print("Usage: save <name> <formula> [, formula2, ...]")
        return
    name, formula = parts[0], parts[1]
    # Validate the formula before saving
    try:
        dice_parser.parse_formulas(formula)
    except dice_parser.FormulaError as e:
        print(f"Error: {e}")
        return
    preset_store.add_preset(name, formula)
    print(f"  Saved preset '{name}': {formula}")


def cmd_presets() -> None:
    presets = preset_store.load_presets()
    if not presets:
        print("  No saved presets.")
        return
    print()
    for name, formula in sorted(presets.items()):
        print(f"  {name:<20} {formula}")
    print()


def cmd_delete(args: str) -> None:
    if not args:
        print("Usage: delete <name>")
        return
    if preset_store.delete_preset(args.strip()):
        print(f"  Deleted preset '{args.strip()}'.")
    else:
        print(f"  No preset named '{args.strip()}'.")


def cmd_history(history: list) -> None:
    if not history:
        print("  No rolls yet this session.")
        return
    print()
    for entry in history:
        print(f"  [{entry['time']}] {entry['input']}")
        for r in entry["results"]:
            print(f"    {r.formula:<18} → {r.total}")
    print()


def cmd_help() -> None:
    print("""
  Commands:
    roll <formula> [, ...]   Roll one or more dice formulas
    roll <name>              Roll a saved preset by name
    save <name> <formula>    Save a named preset
    presets                  List all saved presets
    delete <name>            Remove a saved preset
    history                  Show this session's roll history
    help                     Show this help
    quit                     Exit

  Formula syntax:
    d20                      One d20
    2d6                      Two d6s
    3d8+5                    Three d8s plus 5
    4d6dl1                   Four d6s, drop lowest 1
    4d6dh1                   Four d6s, drop highest 1
    dl / dh without number   Defaults to dropping 1
    4d6kh3                   Four d6s, keep highest 3
    4d6kl2                   Four d6s, keep lowest 2
    kh / kl without number   Defaults to keeping 1
    Dropped dice shown as (n) in the breakdown
""")


# ── Main loop ──────────────────────────────────────────────────────────────

def main() -> None:
    print("Dice Roller  |  type 'help' for commands, 'quit' to exit\n")
    history: list = []
    session = PromptSession("> ", completer=DiceCompleter(), complete_while_typing=True)

    while True:
        try:
            line = session.prompt().strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue

        cmd, _, args = line.partition(" ")
        cmd = cmd.lower()

        if cmd in ("quit", "exit", "q"):
            break
        elif cmd == "roll":
            cmd_roll(args.strip(), history)
        elif cmd == "save":
            cmd_save(args.strip())
        elif cmd == "presets":
            cmd_presets()
        elif cmd in ("delete", "del"):
            cmd_delete(args.strip())
        elif cmd == "history":
            cmd_history(history)
        elif cmd == "help":
            cmd_help()
        else:
            # Try treating the whole line as a formula
            do_roll(line, history)


if __name__ == "__main__":
    main()
