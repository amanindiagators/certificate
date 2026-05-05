import pytest

from server import _decode_plus_code_to_lat_lng, _split_plus_code_input


def test_splits_plus_code_and_locality():
    assert _split_plus_code_input("J487+76 Patna") == ("J487+76", "Patna")
    assert _split_plus_code_input("J487+76, Patna, Bihar") == ("J487+76", "Patna, Bihar")
    assert _split_plus_code_input("7MQ7J487+76") == ("7MQ7J487+76", "")


def test_short_plus_code_uses_locality_reference(monkeypatch):
    monkeypatch.setattr(
        "server._geocode_place_for_plus_code",
        lambda place: (25.5941, 85.1376) if place == "Patna" else None,
    )

    lat, lng = _decode_plus_code_to_lat_lng("J487+76 Patna")

    assert lat == pytest.approx(25.6156875)
    assert lng == pytest.approx(85.1130625)


def test_full_plus_code_decodes_without_reference():
    lat, lng = _decode_plus_code_to_lat_lng("7MQ7J487+76")

    assert lat == pytest.approx(25.6156875)
    assert lng == pytest.approx(85.1130625)
