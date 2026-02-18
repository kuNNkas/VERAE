# MVP Go-Live Checklist

## 1) Release checklist

### Environment variables
- [x] `MODEL_NAME` задан.
- [x] `MODEL_PATH` задан.
- [x] `APP_ENV` задан (`dev` по умолчанию).
- [x] `CORS_ALLOW_ORIGINS` задан/имеет fallback.
- [x] `AUTH_TOKEN_SECRET` задан (для MVP есть dev fallback, для продакшена обязателен отдельный секрет).
- [x] `AUTH_TOKEN_TTL_SECONDS` задан (fallback: `3600`).
- [x] `AUTH_TOKEN_ALGORITHM` задан (fallback: `HS256`).
- [x] `DATABASE_URL` задан (fallback: `sqlite:///./verae.db`).

### Migrations
- [⚠] SQL-миграции существуют (`migrations/`), но в текущем MVP нет автоматизированного раннера миграций в runtime (`init_db()` использует `Base.metadata.create_all`).
- [⚠] Зафиксировано расхождение миграций по `users` (есть вариант Postgres + отдельная sqlite-like схема), нужен единый путь применения миграций к релизу.

### Docker Compose from scratch
- [⚠] Проверка `docker compose up --build` не выполнена в этом окружении (Docker CLI отсутствует).
- [ ] Перед релизом обязательно прогнать с нуля:
  - `docker compose down -v`
  - `docker compose up --build`
  - Проверить `http://localhost:8000/health` и `http://localhost:8080`

### Healthcheck + smoke-flow
- [x] Health endpoint доступен в тестовом контуре (через FastAPI TestClient).
- [x] Smoke-flow в MVP проходит: `register -> create analysis -> status polling -> result`.

---

## 2) Dry-run (register -> create analysis -> status polling -> result)

Прогон выполнен локально через `TestClient` (без Docker), с реальными API endpoint'ами приложения.

### Команда
```bash
PYTHONPATH=backend python - <<'PY'
import time, uuid
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import init_db

init_db()
client = TestClient(app)
email = f"dryrun-{uuid.uuid4().hex[:8]}@example.com"

reg = client.post('/auth/register', json={'email': email, 'password': 'password123'})
print('REGISTER', reg.status_code, reg.json().get('user',{}).get('email'))
token = reg.json()['access_token']
headers={'Authorization': f'Bearer {token}'}

create = client.post('/analyses', headers=headers, json={
  'upload': {'filename':'demo.pdf','content_type':'application/pdf','size_bytes':12345,'source':'web'},
  'lab': {
    'LBXHGB':120,'LBXMCVSI':79,'LBXMCHSI':330,'LBXRDW':15.2,'LBXRBCSI':4.6,
    'LBXHCT':37,'RIDAGEYR':31,'LBXSGL':5.5,'LBXSCH':5.0,'RIAGENDR':2,'BMXBMI':22.5
  }
})
print('CREATE_ANALYSIS', create.status_code, create.json().get('status'))
analysis_id = create.json()['analysis_id']

for i in range(8):
    st = client.get(f'/analyses/{analysis_id}', headers=headers)
    print(f'STATUS_POLL_{i+1}', st.status_code, st.json().get('status'))
    if st.json().get('status') == 'completed':
        break
    time.sleep(0.35)

res = client.get(f'/analyses/{analysis_id}/result', headers=headers)
print('RESULT', res.status_code, {
  'status': res.json().get('status'),
  'risk_tier': res.json().get('risk_tier'),
  'confidence': res.json().get('confidence'),
})
PY
```

### Результат dry-run
- `REGISTER 201`
- `CREATE_ANALYSIS 202 queued`
- `STATUS_POLL_1 200 completed`
- `RESULT 200 {'status': 'ok', 'risk_tier': 'HIGH', 'confidence': 'medium'}`

Итог: цепочка e2e для MVP успешна.

---

## 3) Known limitations MVP

1. **Нет автоматического запуска SQL-миграций при старте сервиса**
   - Сейчас схема поднимается через SQLAlchemy `create_all`, а не через versioned migration runner.
   - Действие вручную: определить единый migration-tool (Alembic/Goose/Flyway), добавить шаг в CI/CD и startup job.

2. **Миграции в репозитории не унифицированы под один источник истины**
   - Есть несовместимые определения `users` в разных SQL-файлах.
   - Действие вручную: выбрать целевую БД (Postgres для production), привести миграции к единой последовательности.

3. **Docker smoke-check не автоматизирован в CI в рамках этого прогона**
   - В текущем окружении нет Docker CLI.
   - Действие вручную: обязательный pre-release запуск `docker compose down -v && docker compose up --build`.

4. **JWT-секрет имеет небезопасный fallback для dev**
   - Для production требуется отдельный секрет в secret manager.
   - Действие вручную: задать `AUTH_TOKEN_SECRET` и ротацию секрета.

5. **Нет отдельного автоматизированного smoke-script как артефакта репозитория**
   - Dry-run выполнен ad-hoc командой.
   - Действие вручную: вынести в `scripts/smoke_mvp_flow.py` и запускать в CI.

---

## 4) Demo script (3–5 минут) для стейкхолдеров

### Тайминг
- **0:00–0:30** — контекст
- **0:30–1:30** — регистрация/логин
- **1:30–3:00** — создание анализа и статус
- **3:00–4:30** — результат и интерпретация
- **4:30–5:00** — ограничения и следующие шаги

### Сценарий
1. Открыть UI (`http://localhost:8080`) и кратко показать, что это MVP для оценки риска дефицита железа.
2. Зарегистрировать тестового пользователя (или залогиниться существующим).
3. Создать новый analysis (ввод лабораторных параметров + метаданные загрузки).
4. Показать экран/эндпоинт статуса analysis (queued/processing/completed).
5. После completion открыть результат:
   - `status`
   - `risk_tier`
   - `confidence`
   - коротко объяснить clinical action.
6. Явно проговорить MVP-ограничения:
   - миграции и docker smoke пока не полностью автоматизированы,
   - есть ручные pre-release шаги,
   - следующая итерация — CI automation + migration hardening.

### Backup plan (если UI недоступен)
- Провести демо через API (Swagger/curl):
  - `POST /auth/register`
  - `POST /analyses`
  - `GET /analyses/{id}`
  - `GET /analyses/{id}/result`

