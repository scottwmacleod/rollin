import json
import pytest
import presets as preset_store


@pytest.fixture
def preset_path(tmp_path, monkeypatch):
    path = tmp_path / "presets.json"
    monkeypatch.setattr(preset_store, "PRESETS_FILE", str(path))
    return path


def test_load_missing_file(preset_path):
    assert preset_store.load_presets() == {}


def test_save_and_load_roundtrip(preset_path):
    preset_store.save_presets({"attack": "d20+5"})
    assert preset_store.load_presets() == {"attack": "d20+5"}


def test_add_and_get_preset(preset_path):
    preset_store.add_preset("Attack", "d20+5")
    assert preset_store.get_preset("attack") == "d20+5"


def test_get_preset_case_insensitive(preset_path):
    preset_store.add_preset("MyRoll", "2d6+3")
    assert preset_store.get_preset("myroll") == "2d6+3"
    assert preset_store.get_preset("MYROLL") == "2d6+3"


def test_delete_preset(preset_path):
    preset_store.add_preset("attack", "d20+5")
    assert preset_store.delete_preset("attack") is True
    assert preset_store.get_preset("attack") is None


def test_delete_nonexistent_preset(preset_path):
    assert preset_store.delete_preset("nonexistent") is False


def test_load_corrupted_json(preset_path):
    preset_path.write_text("not valid json")
    assert preset_store.load_presets() == {}


def test_load_non_dict_json(preset_path):
    preset_path.write_text(json.dumps([1, 2, 3]))
    assert preset_store.load_presets() == {}


def test_load_filters_non_string_values(preset_path):
    preset_path.write_text(json.dumps({"good": "d20", "bad": 42}))
    assert preset_store.load_presets() == {"good": "d20"}


def test_multiple_presets(preset_path):
    preset_store.add_preset("attack", "d20+5")
    preset_store.add_preset("damage", "2d6+3")
    assert preset_store.get_preset("attack") == "d20+5"
    assert preset_store.get_preset("damage") == "2d6+3"
