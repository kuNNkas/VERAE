# VERAE MVP (B2C v0)

Минимальный end-to-end MVP для ручного ввода лабораторных показателей:

- **Frontend**: форма ввода + pre-check обязательных полей
- **Backend (FastAPI)**: валидация, расчёт риска, confidence, tier
- **Model**: `ironrisk_bi_29n_women18_49.cbm` (ожидается в корне проекта)

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

- `MODEL_NAME=ironrisk_bi_29n_women18_49.cbm`
- `MODEL_PATH=/workspace/ironrisk_bi_29n_women18_49.cbm`
- `FEATURES_PATH=/workspace/train_data/features_29n.txt`

Эти переменные уже прописаны в `docker-compose.yml`.

> Если `.cbm` отсутствует, backend использует deterministic fallback-скоринг
> только для локальной проверки интеграции (не для продакшена).

---

## 4) Текущий API контракт

### `POST /v1/risk/predict`

Возвращает:

- `status`: `ok` или `needs_input`
- `risk_percent`
- `risk_tier`: `high | gray | low`
- `confidence`: `high | medium | low`
- `missing_required_fields`

Пороги `risk_tier`:

- `high`: `>= 0.50`
- `gray`: `0.10–0.50`
- `low`: `< 0.10`

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
