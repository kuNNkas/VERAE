# API Contract (Single Source of Truth)

Frontend and backend must rely on **one** contract file:

- `api/openapi.yaml`

Any API behavior change must be introduced through updates to this OpenAPI schema first.

## Canonical MVP endpoint examples

> Ниже — каноничные примеры для MVP-эндпоинтов. Актуальная схема полей и enum всегда в `api/openapi.yaml`.

### `GET /health`

**Response `200`**

```json
{
  "status": "ok"
}
```

### `POST /auth/register`

**Request**

```json
{
  "email": "user@example.com",
  "password": "strongpass123"
}
```

**Response `201`**

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "7f4f6034-ec3d-4cf8-b662-5e87be3af259",
    "email": "user@example.com",
    "created_at": "2026-01-01T12:00:00Z"
  }
}
```

### `POST /auth/login`

**Request**

```json
{
  "email": "user@example.com",
  "password": "strongpass123"
}
```

**Response `200`**

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "7f4f6034-ec3d-4cf8-b662-5e87be3af259",
    "email": "user@example.com",
    "created_at": "2026-01-01T12:00:00Z"
  }
}
```

### `POST /v1/risk/predict`

**Request**

```json
{
  "LBXHGB": 118,
  "LBXMCVSI": 74,
  "LBXMCHSI": 24,
  "LBXRDW": 16.8,
  "LBXRBCSI": 4.7,
  "LBXHCT": 36,
  "RIDAGEYR": 32,
  "BMXBMI": 22.4
}
```

**Response `200` (`status=ok`)**

```json
{
  "status": "ok",
  "confidence": "medium",
  "model_name": "ironrisk_bi_reg_29n.cbm",
  "missing_required_fields": [],
  "iron_index": 1.73,
  "risk_percent": 29.5,
  "risk_tier": "WARNING",
  "clinical_action": "Рекомендовано: добор ферритина.",
  "explanations": [
    {
      "feature": "LBXRDW",
      "label": "Ширина распределения эритроцитов (RDW)",
      "impact": -0.42,
      "direction": "negative",
      "text": "Профиль RDW вносит вклад в снижение индекса железа и может быть связан с дефицитным паттерном."
    }
  ]
}
```

**Response `200` (`status=needs_input`)**

```json
{
  "status": "needs_input",
  "confidence": "low",
  "model_name": "ironrisk_bi_reg_29n.cbm",
  "missing_required_fields": [
    "BMXBMI_or_BMXHT_BMXWT"
  ],
  "iron_index": null,
  "risk_percent": null,
  "risk_tier": null,
  "clinical_action": null,
  "explanations": []
}
```

### `POST /analyses`

`Authorization: Bearer <jwt>`

**Request**

```json
{
  "upload": {
    "filename": "labs.csv",
    "content_type": "text/csv",
    "size_bytes": 12345,
    "checksum_sha256": "3f786850e387550fdab836ed7e6dc881de23001b",
    "source": "web"
  },
  "lab": {
    "LBXHGB": 118,
    "LBXMCVSI": 74,
    "LBXMCHSI": 24,
    "LBXRDW": 16.8,
    "LBXRBCSI": 4.7,
    "LBXHCT": 36,
    "RIDAGEYR": 32,
    "BMXBMI": 22.4
  }
}
```

**Response `202`**

```json
{
  "analysis_id": "ea10d130-a9f5-4cf8-b4d0-fec61f706111",
  "user_id": "7f4f6034-ec3d-4cf8-b662-5e87be3af259",
  "status": "queued",
  "progress_stage": "queued",
  "job": {
    "id": "2c80b7d2-d3e7-4a72-a7f9-4a9988f7f425",
    "status": "queued"
  },
  "created_at": "2026-01-01T12:00:05Z",
  "updated_at": "2026-01-01T12:00:05Z"
}
```

### `GET /analyses/{id}`

`Authorization: Bearer <jwt>`

**Response `200`**

```json
{
  "analysis_id": "ea10d130-a9f5-4cf8-b4d0-fec61f706111",
  "status": "processing",
  "progress_stage": "model_inference",
  "error_code": null,
  "updated_at": "2026-01-01T12:00:06Z"
}
```

### `GET /analyses/{id}/result`

`Authorization: Bearer <jwt>`

**Response `200`**

```json
{
  "status": "ok",
  "confidence": "medium",
  "model_name": "ironrisk_bi_reg_29n.cbm",
  "missing_required_fields": [],
  "iron_index": 1.73,
  "risk_percent": 29.5,
  "risk_tier": "WARNING",
  "clinical_action": "Рекомендовано: добор ферритина.",
  "explanations": []
}
```
