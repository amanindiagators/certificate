import pytest
from fastapi import HTTPException

from server import _normalize_client_identifier, _validate_client_identifiers


def validate(**overrides):
    data = {
        "entity_type": "PRIVATE_LIMITED",
        "pan": "",
        "cin": "",
        "gstin": "",
    }
    data.update(overrides)
    _validate_client_identifiers(data)


def assert_validation_error(detail, **overrides):
    with pytest.raises(HTTPException) as exc:
        validate(**overrides)
    assert exc.value.status_code == 400
    assert exc.value.detail == detail


def test_identifiers_are_optional():
    validate()


def test_normalizes_uppercase_spaces_and_hyphens():
    assert _normalize_client_identifier(" aaa-1234 ") == "AAA1234"
    assert _normalize_client_identifier(" abcde 1234 f ") == "ABCDE1234F"


def test_rejects_invalid_pan():
    assert_validation_error("Invalid PAN format.", pan="ABCDE12345")


def test_rejects_invalid_gstin():
    assert_validation_error("Invalid GSTIN format.", gstin="27ABCDE1234F1Y5")


def test_rejects_gstin_when_embedded_pan_does_not_match():
    assert_validation_error(
        "GSTIN PAN segment must match PAN.",
        pan="ABCDE1234F",
        gstin="27ZZZZZ1234Z1Z5",
    )


def test_non_llp_accepts_valid_cin():
    validate(cin="U12345MH2020PTC123456")


def test_non_llp_rejects_invalid_cin():
    assert_validation_error("Invalid CIN format.", cin="AAA1234")


def test_llp_accepts_valid_llpin():
    validate(entity_type="LLP", cin="AAA-1234")


def test_llp_rejects_company_cin():
    assert_validation_error(
        "Invalid LLPIN format.",
        entity_type="LLP",
        cin="U12345MH2020PTC123456",
    )
