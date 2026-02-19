# API и Frontend MVP: что сделано и что доделать

Состояние по контракту API (`api/openapi.yaml`, `API_CONTRACT.md`) и фронтенду относительно MVP (MVP_PLAN, FLOWS, MVP_GO_LIVE).

---

## 1. API (контракт и соответствие)

### 1.1 Что сделано

- **Единый контракт**: `api/openapi.yaml` — основной источник истины; в `API_CONTRACT.md` приведены каноничные примеры запросов/ответов.
- **Эндпоинты в OpenAPI**:
  - `GET /health` → HealthResponse
  - `POST /auth/register` (201/409), `POST /auth/login` (200/401)
  - `GET /analyses`, `POST /analyses` (202), `GET /analyses/{id}`, `GET /analyses/{id}/result` (200/404/409)
  - `POST /v1/risk/predict` (200, oneOf: PredictResponseOk | PredictResponseNeedsInput)
- **Схемы**: RegisterRequest, LoginRequest, AuthResponse, UserInfo, CreateAnalysisRequest/Response, UploadMetadata, AnalysisStatusResponse (с error_code, failure_diagnostic), AnalysisStatus (pending | processing | completed | failed), ProgressStage, PredictRequest (все поля опциональные number/integer), PredictResponse oneOf, PredictExplanation.
- **Тесты бэкенда**: e2e проверяют ответы по схемам OpenAPI (`test_e2e_flow.py`).
- **Бэкенд** отдаёт формы ответов, совместимые с контрактом (auth, analyses, predict).

### 1.2 Расхождения и доделать

1. **Статус при создании анализа**  
   В **OpenAPI** `AnalysisStatus` = `pending | processing | completed | failed` (нет `queued`). В **API_CONTRACT.md** в примере `POST /analyses` указано `"status": "queued"`. Бэкенд возвращает `status: "pending"`.  
   - **Рекомендация**: привести контракт к одному варианту. Либо в OpenAPI и бэкенде везде использовать `pending` при постановке в очередь и обновить пример в API_CONTRACT.md на `"status": "pending"`; либо ввести в OpenAPI значение `queued` и сменить бэкенд на `queued`.

2. **PredictResponse и дополнительные поля**  
   Бэкенд при `needs_input` и при `invalid_payload` отдаёт поля `error_code`, `message`, `invalid_fields`. В OpenAPI у `PredictResponseOk` и `PredictResponseNeedsInput` стоит `additionalProperties: false` и этих полей нет.  
   - Либо добавить в OpenAPI опциональные `error_code`, `message`, `invalid_fields` в соответствующую схему (или общую часть PredictResponse), либо не отдавать их с бэкенда, чтобы не нарушать контракт.

3. **Актуальность OpenAPI**  
   При любом изменении ответов (новые поля, новые коды ошибок) первым шагом обновлять `api/openapi.yaml`, затем бэкенд/фронт.

---

## 2. Frontend — что сделано

### 2.1 Роутинг и экраны

- **/** — редирект: с токеном → `/form`, без → `/login`.
- **/login**, **/register** — формы с валидацией (zod), вызов API, сохранение JWT в sessionStorage, редирект на `/form`.
- **/form** — форма ввода лабораторных показателей (обязательные + рекомендуемые + BMI или рост/вес), создание анализа через `POST /analyses`, редирект на `/analyses/{id}`.
- **/analyses** — список анализов пользователя (`GET /analyses`), ссылки на `/analyses/{id}/result`.
- **/analyses/[id]** — страница статуса: polling `GET /analyses/{id}`, отображение этапа, при `completed` — редирект на result, при `failed` — сообщение и ссылка на новый анализ, таймаут ~75 с.
- **/analyses/[id]/result** — результат: проверка статуса, при `completed` — `GET /analyses/{id}/result`, отображение risk_tier, risk_percent, iron_index, clinical_action, confidence, бар по iron_index, блок объяснений (explanations).

### 2.2 Auth и API-клиент

- **auth.ts**: хранение токена и last_analysis_id в sessionStorage, `fetchWithAuth` с заголовком Authorization, при 401 — очистка токена и редирект на `/login`.
- **api.ts**: типы (AnalysisStatus, AnalysisStatusResponse, PredictResponse Ok/NeedsInput, AuthResponse, CreateAnalysisResponse, UploadMetadata и др.), функции `login`, `register`, `createAnalysis`, `listAnalyses`, `getAnalysisStatus`, `getAnalysisResult`, `getApiErrorMessage`, базовый URL из `NEXT_PUBLIC_API_URL`.
- **auth-guard.tsx**: проверка токена, при отсутствии — редирект на `/login`; оборачивает защищённые страницы (form, analyses, result, status).

### 2.3 Форма и валидация

- **schemas.ts**: `REQUIRED_BASE`, `BMI_ALTERNATIVE`, `RECOMMENDED`, `labFormSchema` (zod) с правилом «BMXBMI или BMXHT+BMXWT», типы для формы.
- Форма собирает все поля в `lab`, формирует `upload` (filename, content_type, size_bytes), отправляет в `createAnalysis(upload, lab)`.
- Pre-check обязательных полей и BMI перед отправкой, отображение списка незаполненных полей и ошибки по BMI.

### 2.4 Результат и объяснения

- Отображение уровня риска, процента, индекса железа, клинической рекомендации, уверенности.
- Горизонтальный бар (recharts) по шкале iron_index с цветом по tier.
- Блок «Что повлияло на оценку»: список explanations с иконкой направления (ArrowDown/Up) и текстом.

