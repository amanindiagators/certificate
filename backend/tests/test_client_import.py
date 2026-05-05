from server import _clean_client_payload


def test_client_import_accepts_excel_entity_aliases_and_llpin():
    clean_data, errors = _clean_client_payload(
        {
            "entity_type": "LLP",
            "company_name": "A.K & SONS INTERNATIONAL LLP",
            "pan": "ACKFA5299D",
            "cin": "ACP-7343",
            "gstin": "",
            "address": "Pratima Sinha, Hajipur",
        },
        normalize_entity_alias=True,
    )

    assert errors == []
    assert clean_data["entity_type"] == "LLP"
    assert clean_data["display_name"] == "A.K & SONS INTERNATIONAL LLP"
    assert clean_data["cin"] == "ACP7343"


def test_client_import_maps_pvt_ltd_alias():
    clean_data, errors = _clean_client_payload(
        {
            "entity_type": "PVT LTD",
            "company_name": "AIBINDU TECHNOLOGIES PRIVATE LIMITED",
            "pan": "ABCCA7054Q",
            "cin": "U62099BR2025PTC075282",
        },
        normalize_entity_alias=True,
    )

    assert errors == []
    assert clean_data["entity_type"] == "PRIVATE_LIMITED"


def test_client_import_reports_field_specific_identifier_errors():
    _, errors = _clean_client_payload(
        {
            "entity_type": "PVT LTD",
            "company_name": "Broken Client Private Limited",
            "pan": "ABCDE1234F",
            "cin": "BAD-CIN",
            "gstin": "10ZZZZZ1234Z1Z5",
        },
        normalize_entity_alias=True,
    )

    assert {"field": "CIN / LLPIN", "message": "Invalid CIN format."} in errors
    assert {"field": "GSTIN", "message": "GSTIN PAN segment must match PAN."} in errors
