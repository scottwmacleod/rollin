from roller import roll


def test_single_die_in_range():
    result = roll("d6", count=1, sides=6, modifier=0, drop_lowest=0, drop_highest=0)
    assert 1 <= result.total <= 6


def test_modifier_applied():
    result = roll("d6+10", count=1, sides=6, modifier=10, drop_lowest=0, drop_highest=0)
    assert result.total >= 11
    assert result.total <= 16


def test_negative_modifier():
    result = roll("d6-1", count=1, sides=6, modifier=-1, drop_lowest=0, drop_highest=0)
    assert result.total >= 0


def test_multiple_dice_count():
    result = roll("4d6", count=4, sides=6, modifier=0, drop_lowest=0, drop_highest=0)
    assert len(result.dice_results) == 4
    assert 4 <= result.total <= 24


def test_drop_lowest_count():
    result = roll("4d6dl1", count=4, sides=6, modifier=0, drop_lowest=1, drop_highest=0)
    dropped = [d for d in result.dice_results if d.dropped]
    kept = [d for d in result.dice_results if not d.dropped]
    assert len(dropped) == 1
    assert len(kept) == 3


def test_drop_lowest_is_minimum():
    result = roll("4d6dl1", count=4, sides=6, modifier=0, drop_lowest=1, drop_highest=0)
    dropped_values = [d.value for d in result.dice_results if d.dropped]
    kept_values = [d.value for d in result.dice_results if not d.dropped]
    assert dropped_values[0] <= min(kept_values)


def test_drop_highest_count():
    result = roll("4d6dh1", count=4, sides=6, modifier=0, drop_lowest=0, drop_highest=1)
    dropped = [d for d in result.dice_results if d.dropped]
    kept = [d for d in result.dice_results if not d.dropped]
    assert len(dropped) == 1
    assert len(kept) == 3


def test_drop_highest_is_maximum():
    result = roll("4d6dh1", count=4, sides=6, modifier=0, drop_lowest=0, drop_highest=1)
    dropped_values = [d.value for d in result.dice_results if d.dropped]
    kept_values = [d.value for d in result.dice_results if not d.dropped]
    assert dropped_values[0] >= max(kept_values)


def test_total_excludes_dropped():
    result = roll("4d6dl1", count=4, sides=6, modifier=0, drop_lowest=1, drop_highest=0)
    kept_sum = sum(d.value for d in result.dice_results if not d.dropped)
    assert result.total == kept_sum


def test_total_includes_modifier():
    result = roll("2d6+3", count=2, sides=6, modifier=3, drop_lowest=0, drop_highest=0)
    raw_sum = sum(d.value for d in result.dice_results)
    assert result.total == raw_sum + 3


def test_drop_two_lowest():
    result = roll("6d6dl2", count=6, sides=6, modifier=0, drop_lowest=2, drop_highest=0)
    dropped = [d for d in result.dice_results if d.dropped]
    kept = [d for d in result.dice_results if not d.dropped]
    assert len(dropped) == 2
    assert len(kept) == 4
