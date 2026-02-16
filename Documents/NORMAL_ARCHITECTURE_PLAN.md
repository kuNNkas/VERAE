# VERAE — план перехода к нормальной архитектуре (Frontend + Backend + ML)

## 1) Цель

Перейти от MVP (1 HTML + 1 FastAPI endpoint) к production-ready архитектуре с:
- разделением ответственности между frontend, API, async processing и ML inference,
- версионируемым API-контрактом,
- наблюдаемостью и безопасностью,
- предсказуемым CI/CD и миграциями БД.

---

## 2) Целевая архитектура (v1)

## Компоненты

1. **Frontend (SPA, отдельно от API)**
   - React + TypeScript + Vite
   - UI-kit + feature-модули
   - API client, generated from OpenAPI

2. **Backend API (FastAPI)**
   - REST API для auth, analyses, result retrieval
   - sync endpoint для ручного predict (MVP backward compatibility)
   - валидация, rate limiting, audit logging

3. **Worker (async processing)**
   - Celery/RQ worker
   - обработка analysis job (OCR/normalization/inference/report)

4. **PostgreSQL**
   - users, uploads, analysis_jobs, predictions, audit_events
   - Alembic migrations

5. **Object Storage (S3/MinIO)**
   - хранение загруженных файлов
   - хранение артефактов анализа

6. **ML service layer**
   - model registry metadata (active model/version)
   - inference wrapper + SHAP explainer
   - fallback policy when model artifact missing

7. **Infra services**
   - Redis (queue + cache)
   - Nginx/API gateway
   - Prometheus + Grafana + structured logs

---

## 3) Контракт и совместимость

- Источник истины для API: `api/openapi.yaml`.
- Код backend должен строго соответствовать контракту (`/auth/*`, `/analyses/*`, `/analyses/{id}/result`).
- MVP endpoint `/v1/risk/predict` сохраняем как `legacy` до завершения миграции фронта.
- Версионирование API:
  - `v1` — текущая продуктовая версия,
  - breaking changes только через `v2`.

---

## 4) Предлагаемая структура репозитория

```text
/backend
  /app
    /api
      /v1
        auth.py
        analyses.py
        predict.py
    /core
      config.py
      security.py
      logging.py
    /db
      models.py
      session.py
      repositories/
    /services
      auth_service.py
      analysis_service.py
      prediction_service.py
      explainer_service.py
    /workers
      tasks.py
    main.py
  /alembic
  pyproject.toml

/frontend
  /src
    /app
    /pages
    /features
      /auth
      /analysis
      /result
    /shared
      /api
      /ui
      /lib
  package.json
```

---

## 5) Frontend target design

### Обязательные слои

- `shared/api` — generated client (OpenAPI).
- `features/*` — бизнес-фичи (auth, upload, result, explanations).
- `pages/*` — роуты и композиция фич.
- `app/providers` — auth/session/theme/query-client.

### Основные экраны

1. Auth (login/register)
2. New analysis (upload/manual)
3. Analysis status (queued/processing/done/failed)
4. Result page:
   - риск + tier,
   - SHAP explanations (top negative/positive factors),
   - дисклеймеры по целевой популяции.

---

## 6) Backend target design

### Модули

- `auth`: JWT access token, refresh flow (опционально)
- `analyses`: create, get status, get result
- `predict`: legacy sync endpoint
- `prediction_service`: единая точка inference + explanation generation
- `explainer_service`: CatBoost SHAP + текстовые интерпретации

### Инварианты

- Каждый `analysis` привязан к `user_id` из JWT.
- Все state-переходы job фиксируются в `audit_events`.
- Prediction хранится с `model_name`, `model_version`, `threshold_version`.

---

## 7) План миграции (итерации)

## Итерация A (1–2 недели): «Стабилизировать API foundation»

- Поднять FastAPI app factory + конфигурацию окружений.
- Реализовать auth endpoints из OpenAPI.
- Подключить PostgreSQL + Alembic.
- Добавить repository/service слой.

**Definition of Done:**
- OpenAPI endpoints `/auth/register`, `/auth/login` работают.
- Базовые unit + integration tests в CI.

## Итерация B (1–2 недели): «Analyses pipeline»

- Реализовать `/analyses`, `/analyses/{id}`, `/analyses/{id}/result`.
- Добавить очередь (Redis + worker).
- Сохранение upload metadata + job lifecycle.

**Definition of Done:**
- Job проходит queued -> processing -> done/failed.
- Результат доступен через `/analyses/{id}/result`.

## Итерация C (1–2 недели): «Новый frontend»

- Перевести фронт на React + TypeScript.
- Интегрировать auth + analyses API.
- Добавить UI для explanations.

**Definition of Done:**
- Пользователь проходит full flow от login до result.

## Итерация D (1 неделя): «Надежность и observability»

- Метрики latency/error rate, trace-id, dashboards.
- Rate limiting, CORS policy, security headers.
- Sentry/alerting.

**Definition of Done:**
- Есть SLO и алерты на критические сбои.

---

## 8) Тестовая стратегия

1. **Backend unit tests**: services, validators, explanation builder.
2. **Backend integration tests**: API + DB + auth.
3. **Contract tests**: OpenAPI conformity.
4. **Frontend e2e**: happy path (auth -> analysis -> result).
5. **ML regression tests**:
   - стабильность scoring,
   - форма и сортировка explanations,
   - fallback behavior.

---

## 9) Нефункциональные требования

- p95 latency sync predict < 400ms (без heavy preprocessing).
- Время получения async результата < 60s (MVP target).
- Безопасность:
  - JWT expiry + key rotation,
  - secrets только через env/secret store,
  - audit trail на критические события.

---

## 10) Ближайшие практические задачи (next sprint)

1. Синхронизировать `api/openapi.yaml` и backend implementation.
2. Вынести текущий inference/explanation код в `prediction_service`.
3. Добавить `tests/` с minimal contract + integration suite.
4. Подготовить frontend scaffold (React+TS) рядом с legacy `index.html`.
5. Включить CI pipeline (lint + tests + build).

