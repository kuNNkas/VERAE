# VERAE MVP Stack (B2C v0)

## Запуск

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- API: `http://localhost:8000`
- Healthcheck: `http://localhost:8000/health`

## Что реализовано

- B2C ручной ввод полей (required/recommended)
- Frontend pre-check обязательных полей
- Backend authoritative validation + missing fields
- `risk_tier` пороги:
  - high >= 0.50
  - gray 0.10-0.50
  - low < 0.10
- Backend конфиг модели: `ironrisk_bi_29n_women18_49.cbm` (ожидается в корне проекта)

## Важно

Если `.cbm` файл отсутствует, API использует deterministic fallback-скоринг только для локальной проверки UX/интеграции.
