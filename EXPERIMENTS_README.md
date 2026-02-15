# Эксперименты для статьи: Body Iron vs Ferritin + Сравнение фичесетов

Два эксперимента для подготовки данных к публикации в медицинском журнале.

## Эксперимент №1: Body Iron vs Ferritin Target

**Файл**: `experiment_targets.py`

**Цель**: Измерить шумность ферритина как таргета, особенно при воспалении (CRP≥5).

**Сравниваемые таргеты**:
- **T0** (Body Iron < 0) — gold standard на основе sTfR/ferritin
- **T1** (Ferritin < 30) — naive ferritin-based target
- **T2a** (CRP-aware, exclude uncertain) — ferritin <30 ИЛИ (ferritin≥30 И CRP<5)
- **T2b** (CRP-aware, keep uncertain as negative) — uncertain пациенты (ferritin≥30 И CRP≥5) учитываются как "negative"

**Метрики**:
- Agreement между таргетами (общий и по группам CRP<5 / CRP≥5)
- Confusion matrix T0 vs T1 stratified by CRP
- Model performance (Logistic Regression, 5×3 CV): PR-AUC, ROC-AUC на каждом таргете
- Noise sensitivity: как часто модель T0 уверенно (p>0.8) предсказывает дефицит у пациентов с ferritin≥30

**Запуск**:
```bash
python experiment_targets.py
```

**Выходные файлы** (в `results/target_comparison/`):
- `target_comparison_metrics.csv` — метрики моделей для всех таргетов
- `confusion_matrix_t0_t1_by_crp.png` — confusion matrices по группам CRP
- `disagreement_heatmap.png` — heatmap расхождений между T0 и T1 по CRP
- `target_comparison_prauc.png` — bar plot: PR-AUC для всех таргетов
- `noise_sensitivity_crp.png` — False Positive rate (T0 model, T1 label=0) по CRP
- `summary.txt` — текстовый отчёт с выводами

---

## Эксперимент №2: KDL vs 29н vs Ext (роль фичесетов)

**Файл**: `experiment_featuresets.py`

**Цель**: Показать, где CatBoost/бустинг начинает выигрывать из-за пропусков/нелинейностей.

**Сравниваемые датасеты**:
- **X_kdl** (17 фич, CBC only) — ~99.8% полных строк
- **X_29n** (25 фич, CBC + vitals/anthro/bio) — ~87.8% полных строк
- **X_ext** (40 фич, full) — ~6.8% полных строк

**Модели**:
- **LogReg** (baseline, интерпретируемая)
- **CatBoost** (production, нативная поддержка NaN)

**Метрики**:
- PR-AUC, ROC-AUC (5×3 CV)
- Brier score
- Calibration curves
- PPV @ Recall=0.90 (практичная метрика для триажа)
- Улучшение CatBoost vs LogReg (Δ AUC)

**Запуск**:
```bash
python experiment_featuresets.py
```

Или через bat-файл (для обхода проблем с кириллицей в пути):
```bash
run_experiment_featuresets.bat
```

**Выходные файлы** (в `results/featureset_comparison/`):
- `featureset_comparison_metrics.csv` — метрики всех моделей
- `featureset_comparison_auc.png` — bar plots: PR-AUC и ROC-AUC
- `calibration_curves.png` — calibration curves для kdl/29n/ext
- `ppv_at_recall90.png` — PPV при Recall=0.90 (меньше FP = лучше)
- `catboost_improvement.png` — улучшение CatBoost vs LogReg
- `comparison_table.md` — детальная таблица для статьи
- `summary.txt` — текстовый отчёт с рекомендациями

---

## Структура для статьи

### Methods

**Population**: NHANES (2015-2023), женщины 12-49 лет, n=6303

**Outcomes**:
- Body Iron (Cook formula): (log₁₀(sTfR/Ferritin) - 2.8229) / 0.1207
- Iron Deficiency: Body Iron < 0
- Alternative targets: ferritin-based (naive, CRP-aware)

**Feature sets**:
- KDL: CBC (17 фич)
- 29н: CBC + vitals + biochemistry (25 фич)
- Ext: Full (40 фич, включая анкеты)

**Modeling**:
- Logistic Regression (baseline)
- CatBoost (production)
- Cross-validation: RepeatedStratifiedKFold (5×3)
- Metrics: PR-AUC, ROC-AUC, Brier score, calibration, PPV@Recall=0.90

### Figures (минимум для статьи)

1. **Figure 1**: Confusion matrix (Body Iron vs Ferritin) × CRP group
   - Показывает, что при CRP≥5 расхождений больше (inflammation masks iron deficiency)

2. **Figure 2**: PR-AUC comparison for different targets
   - T0 (Body Iron): ~0.76
   - T1 (Ferritin naive): ~0.73 (шумнее)
   - T2a (CRP-aware exclude): ~0.81 (лучше, но меньше выборка)

3. **Figure 3**: Featureset comparison (PR-AUC bar plot + calibration curves)
   - KDL: LogReg ≈ CatBoost (линейная задача)
   - 29н: CatBoost немного лучше (пропуски, нелинейности)
   - Ext: мало данных

4. **Figure 4**: PPV @ Recall=0.90 (практичная метрика для триажа)
   - Показывает, сколько FP при 90% чувствительности
   - Важно для экономической оценки (конверсия в ферритин)

### Discussion

**Key findings**:
1. Ferritin-based target даёт label noise, особенно при воспалении (CRP≥5)
2. Body Iron (sTfR/ferritin) — более чистый gold standard для обучения моделей
3. На "чистом" CBC (KDL) LogReg достаточно — задача почти линейная
4. На реальных данных (29н) CatBoost дает небольшое улучшение
5. Calibration: LogReg лучше "из коробки", CatBoost требует дополнительной калибровки

**Clinical workflow** (4 сценария):
- КДЛ (MVP): LogReg на CBC → триаж для апсейла ферритина
- 29н (B2B): CatBoost на CBC+vitals → триаж для предотвращения больничных
- CRP interpretation: рекомендован для интерпретации, но не обязателен для prediction
- Маршрутизация: low risk (<30% confidence) — норма, gray zone (30-70%) — рекомендация, high risk (>70%) — срочная консультация

---

## Требования

**Python пакеты**:
```bash
pip install pandas numpy matplotlib seaborn scikit-learn catboost
```

**Данные**:
- `nhanes_final.csv` — полный датасет (создаётся `build_final_dataset.py`)
- `train_data/X_kdl.csv`, `X_29n.csv`, `X_ext.csv` — фичесеты
- `train_data/y.csv` — таргеты

**Время выполнения**:
- Эксперимент №1 (targets): ~10-15 секунд
- Эксперимент №2 (featuresets): ~3-5 минут (6 моделей × 15 CV фолдов)

---

## Авторы

Разработано для проекта **Rats Marks** — предиктивная диагностика дефицита железа по общему анализу крови.

Для вопросов: см. `TRAINING_FLOW.md`, `LIMITATION_BODY_IRON.md`
