import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.db.database import SessionLocal, init_db
from app.db.models import User
from app.services.analyses_service import process_analysis_job


def _unique_email() -> str:
    return f"user-{uuid.uuid4().hex}@example.com"


def _clean_users() -> None:
    init_db()
    with SessionLocal() as session:
        session.query(User).delete()
        session.commit()


def _lab_payload() -> dict:
    return {
        "LBXHGB": 120,
        "LBXMCVSI": 79,
        "LBXMCHSI": 330,
        "LBXRDW": 15.2,
        "LBXRBCSI": 4.6,
        "LBXHCT": 37,
        "RIDAGEYR": 31,
        "BMXBMI": 22.5,
    }


def _register_and_create_analysis(client: TestClient) -> tuple[dict[str, str], str, str]:
    _clean_users()

    register = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": "password123"},
    )
    assert register.status_code == 201
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create = client.post(
        "/analyses",
        json={
            "upload": {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "size_bytes": 128000,
                "source": "web",
            },
            "lab": _lab_payload(),
        },
        headers=headers,
    )
    assert create.status_code == 202
    body = create.json()
    analysis_id = body["analysis_id"]
    user_id = body["user_id"]
    return headers, analysis_id, user_id


def test_auth_and_analyses_flow() -> None:
    client = TestClient(app)
    headers, analysis_id, _ = _register_and_create_analysis(client)

    status_resp = client.get(f"/analyses/{analysis_id}", headers=headers)
    assert status_resp.status_code == 200


def test_list_analyses_returns_user_analyses() -> None:
    client = TestClient(app)
    headers, analysis_id, _ = _register_and_create_analysis(client)

    list_resp = client.get("/analyses", headers=headers)
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert "analyses" in body
    assert isinstance(body["analyses"], list)
    assert len(body["analyses"]) >= 1
    found = next((a for a in body["analyses"] if a["analysis_id"] == analysis_id), None)
    assert found is not None
    assert found["status"] in {"queued", "processing", "completed", "failed"}
    assert "created_at" in found


def test_result_returns_409_or_200_after_create() -> None:
    client = TestClient(app)
    headers, analysis_id, _ = _register_and_create_analysis(client)

    result_resp = client.get(f"/analyses/{analysis_id}/result", headers=headers)

    if result_resp.status_code == 409:
        assert result_resp.json() == {
            "detail": {
                "error_code": "analysis_not_completed",
                "message": "Analysis is not completed yet",
            }
        }
    else:
        assert result_resp.status_code == 200
        body = result_resp.json()
        assert body["status"] in {"ok", "needs_input"}
        assert "risk_tier" in body or body.get("missing_required_fields") is not None