### 2.5 Наблюдаемость и UX

- **telemetry.ts**: `trackEvent(event, payload)`, адаптер опционален, иначе `console.info`.
- Вызовы: form_submit_success, api_error (form, analysis_status, analysis_result), result_shown (analysis_id, risk_tier, confidence).
- Обработка ошибок: вывод сообщений через `getApiErrorMessage`, setError("root") на форме, отдельные экраны при 404/409/ошибке загрузки.

### 2.6 Типы и контракт

- Типы фронта в целом совпадают с контрактом (AuthResponse, CreateAnalysisResponse, PredictResponse, AnalysisStatusResponse). Единственное расхождение — см. ниже про `AnalysisStatus` (queued vs pending).

---

## 3. Frontend — что доделать до MVP

### 3.1 Критично / быстрые правки

1. **Тип `AnalysisStatus`**  
   В **api.ts** задано `AnalysisStatus = "queued" | "processing" | "completed" | "failed"`. В OpenAPI и бэкенде начальный статус при создании — **pending**. Страница статуса уже использует `pending` в `STATUS_META`.  
   - Добавить в тип `"pending"` и при необходимости оставить `"queued"` для обратной совместимости, либо заменить `"queued"` на `"pending"`, чтобы типы совпадали с API.

2. **Импорт `getApiErrorMessage` на странице результата**  
   На странице `/analyses/[id]/result` используется `getApiErrorMessage(error, …)`, импорт из `@/lib/api` добавлен — после правки импорт есть, убедиться что нигде больше не используется без импорта.

### 3.2 По плану MVP (MVP_PLAN, FLOWS)

3. **Дисклеймер**  
   В плане B2C обязателен экран/блок: «Это не медицинский диагноз. Результат носит информационный характер. Рекомендуем обсудить с врачом. Сервис не является медицинским изделием.»  
   - Добавить постоянный дисклеймер на странице результата (и при желании в подвале или на форме).

4. **Gauge / визуализация риска**  
   В плане: «Gauge вероятности P(дефицит)», «светофор по параметрам». Сейчас есть бар по iron_index и текст уровня.  
   - При желании довести до явного «gauge» (например круговая шкала или полоска с зонами низкий/средний/высокий риск) и явного светофора по полям — по приоритету после базового go-live.

5. **Рекомендация «сдать у партнёра»**  
   В плане: «Один шаг — 1 рекомендация + кнопка "сдать"», «Сдать ферритин у партнёра — скидка 15%».  
   - Сейчас есть только текст `clinical_action`. Для MVP можно добавить кнопку/ссылку «Сдать у партнёра» (URL партнёра или лендинг), без обязательной интеграции оплаты.

6. **Популяционное сравнение (перцентили)**  
   В плане: «Популяционное сравнение (перцентили по полу/возрасту)». На бэкенде перцентилей пока нет.  
   - Отложить до появления API перцентилей или отображать заглушку «Скоро».

7. **Человекочитаемые названия полей в форме**  
   Сейчас в форме выводятся коды полей (LBXHGB, BMXBMI и т.д.). В бэкенде есть `FEATURE_LABELS`.  
   - Для MVP можно заменить отображение на короткие подписи (например «Гемоглобин», «ИМТ») — через маппинг на фронте или отдельный эндпоинт метаданных.

8. **Публичный лендинг**  
   Сейчас главная страница только редирект. В плане B2C — лендинг с описанием продукта, затем вход/регистрация.  
   - Для первого запуска допустим редирект; перед публичным трафиком добавить хотя бы одну лендинговую страницу с ценностью продукта и CTA «Войти / Зарегистрироваться».

### 3.3 Желательно позже (не блокер MVP)

- Загрузка PDF/фото ОАК (OCR).
- Личный кабинет в расширенном виде (сейчас есть список анализов и переход к результату).
- Трекинг динамики риска по нескольким анализам.
- Реферальная ссылка на КДЛ-партнёра (можно заложить кнопкой «Сдать у партнёра»).

---

## 4. Краткая сводка

| Область | Сделано | Доделать до MVP |
|--------|---------|------------------|
| **API контракт** | OpenAPI полный, примеры в API_CONTRACT, e2e по схемам | Привести status (queued/pending), при необходимости добавить error_code/message/invalid_fields в схемы |
| **Frontend: экраны** | Login, Register, Form, List analyses, Status (polling), Result (risk + explanations) | Дисклеймер на результате; опционально gauge/светофор, кнопка «Сдать у партнёра» |
| **Frontend: auth** | JWT в sessionStorage, fetchWithAuth, 401 → logout + redirect, AuthGuard | — |
| **Frontend: типы** | Совпадение с контрактом по большей части | AnalysisStatus: добавить/заменить на "pending" |
| **Frontend: форма** | Обязательные + рекомендуемые, BMI или рост/вес, валидация zod | Человекочитаемые подписи полей (по приоритету) |
| **Frontend: результат** | risk_tier, risk_percent, bar, clinical_action, explanations | Дисклеймер; при желании — явный gauge и CTA партнёра |
| **Лендинг** | Редирект с / | Публичная лендинг-страница перед трафиком |

Если нужно, могу предложить конкретные правки: тип `AnalysisStatus` в api.ts, текст дисклеймера и место его вставки на странице результата, пример кнопки «Сдать у партнёра».
