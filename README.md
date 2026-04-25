# rollin

A command-line dice roller for tabletop RPGs (D&D, Pathfinder, etc.).

## Installation

```bash
pip install -r requirements.txt
```

## Usage

Start the interactive session:

```bash
python main.py
```

You can also type a formula directly without the `roll` prefix:

```
> 2d6+3
> 4d6dl1
```

### Commands

| Command | Description |
|---|---|
| `roll <formula> [, ...]` | Roll one or more comma-separated formulas |
| `roll <name>` | Roll a saved preset by name |
| `save <name> <formula>` | Save a named preset |
| `presets` | List all saved presets |
| `delete <name>` | Remove a preset |
| `history` | Show this session's roll history |
| `help` | Show help |
| `quit` | Exit |

Tab completion is available for commands and preset names.

### Dice Formula Syntax

| Formula | Meaning |
|---|---|
| `d20` | One d20 |
| `2d6` | Two d6s |
| `3d8+5` | Three d8s plus 5 |
| `4d6dl1` | Four d6s, drop the lowest 1 |
| `4d6dh1` | Four d6s, drop the highest 1 |
| `4d6dl` | Drop lowest 1 (default count) |
| `4d6kh3` | Four d6s, keep the highest 3 |
| `4d6kl2` | Four d6s, keep the lowest 2 |

Dropped dice are shown in parentheses in the output, e.g. `[5, 3, (1), 4]`.

### Presets

Save frequently used rolls:

```
> save stats 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1
  Saved preset 'stats': 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1

> roll stats
  (preset 'stats': 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1, 4d6dl1)
  4d6dl1             [5, 3, 4, (1)]  →  12
  ...
```

## Development

Run tests:

```bash
pip install pytest
pytest tests/ -v
```

Run the linter:

```bash
pip install ruff
ruff check .
```
