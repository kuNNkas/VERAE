# Backend MVP: что сделано и что доделать

Состояние на основе текущего кода и `MVP_GO_LIVE_CHECKLIST.md` / `MVP_B2C_ARCHITECTURE.md`.

---

## 1. Что уже сделано на бэкенде

### 1.1 Конфигурация и окружение
- **Env**: поддержка `MODEL_NAME`, `MODEL_PATH`, `APP_ENV`, `CORS_ALLOW_ORIGINS`, `AUTH_TOKEN_*`, `DATABASE_URL`, `LOG_LEVEL` с разумными fallback (в т.ч. dev-secret и sqlite).
- **CORS**: разбор `CORS_ALLOW_ORIGINS`, в prod запрет wildcard и обязательный явный список.
- **Lifespan**: при старте вызывается `init_db()` (схема через `Base.metadata.create_all`).

### 1.2 API-эндпоинты
- **Health**: `GET /health` → `{ "status": "ok" }`.
- **Auth**: `POST /auth/register`, `POST /auth/login` → JWT + `AuthResponse` (access_token, expires_in, user).
- **Analyses**:  
  - `POST /analyses` (auth) → 202 + analysis_id, фоновая задача через `BackgroundTasks`.  
  - `GET /analyses` (auth) → список анализов пользователя.  
  - `GET /analyses/{id}` (auth) → статус (status, progress_stage, error_code, failure_diagnostic, updated_at).  
  - `GET /analyses/{id}/result` (auth) → 200 с результатом предсказания или 404/409.
- **Predict**: `POST /v1/risk/predict` (без auth) → `PredictResponse` (ok/needs_input, iron_index, risk_percent, risk_tier, clinical_action, explanations, confidence, missing_required_fields, error_code, message, invalid_fields).

### 1.3 Аутентификация и пользователи
- **JWT**: выдача и проверка токена (TTL, алгоритм, sub=user_id).
- **Проверка в prod**: отказ работать с dev-secret в production.
- **Хранение пользователей**: SQLAlchemy + таблица `users` (id, email, password_hash, created_at), `UserRepository`, сессия через `SessionLocal`.
- **Пароли**: bcrypt, валидация формата (email, пароль 8–128 символов, буквы+цифры).
- **Ошибки**: отдельные error_code (missing_token, invalid_token, token_expired, user_not_found, auth_misconfigured).

### 1.4 Контур анализов (оркестрация)
- **Создание анализа**: приём `CreateAnalysisRequest` (upload + lab), сохранение в in-memory хранилище, постановка фоновой задачи `process_analysis_job(analysis_id, correlation_id)`.
- **Фоновая обработка**: без очереди (FastAPI `BackgroundTasks`), переходы статусов pending → processing → completed/failed, вызов `predict_payload(lab)`, запись результата или ошибки в тот же in-memory record.
- **Права**: все операции по analyses проверяют `user_id` (только свои анализы).
- **Переходы статусов**: явная машина состояний (`_ALLOWED_TRANSITIONS`), защита от некорректных переходов.

### 1.5 ML-inference (prediction_service)
- **Вход**: `PredictRequest` с полным набором полей (CBC, демография, BMI/рост/вес, опционально глюкоза, холестерин и т.д.).
- **Валидация**: обязательные поля + BMI или (рост+вес); проверка числовых значений (finite, неотрицательные, положительные где нужно); при нарушении — `needs_input` с `error_code` и `invalid_fields`/`missing_required_fields`.
- **Модель**: загрузка CatBoost из `MODEL_PATH` (по умолчанию `ironrisk_bi_reg_29n.cbm`), при отсутствии файла — deterministic fallback (формула по HGB, MCV, RDW).
- **Выход**: iron_index, risk_percent (сигмоида), risk_tier (HIGH/WARNING/GRAY/LOW), clinical_action, explanations (SHAP или fallback), confidence (high/medium/low).
- **Единицы**: нормализация (например HGB, глюкоза, холестерин), расчёт BMI из роста/веса при необходимости.

### 1.6 Наблюдаемость
- **Correlation ID**: middleware `x-correlation-id` / `x-request-id`, контекст через contextvars, проброс в ответе.
- **Структурированные логи**: `log_event(event, **fields)` в JSON с ts, event, correlation_id; вызовы при auth (register/login success/fail), создании анализа, старте/завершении джоба (analysis_created, analysis_processing_started, analysis_completed, analysis_job_missing).
- **Логгер**: `logging.getLogger("verae")`.

### 1.7 Тесты
- **test_api_flow**: регистрация/логин, создание анализа, список, статус, результат после completion, истечение/неверная подпись токена, валидация пароля/email, predict с полным/минимальным payload, needs_input при отсутствии BMI/рост+вес, invalid payload (NaN/Inf/отрицательные), fallback без .cbm, согласованность полей predict и result.
- **test_e2e_flow**: контракт OpenAPI (api/openapi.yaml) для register, create analysis, status, result; сценарии predict (BMI, рост+вес, needs_input); e2e register → create → process_analysis_job → status → result; 409 при результате до completion; failed job (ожидание error_code/failure_diagnostic в статусе).

