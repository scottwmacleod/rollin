import secrets
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DieResult:
    value: int
    dropped: bool = False


@dataclass
class RollResult:
    formula: str
    dice_results: list[DieResult]
    modifier: int
    total: int
    sides: int
    count: int
    drop_lowest: int = 0
    drop_highest: int = 0


def roll_die(sides: int) -> int:
    return secrets.randbelow(sides) + 1


def roll(formula: str, count: int, sides: int, modifier: int,
         drop_lowest: int, drop_highest: int) -> RollResult:
    raw = [DieResult(roll_die(sides)) for _ in range(count)]

    if drop_lowest or drop_highest:
        indexed = sorted(range(len(raw)), key=lambda i: raw[i].value)
        drop_indices = set()
        drop_indices.update(indexed[:drop_lowest])
        drop_indices.update(indexed[-(drop_highest):] if drop_highest else [])
        for i in drop_indices:
            raw[i].dropped = True

    kept = [d.value for d in raw if not d.dropped]
    total = sum(kept) + modifier

    return RollResult(
        formula=formula,
        dice_results=raw,
        modifier=modifier,
        total=total,
        sides=sides,
        count=count,
        drop_lowest=drop_lowest,
        drop_highest=drop_highest,
    )
