import pytest
import parser as dice_parser
from parser import FormulaError, parse_formula, parse_formulas


def test_simple_d20():
    pf = parse_formula("d20")
    assert pf.count == 1
    assert pf.sides == 20
    assert pf.modifier == 0
    assert pf.drop_lowest == 0
    assert pf.drop_highest == 0


def test_multiple_dice():
    pf = parse_formula("2d6")
    assert pf.count == 2
    assert pf.sides == 6


def test_positive_modifier():
    pf = parse_formula("3d8+5")
    assert pf.count == 3
    assert pf.sides == 8
    assert pf.modifier == 5


def test_negative_modifier():
    pf = parse_formula("2d6-2")
    assert pf.modifier == -2


def test_drop_lowest():
    pf = parse_formula("4d6dl1")
    assert pf.drop_lowest == 1
    assert pf.drop_highest == 0


def test_drop_lowest_default():
    pf = parse_formula("4d6dl")
    assert pf.drop_lowest == 1


def test_drop_highest():
    pf = parse_formula("4d6dh1")
    assert pf.drop_highest == 1
    assert pf.drop_lowest == 0


def test_keep_highest():
    pf = parse_formula("4d6kh3")
    assert pf.drop_lowest == 1
    assert pf.drop_highest == 0


def test_keep_lowest():
    pf = parse_formula("4d6kl2")
    assert pf.drop_highest == 2
    assert pf.drop_lowest == 0


def test_fixed_value():
    pf = parse_formula("15")
    assert pf.fixed_value == 15


def test_case_insensitive():
    pf = parse_formula("4D6DL1")
    assert pf.drop_lowest == 1


def test_invalid_formula():
    with pytest.raises(FormulaError):
        parse_formula("xyz")


def test_sides_too_low():
    with pytest.raises(FormulaError):
        parse_formula("1d1")


def test_drop_equals_count():
    with pytest.raises(FormulaError):
        parse_formula("2d6dl2")


def test_drop_exceeds_count():
    with pytest.raises(FormulaError):
        parse_formula("2d6dl3")


def test_kh_keep_all():
    with pytest.raises(FormulaError):
        parse_formula("4d6kh4")


def test_kh_keep_more_than_pool():
    with pytest.raises(FormulaError):
        parse_formula("2d6kh3")


def test_max_dice_limit():
    with pytest.raises(FormulaError):
        parse_formula(f"{dice_parser.MAX_DICE + 1}d6")


def test_max_dice_limit_boundary():
    pf = parse_formula(f"{dice_parser.MAX_DICE}d6")
    assert pf.count == dice_parser.MAX_DICE


def test_max_sides_limit():
    with pytest.raises(FormulaError):
        parse_formula(f"1d{dice_parser.MAX_SIDES + 1}")


def test_max_sides_limit_boundary():
    pf = parse_formula(f"1d{dice_parser.MAX_SIDES}")
    assert pf.sides == dice_parser.MAX_SIDES


def test_parse_formulas_multiple():
    pfs = parse_formulas("d20, 2d6+3")
    assert len(pfs) == 2
    assert pfs[0].sides == 20
    assert pfs[1].sides == 6
    assert pfs[1].modifier == 3


def test_parse_formulas_single():
    pfs = parse_formulas("d20")
    assert len(pfs) == 1


def test_parse_formulas_empty():
    with pytest.raises(FormulaError):
        parse_formulas("")


def test_parse_formulas_mixed_fixed():
    pfs = parse_formulas("d20, 15")
    assert pfs[1].fixed_value == 15
