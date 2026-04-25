import json
import os

PRESETS_FILE = os.path.join(os.path.dirname(__file__), "presets.json")


def load_presets() -> dict[str, str]:
    if not os.path.exists(PRESETS_FILE):
        return {}
    try:
        with open(PRESETS_FILE, "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
    except (json.JSONDecodeError, OSError):
        return {}


def save_presets(presets: dict[str, str]) -> None:
    try:
        with open(PRESETS_FILE, "w") as f:
            json.dump(presets, f, indent=2)
    except OSError as e:
        raise OSError(f"Failed to save presets: {e}") from e


def add_preset(name: str, formula: str) -> None:
    presets = load_presets()
    presets[name.lower()] = formula
    save_presets(presets)


def delete_preset(name: str) -> bool:
    presets = load_presets()
    key = name.lower()
    if key not in presets:
        return False
    del presets[key]
    save_presets(presets)
    return True


def get_preset(name: str) -> str | None:
    return load_presets().get(name.lower())
