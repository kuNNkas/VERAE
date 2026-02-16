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
- `risk_tier` от BI-регрессора:
  - HIGH: BI < 0
  - WARNING: 0 <= BI <= 2
  - GRAY: 2 < BI <= 5
  - LOW: BI > 5
- `risk_percent` вычисляется из `iron_index` сигмоидным маппингом
- Backend конфиг модели: `ironrisk_bi_reg_29n.cbm` (ожидается в корне проекта)

## Важно

Если `.cbm` файл отсутствует, API использует deterministic fallback-скоринг только для локальной проверки UX/интеграции.
