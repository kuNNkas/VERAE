from fastapi.testclient import TestClient

from app.main import app


def test_auth_and_analyses_flow() -> None:
    client = TestClient(app)

    register = client.post(
        "/auth/register",
        json={"email": "user@example.com", "password": "password123"},
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
    analysis_id = create.json()["analysis_id"]

    status_resp = client.get(f"/analyses/{analysis_id}", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] in {"queued", "completed"}

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
