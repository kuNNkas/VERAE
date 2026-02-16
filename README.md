# VERAE MVP (B2C v0)

Минимальный end-to-end MVP для ручного ввода лабораторных показателей:

- **Frontend**: форма ввода + pre-check обязательных полей
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

---

## 3) Модель и данные

По умолчанию backend использует:

- `MODEL_NAME=ironrisk_bi_reg_29n.cbm`
- `MODEL_PATH=/workspace/ironrisk_bi_reg_29n.cbm`

Эти переменные уже прописаны в `docker-compose.yml`.

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

### `POST /analyses`

Создаёт analysis job для авторизованного пользователя (`Authorization: Bearer <token>`).

### `GET /analyses/{id}`

Возвращает статус analysis job для владельца.

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

