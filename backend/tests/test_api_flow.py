import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services.analyses_service import advance_analysis_state


def _register_and_create_analysis(client: TestClient) -> tuple[dict[str, str], str, str]:
    email = f"user-{uuid.uuid4().hex}@example.com"
    register = client.post(
        "/auth/register",
        json={"email": email, "password": "password123"},
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
            }
        },
        headers=headers,
    )
    assert create.status_code == 202
    body = create.json()
    analysis_id = body["analysis_id"]
    user_id = body["user_id"]
    return headers, analysis_id, user_id


def test_result_returns_409_when_analysis_not_completed() -> None:
    client = TestClient(app)
    headers, analysis_id, _ = _register_and_create_analysis(client)

    result_resp = client.get(f"/analyses/{analysis_id}/result", headers=headers)

    assert result_resp.status_code == 409
    assert result_resp.json() == {
        "detail": {
            "error_code": "analysis_not_completed",
            "message": "Analysis is not completed yet",
        }
    }


def test_auth_and_analyses_flow_after_manual_completion() -> None:
    client = TestClient(app)
    headers, analysis_id, user_id = _register_and_create_analysis(client)

    status_resp = client.get(f"/analyses/{analysis_id}", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "queued"

    advance_result = advance_analysis_state(user_id=user_id, analysis_id=analysis_id)
    assert advance_result is not None
    assert advance_result.status == "completed"

    result_resp = client.get(f"/analyses/{analysis_id}/result", headers=headers)
    assert result_resp.status_code == 200
    body = result_resp.json()
    assert 0 <= body["score"] <= 1
    assert body["decision"] in {"low_risk", "medium_risk", "high_risk"}


def test_predict_endpoint_works_with_si_inputs() -> None:
    client = TestClient(app)

    resp = client.post(
        "/v1/risk/predict",
        json={
            "LBXHGB": 120,  # g/L -> auto-normalized to 12 g/dL
            "LBXMCVSI": 79,
            "LBXMCHSI": 330,  # g/L -> auto-normalized to 33 g/dL
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
