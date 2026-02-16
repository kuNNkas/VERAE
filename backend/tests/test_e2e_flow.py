import uuid
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from app.main import app
from app.db.database import init_db
from app.services.analyses_service import advance_analysis_state


def _unique_email() -> str:
    return f"e2e-{uuid.uuid4().hex}@example.com"


def _load_openapi_contract() -> dict:
    contract_path = Path(__file__).resolve().parents[2] / "api" / "openapi.yaml"
    with contract_path.open("r", encoding="utf-8") as contract_file:
        return yaml.safe_load(contract_file)


def _resolve_ref(contract: dict, ref: str) -> dict:
    parts = ref.removeprefix("#/").split("/")
    current = contract
    for part in parts:
        current = current[part]
    return current


def _schema_for_status(contract: dict, path: str, method: str, status_code: str) -> dict:
    schema = contract["paths"][path][method]["responses"][status_code]["content"]["application/json"]["schema"]
    if "$ref" in schema:
        return _resolve_ref(contract, schema["$ref"])
    return schema


def _assert_value_type(value, expected_type: str, nullable: bool = False) -> None:
    if value is None:
        assert nullable
        return

    if expected_type == "string":
        assert isinstance(value, str)
    elif expected_type == "number":
        assert isinstance(value, (int, float))
    elif expected_type == "integer":
        assert isinstance(value, int)
    elif expected_type == "array":
        assert isinstance(value, list)
    elif expected_type == "object":
        assert isinstance(value, dict)


def _assert_matches_schema(contract: dict, body: dict, schema: dict) -> None:
    if "oneOf" in schema:
        errors: list[str] = []
        for candidate in schema["oneOf"]:
            candidate_schema = _resolve_ref(contract, candidate["$ref"]) if "$ref" in candidate else candidate
            try:
                _assert_matches_schema(contract, body, candidate_schema)
                return
            except AssertionError as exc:
                errors.append(str(exc))
        raise AssertionError(f"Response does not satisfy any oneOf schema: {body}. Errors: {errors}")

    required_fields = schema.get("required", [])
    for field in required_fields:
        assert field in body, f"Missing required field '{field}' in response body: {body}"

    properties = schema.get("properties", {})
    if schema.get("additionalProperties") is False:
        allowed_fields = set(properties.keys())
        assert set(body.keys()).issubset(allowed_fields), f"Unexpected fields: {set(body.keys()) - allowed_fields}"

    for field, prop_schema in properties.items():
        if field not in body:
            continue
        candidate_schema = _resolve_ref(contract, prop_schema["$ref"]) if "$ref" in prop_schema else prop_schema
        if "enum" in candidate_schema and body[field] is not None:
            assert body[field] in candidate_schema["enum"]
        if "type" in candidate_schema:
            _assert_value_type(body[field], candidate_schema["type"], candidate_schema.get("nullable", False))


def _base_predict_payload() -> dict:
    return {
        "LBXHGB": 120,
        "LBXMCVSI": 79,
        "LBXMCHSI": 330,
        "LBXRDW": 15.2,
        "LBXRBCSI": 4.6,
        "LBXHCT": 37,
        "RIDAGEYR": 31,
        "LBXSGL": 5.5,
        "LBXSCH": 5.0,
        "RIAGENDR": 2,
    }


def test_e2e_auth_analyses_and_result_flow_contract() -> None:
    init_db()
    client = TestClient(app)
    contract = _load_openapi_contract()

    register_response = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": "password123"},
    )
    assert register_response.status_code == 201
    register_body = register_response.json()
    _assert_matches_schema(contract, register_body, _schema_for_status(contract, "/auth/register", "post", "201"))

    headers = {"Authorization": f"Bearer {register_body['access_token']}"}

    create_response = client.post(
        "/analyses",
        json={
            "upload": {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "size_bytes": 128000,
                "source": "web",
            }
        },
        headers=headers,
    )
    assert create_response.status_code == 202
    create_body = create_response.json()
    _assert_matches_schema(contract, create_body, _schema_for_status(contract, "/analyses", "post", "202"))

    analysis_id = create_body["analysis_id"]
    user_id = create_body["user_id"]

    status_response = client.get(f"/analyses/{analysis_id}", headers=headers)
    assert status_response.status_code == 200
    status_body = status_response.json()
    _assert_matches_schema(contract, status_body, _schema_for_status(contract, "/analyses/{id}", "get", "200"))

    pending_result = client.get(f"/analyses/{analysis_id}/result", headers=headers)
    assert pending_result.status_code == 409
    assert pending_result.json() == {
        "detail": {
            "error_code": "analysis_not_completed",
            "message": "Analysis is not completed yet",
        }
    }

    advanced = advance_analysis_state(user_id=user_id, analysis_id=analysis_id)
    assert advanced is not None
    assert advanced.status == "completed"

    result_response = client.get(f"/analyses/{analysis_id}/result", headers=headers)
    assert result_response.status_code == 200
    result_body = result_response.json()
    _assert_matches_schema(contract, result_body, _schema_for_status(contract, "/analyses/{id}/result", "get", "200"))


def test_predict_scenario_with_bmxbmi_contract() -> None:
    client = TestClient(app)
    contract = _load_openapi_contract()

    payload = _base_predict_payload() | {"BMXBMI": 22.5}
    response = client.post("/v1/risk/predict", json=payload)

    assert response.status_code == 200
    body = response.json()
    _assert_matches_schema(contract, body, _schema_for_status(contract, "/v1/risk/predict", "post", "200"))
    assert body["status"] == "ok"


def test_predict_scenario_with_bmxht_bmxwt_contract() -> None:
    client = TestClient(app)
    contract = _load_openapi_contract()

    payload = _base_predict_payload() | {"BMXHT": 165, "BMXWT": 62}
    response = client.post("/v1/risk/predict", json=payload)

    assert response.status_code == 200
    body = response.json()
    _assert_matches_schema(contract, body, _schema_for_status(contract, "/v1/risk/predict", "post", "200"))
    assert body["status"] == "ok"


def test_predict_scenario_without_bmi_or_hw_returns_needs_input() -> None:
    client = TestClient(app)
    contract = _load_openapi_contract()

    payload = _base_predict_payload()
    response = client.post("/v1/risk/predict", json=payload)

    assert response.status_code == 200
    body = response.json()
    _assert_matches_schema(contract, body, _schema_for_status(contract, "/v1/risk/predict", "post", "200"))
    assert body["status"] == "needs_input"
    assert body["missing_required_fields"] == ["BMXBMI_or_BMXHT_BMXWT"]