### 1.8 База данных (модели)
- **Модели SQLAlchemy**: `User`, `Analysis` (id, user_id, status, progress_stage, error_message, failure_reason, created_at, updated_at).
- **Использование**: таблица `users` реально используется (auth_service + UserRepository); таблица `analyses` в коде не используется — анализы хранятся в `_ANALYSES` (in-memory).

---

## 2. Что доделать до MVP (бэкенд)

### 2.1 Критично для go-live

1. **Хранение анализов**  
   Сейчас анализы только in-memory (`analyses_service._ANALYSES`). При рестарте всё теряется, нет масштабирования.  
   - Либо перенести создание/чтение/обновление анализов на слой БД (модель `Analysis` уже есть; нужно хранить payload lab и результат в JSON/отдельных полях).  
   - Либо явно зафиксировать в доке, что MVP v0 — in-memory и рестарт очищает анализы (приемлемо только для демо/внутреннего теста).

2. **Failed job: диагностика в ответе статуса**  
   В `process_analysis_job` при `except Exception` выставляются только `status="failed"` и `progress_stage="failed"`, но не `record.failure_reason`.  
   В результате `GET /analyses/{id}` для упавшего джоба возвращает `error_code`/`failure_diagnostic` = null. E2E-тест ожидает, например, `error_code == "inference_error"`.  
   - В блоке `except` присваивать `record.failure_reason = "inference_error"` (или брать из типа исключения), чтобы статус анализа содержал диагностику.

3. **Единообразие статусов с контрактом**  
   В коде при создании анализа возвращается `status="pending"`, в dry-run чеклиста ожидается `"queued"`.  
   - Привести к одному варианту (например, везде `queued` при создании) и обновить контракт/чеклист/тесты, чтобы не было расхождений.

4. **Миграции БД**  
   В MVP_GO_LIVE_CHECKLIST указано: миграций в runtime нет, схема только через `create_all`. Для продакшена нужен единый способ применения миграций (Alembic или аналог) и шаг в CI/CD/старте приложения.  
   - Добавить выбранный инструмент миграций и одну начальную миграцию под текущие модели (users + при необходимости analyses).  
   - Либо явно зафиксировать: «MVP без versioned migrations, только create_all».

### 2.2 Важно для продакшена

5. **Секрет JWT**  
   В production обязательно задавать `AUTH_TOKEN_SECRET` из secret manager; убрать или не использовать dev fallback в prod (сейчас проверка есть — 500 при dev-secret в prod).

6. **Docker smoke-check**  
   Чеклист требует перед релизом прогнать `docker compose down -v && docker compose up --build` и проверить health и фронт.  
   - Либо выполнять вручную перед каждым релизом, либо вынести в CI.

7. **Smoke-скрипт как артефакт**  
   Dry-run из чеклиста — ad-hoc команда.  
   - Вынести в `scripts/smoke_mvp_flow.py` (или аналог) и при желании вызывать в CI после поднятия контейнеров.

### 2.3 По архитектуре (MVP_B2C_ARCHITECTURE)

8. **Очередь и воркер**  
   Сейчас «очередь» — это FastAPI BackgroundTasks (выполнение в процессе API). Для v0 в доке желательны очередь + воркер с retry.  
   - Для MVP допустимо оставить BackgroundTasks, но в доке явно указать, что отдельный worker и очередь — следующая итерация.  
   - Либо внедрить минимальную очередь (например Redis/RQ или Celery) и вынести `process_analysis_job` в воркер с 1–2 ретраями.

9. **Хранение файлов (upload)**  
   Сейчас в анализе хранятся только метаданные upload (filename, content_type, size_bytes, source). Blob/файлы нигде не сохраняются.  
   - Для MVP без OCR/загрузки файлов этого достаточно; если позже появится загрузка файла — нужен object storage и сохранение в job.

10. **Метрики (RPS, latency, errors)**  
    Логи уже с correlation_id и событиями. Отдельного экспорта метрик (Prometheus/StatsD) нет.  
    - Для MVP можно ограничиться логами; позже — добавить счётчики/гистограммы по эндпоинтам и джобам.

---

## 3. Краткая сводка

| Область              | Сделано                                                                 | Доделать до MVP                          |
|----------------------|-------------------------------------------------------------------------|------------------------------------------|
| Env / CORS / init_db| ✅                                                                      | —                                        |
| Auth (JWT, users DB) | ✅                                                                      | Секрет в prod, миграции                  |
| API (health, auth, analyses, predict) | ✅                                    | —                                        |
| Контур analyses      | ✅ in-memory, BackgroundTasks, статусы, результат                      | Persistence в БД или явный «in-memory MVP»; failure_reason при ошибке; единый статус queued/pending |
| ML inference         | ✅ валидация, модель/fallback, ответ по контракту                       | —                                        |
| Observability        | ✅ correlation id, structured logs                                     | Метрики (по желанию позже)               |
| Тесты                | ✅ api + e2e по контракту и сценариям                                  | Починить e2e failed job (failure_reason) |
| Миграции / storage   | ✅ модели User + Analysis, только users в БД                           | Миграции; persistence анализов (или явно отложить) |

Если нужно, могу предложить конкретные патчи по пунктам 2.1–2.2 (failure_reason, статус queued/pending, скрипт smoke).
