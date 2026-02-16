# API Contract (Single Source of Truth)

Frontend and backend must rely on **one** contract file:

- `api/openapi.yaml`

Any API behavior change must be introduced through updates to this OpenAPI schema first.

## Contract scenarios fixed in OpenAPI

`api/openapi.yaml` now explicitly fixes response shapes for:

- Health: `GET /health` → `HealthResponse`
- Full authenticated flow:
  - `POST /auth/register` → `AuthResponse`
  - `POST /analyses` (body: `upload` + `lab`, same shape as PredictRequest) → `CreateAnalysisResponse`
  - `GET /analyses/{id}` → `AnalysisStatusResponse`
  - `GET /analyses/{id}/result` → `PredictResponse` (same schema as predict; completed case only)
- Prediction flow:
  - `POST /v1/risk/predict` with `BMXBMI` → `PredictResponseOk`
  - `POST /v1/risk/predict` with `BMXHT + BMXWT` → `PredictResponseOk`
  - `POST /v1/risk/predict` without BMI alternatives → `PredictResponseNeedsInput`

Tests should validate response bodies against these schema shapes, not only status codes.
