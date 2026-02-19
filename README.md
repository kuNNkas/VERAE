# VERAE MVP (B2C v0)

Минимальный end-to-end MVP для ручного ввода лабораторных показателей:

- **Frontend**: Next.js (React, TypeScript, Tailwind, shadcn/ui, TanStack Query, RHF+Zod, Recharts)
- **Backend (FastAPI)**: валидация, расчёт риска, confidence, tier
- **Model**: `ironrisk_bi_reg_29n.cbm` (ожидается в корне проекта)

---

## 1) Требования

- Docker + Docker Compose

Порты по умолчанию:
- `8080` — frontend
- `8000` — API

---

## 2) Быстрый запуск

Из корня репозитория:

```bash
docker compose up --build
```

После запуска:

- Frontend: http://localhost:8080
- API health: http://localhost:8000/health
- API docs (Swagger): http://localhost:8000/docs

### Разработка фронта без ребилда Docker

Чтобы менять фронт без пересборки образа:

1. Запустите только API: `docker compose up api`
2. В каталоге `frontend/`: `cp .env.local.example .env.local`, затем `npm install` и `npm run dev`
3. Откройте http://localhost:3000 (Next.js dev server с HMR)
4. В `.env.local` задайте `NEXT_PUBLIC_API_URL=http://localhost:8000`. Для CORS при запросах с localhost:3000 в `APP_ENV=dev` уже разрешён порт 3000.

---

## 3) Модель и данные

По умолчанию backend использует:

- `MODEL_NAME=ironrisk_bi_reg_29n.cbm`
- `MODEL_PATH=/workspace/ironrisk_bi_reg_29n.cbm`
- `APP_ENV=dev`
- `CORS_ALLOW_ORIGINS=http://localhost:8080,http://127.0.0.1:8080`

CORS настраивается через переменные окружения:

- `CORS_ALLOW_ORIGINS` — список origin через запятую.
- Если `CORS_ALLOW_ORIGINS` не задан, используются дефолты по `APP_ENV`:
  - `dev`: `localhost/127.0.0.1` порты `3000`, `5173`, `8080`
  - `prod`: `https://app.verae.ai`

Эти переменные уже прописаны в `docker-compose.yml` и могут быть переопределены через `.env` или окружение shell перед `docker compose up`.

### Переменные окружения для auth

- `AUTH_TOKEN_SECRET` — секрет подписи JWT (обязательно изменить в production).
- `AUTH_TOKEN_TTL_SECONDS` — TTL access token в секундах (по умолчанию `3600`).
- `AUTH_TOKEN_ALGORITHM` — алгоритм подписи JWT (по умолчанию `HS256`).
- `DATABASE_URL` — строка подключения SQLAlchemy (`sqlite:///./verae.db` по умолчанию, поддерживается PostgreSQL).


Порядок фичей в backend зафиксирован строго:

```python
FEATURES = [
    "LBXWBCSI", "LBXLYPCT", "LBXMOPCT", "LBXNEPCT", "LBXEOPCT", "LBXBAPCT",
    "LBXRBCSI", "LBXHGB", "LBXHCT", "LBXMCVSI", "LBXMC", "LBXMCHSI", "LBXRDW",
    "LBXPLTSI", "LBXMPSI", "RIAGENDR", "RIDAGEYR", "LBXSGL", "LBXSCH",
    "BMXBMI", "BMXHT", "BMXWT", "BMXWAIST", "BP_SYS", "BP_DIA"
]
```


> Если `.cbm` отсутствует, backend использует deterministic fallback-скоринг
> только для локальной проверки интеграции (не для продакшена).

---

## 4) Текущий API контракт

### `POST /v1/risk/predict`


### `POST /auth/register`

MVP-регистрация пользователя. Возвращает access token и профиль пользователя.

### `POST /auth/login`

MVP-логин пользователя. Возвращает access token и профиль пользователя.

### `GET /health`

Проверка живости сервиса (для DevOps/мониторинга). Ответ: `{"status": "ok"}`.

### `POST /analyses`

Создаёт analysis job для авторизованного пользователя (`Authorization: Bearer <token>`). В теле обязательны `upload` (метаданные) и `lab` (те же поля, что в `POST /v1/risk/predict`). Обработка запускается в фоне (BackgroundTasks); через 1–2 с при повторном опросе `GET /analyses/{id}` статус станет `completed`, после чего `GET /analyses/{id}/result` вернёт результат в формате Predict.

### `GET /analyses/{id}`

Возвращает статус analysis job для владельца (`queued | processing | completed | failed`), а для failed — `error_code` и `failure_diagnostic`.

### `GET /analyses/{id}/result`

Возвращает финальный нормализованный результат для владельца после завершения job.

Возвращает:

- `status`: `ok` или `needs_input`
- `iron_index` (мг/кг)
- `risk_percent` (UI mapping from BI)
- `risk_tier`: `HIGH | WARNING | GRAY | LOW`
- `clinical_action`
- `confidence`: `high | medium | low`
- `missing_required_fields`

Пороги `risk_tier`:

- `HIGH`: `iron_index < 0`
- `WARNING`: `0 <= iron_index <= 2`
- `GRAY`: `2 < iron_index <= 5`
- `LOW`: `iron_index > 5`

Пример запроса:

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

---

## 5) Остановка

```bash
docker compose down
```

С удалением volumes:

```bash
docker compose down -v
```

---

## 6) Тесты backend

Каноничный запуск тестов:

```bash
python -m pytest
```

Команда работает как из корня репозитория (через `pytest.ini` в корне), так и из каталога `backend/` (через `backend/pytest.ini`).