def test_auth_and_analyses_flow_after_completion() -> None:
    client = TestClient(app)
    headers, analysis_id, _ = _register_and_create_analysis(client)

    process_analysis_job(analysis_id)

    status_resp = client.get(f"/analyses/{analysis_id}", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "completed"

    result_resp = client.get(f"/analyses/{analysis_id}/result", headers=headers)
    assert result_resp.status_code == 200
    body = result_resp.json()
    assert body["status"] in {"ok", "needs_input"}
    assert body["risk_tier"] in {"HIGH", "WARNING", "GRAY", "LOW"}
    assert "iron_index" in body
    assert isinstance(body.get("explanations"), list)


def test_register_and_login() -> None:
    _clean_users()
    client = TestClient(app)
    email = _unique_email()

    register = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert register.status_code == 201

    login = client.post("/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    assert login.json()["token_type"] == "Bearer"


def test_reject_expired_token() -> None:
    _clean_users()
    client = TestClient(app)

    register = client.post("/auth/register", json={"email": _unique_email(), "password": "password123"})
    assert register.status_code == 201
    user_id = register.json()["user"]["id"]

    now = datetime.now(timezone.utc)
    expired_token = jwt.encode(
        {
            "sub": user_id,
            "iat": int((now - timedelta(minutes=2)).timestamp()),
            "exp": int((now - timedelta(minutes=1)).timestamp()),
        },
        "dev-secret-change-me",
        algorithm="HS256",
    )

    resp = client.get("/analyses/non-existent", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["error_code"] == "token_expired"


def test_reject_invalid_signature() -> None:
    _clean_users()
    client = TestClient(app)

    register = client.post("/auth/register", json={"email": _unique_email(), "password": "password123"})
    assert register.status_code == 201
    user_id = register.json()["user"]["id"]

    now = datetime.now(timezone.utc)
    invalid_token = jwt.encode(
        {
            "sub": user_id,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=10)).timestamp()),
        },
        "wrong-secret",
        algorithm="HS256",
    )

    resp = client.get("/analyses/non-existent", headers={"Authorization": f"Bearer {invalid_token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["error_code"] == "invalid_token"


def test_predict_endpoint_works_with_si_inputs() -> None:
    client = TestClient(app)

    resp = client.post(
        "/v1/risk/predict",
        json={
            "LBXHGB": 120,
            "LBXMCVSI": 79,
            "LBXMCHSI": 330,
            "LBXRDW": 15.2,
            "LBXRBCSI": 4.6,
            "LBXHCT": 37,
            "RIDAGEYR": 31,
            "BMXBMI": 22.5,
            "LBXSGL": 5.5,
            "LBXSCH": 5.0,
            "RIAGENDR": 2,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["risk_tier"] in {"HIGH", "WARNING", "GRAY", "LOW"}
    assert isinstance(body.get("explanations"), list)


def _required_min_payload() -> dict:
    return {
        "LBXHGB": 120,
        "LBXMCVSI": 79,
        "LBXMCHSI": 330,
        "LBXRDW": 15.2,
        "LBXRBCSI": 4.6,
        "LBXHCT": 37,
        "RIDAGEYR": 31,
        "BMXBMI": 22.5,
    }


def test_predict_minimal_valid_payload() -> None:
    client = TestClient(app)

    resp = client.post("/v1/risk/predict", json=_required_min_payload())

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["confidence"] == "medium"
    assert body["risk_tier"] in {"HIGH", "WARNING", "GRAY", "LOW"}
    assert isinstance(body.get("clinical_action"), str)


def test_predict_missing_bmi_and_height_weight_needs_input() -> None:
    client = TestClient(app)

    payload = _required_min_payload()
    payload.pop("BMXBMI")
    resp = client.post("/v1/risk/predict", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "needs_input"
    assert body["error_code"] == "needs_input"
    assert body["missing_required_fields"] == ["BMXBMI_or_BMXHT_BMXWT"]


def test_predict_invalid_numeric_values_returns_uniform_error_structure() -> None:
    client = TestClient(app)

    resp = client.post(
        "/v1/risk/predict",
        content=(
            '{"LBXHGB": NaN, "LBXMCVSI": Infinity, "LBXMCHSI": 330, "LBXRDW": 15.2, '
            '"LBXRBCSI": 4.6, "LBXHCT": 37, "RIDAGEYR": -1, "BMXBMI": 22.5}'
        ),
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "needs_input"
    assert body["error_code"] == "invalid_payload"
    assert body["message"] == "Payload contains invalid numeric values"
    assert body["missing_required_fields"] == []
    assert {item["field"] for item in body["invalid_fields"]} == {"LBXHGB", "LBXMCVSI", "RIDAGEYR"}


def test_fallback_mode_without_cbm_is_stable() -> None:
    from pathlib import Path

    import app.services.prediction_service as prediction_service

    prediction_service.get_runner.cache_clear()
    original_model_path = prediction_service.MODEL_PATH
    prediction_service.MODEL_PATH = Path("/tmp/non-existent-model.cbm")

    try:
        payload = _required_min_payload()
        first = prediction_service.predict_payload(payload)
        second = prediction_service.predict_payload(payload)

        assert first.status == "ok"
        assert second.status == "ok"
        assert first.iron_index == second.iron_index
        assert first.risk_percent == second.risk_percent
        assert first.risk_tier == second.risk_tier
        assert first.clinical_action == second.clinical_action
    finally:
        prediction_service.MODEL_PATH = original_model_path
        prediction_service.get_runner.cache_clear()


def test_predict_and_analysis_result_are_field_type_consistent() -> None:
    client = TestClient(app)
    payload = _required_min_payload()

    direct = client.post("/v1/risk/predict", json=payload)
    assert direct.status_code == 200
    direct_body = direct.json()

    headers, analysis_id, _ = _register_and_create_analysis(client)
    process_analysis_job(analysis_id)
    result = client.get(f"/analyses/{analysis_id}/result", headers=headers)

    assert result.status_code == 200
    result_body = result.json()

    for field in [
        "status",
        "confidence",
        "model_name",
        "error_code",
        "message",
        "missing_required_fields",
        "invalid_fields",
        "iron_index",
        "risk_percent",
        "risk_tier",
        "clinical_action",
        "explanations",
    ]:
        assert field in direct_body
        assert field in result_body
        assert type(direct_body[field]) is type(result_body[field])
