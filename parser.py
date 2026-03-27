import re
from dataclasses import dataclass

# Matches: [count]d<sides>[dl|dh[n]][+/-modifier]
# Examples: 2d6, d20, 4d6dl1, 3d8+5, 2d10dh-2
FORMULA_RE = re.compile(
    r'^(\d*)d(\d+)'           # [count]d<sides>
    r'(?:(dl|dh|kh|kl)(\d*))?'  # optional drop/keep: dl, dh, kh, kl, optional count
    r'([+-]\d+)?$',           # optional modifier
    re.IGNORECASE,
)


@dataclass
class ParsedFormula:
    raw: str
    count: int
    sides: int
    drop_lowest: int
    drop_highest: int
    modifier: int


class FormulaError(ValueError):
    pass


def parse_formula(raw: str) -> ParsedFormula:
    text = raw.strip().replace(" ", "").lower()
    m = FORMULA_RE.match(text)
    if not m:
        raise FormulaError(f"Invalid formula: '{raw}'")

    count = int(m.group(1)) if m.group(1) else 1
    sides = int(m.group(2))
    drop_type = m.group(3)
    drop_n_str = m.group(4)
    mod_str = m.group(5)

    if count < 1:
        raise FormulaError(f"Dice count must be at least 1: '{raw}'")
    if sides < 2:
        raise FormulaError(f"Sides must be at least 2: '{raw}'")

    raw_n = int(drop_n_str) if drop_n_str else 1

    if drop_type == "dl":
        drop_lowest = raw_n
        drop_highest = 0
    elif drop_type == "dh":
        drop_lowest = 0
        drop_highest = raw_n
    elif drop_type == "kh":
        if raw_n < 1 or raw_n >= count:
            raise FormulaError(
                f"'kh{raw_n}' must keep between 1 and {count - 1} dice from a pool of {count}: '{raw}'"
            )
        drop_lowest = count - raw_n
        drop_highest = 0
    elif drop_type == "kl":
        if raw_n < 1 or raw_n >= count:
            raise FormulaError(
                f"'kl{raw_n}' must keep between 1 and {count - 1} dice from a pool of {count}: '{raw}'"
            )
        drop_lowest = 0
        drop_highest = count - raw_n
    else:
        drop_lowest = 0
        drop_highest = 0

    if drop_lowest + drop_highest >= count:
        raise FormulaError(
            f"Cannot drop {drop_lowest + drop_highest} dice from a pool of {count}: '{raw}'"
        )

    modifier = int(mod_str) if mod_str else 0

    return ParsedFormula(
        raw=raw.strip(),
        count=count,
        sides=sides,
        drop_lowest=drop_lowest,
        drop_highest=drop_highest,
        modifier=modifier,
    )


def parse_formulas(text: str) -> list[ParsedFormula]:
    """Parse a comma-separated list of formulas."""
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if not parts:
        raise FormulaError("No formulas provided.")
    return [parse_formula(p) for p in parts]
