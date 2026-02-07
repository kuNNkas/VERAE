"""
NHANES 2021-2023: Загрузка, парсинг, EDA
Цель: посмотреть что есть, что берём, что лишнее
"""

import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

pd.set_option('display.max_columns', None)
pd.set_option('display.width', 200)
pd.set_option('display.max_colwidth', 40)

DATA_DIR = os.path.join(os.path.dirname(__file__), "NHANES 2021-2023")

# ============================================================
# 1. Загрузка всех XPT файлов
# ============================================================
print("=" * 80)
print("ЗАГРУЗКА ФАЙЛОВ")
print("=" * 80)

files = {}
for fname in sorted(os.listdir(DATA_DIR)):
    if fname.lower().endswith('.xpt'):
        fpath = os.path.join(DATA_DIR, fname)
        # Чистим имя для использования как ключ
        key = fname.replace('.xpt', '').replace(' (1)', '').strip()
        try:
            df = pd.read_sas(fpath, format='xport')
            files[key] = df
            print(f"  {fname:30s} -> {key:15s} | {len(df):6d} строк | {len(df.columns):3d} столбцов")
        except Exception as e:
            print(f"  {fname:30s} -> ОШИБКА: {e}")

print(f"\nЗагружено файлов: {len(files)}")

# ============================================================
# 2. Обзор каждого файла: столбцы, типы, пропуски
# ============================================================
print("\n" + "=" * 80)
print("ОБЗОР КАЖДОГО ФАЙЛА")
print("=" * 80)

for key, df in files.items():
    print(f"\n{'-' * 60}")
    print(f"  {key}")
    print(f"  Строк: {len(df)} | Столбцов: {len(df.columns)}")
    print(f"  Столбцы: {list(df.columns)}")
    
    # Пропуски
    missing = df.isnull().sum()
    missing_pct = (missing / len(df) * 100).round(1)
    if missing.sum() > 0:
        print(f"  Пропуски:")
        for col in df.columns:
            if missing[col] > 0:
                print(f"    {col:20s}: {missing[col]:5d} ({missing_pct[col]:5.1f}%)")
    else:
        print(f"  Пропуски: нет")
    
    # Первые 3 строки
    print(f"  Первые 3 строки:")
    print(df.head(3).to_string(index=False))

# ============================================================
# 3. ЯДРО: CBC + BIOPRO + DEMO + FERTIN + TFR
# ============================================================
print("\n" + "=" * 80)
print("ЯДРО МОДЕЛИ: мерж по SEQN")
print("=" * 80)

core_keys = ['CBC_L', 'BIOPRO_L', 'DEMO_L', 'FERTIN_L', 'TFR_L']
missing_core = [k for k in core_keys if k not in files]
if missing_core:
    print(f"  ОТСУТСТВУЮТ: {missing_core}")
else:
    # Мержим ядро — берём только нужные столбцы, чтобы не дублировать WTPH2YR
    core = files['CBC_L'].copy()
    print(f"  CBC_L (base)  -> {len(core):6d} строк")
    
    # BIOPRO — убираем WTPH2YR (есть в CBC или добавим из DEMO)
    biopro_cols = [c for c in files['BIOPRO_L'].columns if c != 'WTPH2YR']
    core = core.merge(files['BIOPRO_L'][biopro_cols], on='SEQN', how='inner')
    print(f"  + BIOPRO_L     -> {len(core):6d} строк после inner join")
    
    # DEMO — всё
    core = core.merge(files['DEMO_L'], on='SEQN', how='inner')
    print(f"  + DEMO_L       -> {len(core):6d} строк после inner join")
    
    # FERTIN — только SEQN + ферритин
    core = core.merge(files['FERTIN_L'][['SEQN', 'LBXFER', 'LBDFERSI']], on='SEQN', how='inner')
    print(f"  + FERTIN_L     -> {len(core):6d} строк после inner join")
    
    # TFR — только SEQN + sTfR
    core = core.merge(files['TFR_L'][['SEQN', 'LBXTFR', 'LBDTFRSI']], on='SEQN', how='inner')
    print(f"  + TFR_L        -> {len(core):6d} строк после inner join")
    
    print(f"\n  Ядро: {len(core)} строк, {len(core.columns)} столбцов")

# ============================================================
# 4. Добавляем физ. данные: BMX (ИМТ) + BPXO (АД)
# ============================================================
print("\n" + "=" * 80)
print("ФИЗИЧЕСКИЕ ДАННЫЕ: BMX + BPXO")
print("=" * 80)

if 'BMX_L' in files:
    core = core.merge(files['BMX_L'][['SEQN', 'BMXBMI', 'BMXHT', 'BMXWT', 'BMXWAIST']]
                       if 'BMXWAIST' in files['BMX_L'].columns 
                       else files['BMX_L'], 
                       on='SEQN', how='left')
    bmi_na = core['BMXBMI'].isna().sum() if 'BMXBMI' in core.columns else -1
    print(f"  + BMX_L -> {len(core)} строк | BMXBMI пропуски: {bmi_na}")

# Ищем BPXO (может быть с пробелом или (1))
bpxo_key = None
for k in files:
    if 'BPXO' in k.upper() or 'BPX' in k.upper():
        bpxo_key = k
        break

if bpxo_key:
    bp_cols = [c for c in files[bpxo_key].columns if c.startswith('BPX') or c == 'SEQN']
    core = core.merge(files[bpxo_key][bp_cols], on='SEQN', how='left')
    print(f"  + {bpxo_key} -> {len(core)} строк | Столбцы АД: {[c for c in bp_cols if c != 'SEQN']}")
else:
    print(f"  BPXO не найден!")

# ============================================================
# 5. Анкетные данные: SMQ, ALQ, OCQ, PAQ
# ============================================================
print("\n" + "=" * 80)
print("АНКЕТНЫЕ ДАННЫЕ")
print("=" * 80)

questionnaire_map = {
    'SMQ_L': {
        'desc': 'Курение',
        'cols': ['SEQN', 'SMQ020', 'SMQ040'],  # ever smoked, current
    },
    'ALQ_L': {
        'desc': 'Алкоголь',
        'cols': ['SEQN', 'ALQ121', 'ALQ130'],  # частота, доз/день
    },
    'OCQ_L': {
        'desc': 'Занятость',
        'cols': ['SEQN', 'OCD150', 'OCQ180'],  # тип работы, часы/нед
    },
    'PAQ_L': {
        'desc': 'Физ. активность',
        'cols': ['SEQN', 'PAQ605', 'PAQ650', 'PAD680'],  # vigorous, moderate, sedentary
    },
}

for key, info in questionnaire_map.items():
    if key in files:
        available_cols = [c for c in info['cols'] if c in files[key].columns]
        if available_cols:
            core = core.merge(files[key][available_cols], on='SEQN', how='left')
            print(f"  + {key:10s} ({info['desc']:15s}) -> взяли: {[c for c in available_cols if c != 'SEQN']}")
        else:
            print(f"  + {key:10s} ({info['desc']:15s}) -> столбцы не найдены! Есть: {list(files[key].columns)[:10]}")
    else:
        print(f"  - {key:10s} ({info['desc']:15s}) -> файл не загружен")

# ============================================================
# 6. Лекарства и мед. условия
# ============================================================
print("\n" + "=" * 80)
print("ЛЕКАРСТВА И МЕД. УСЛОВИЯ")
print("=" * 80)

# MCQ - мед. условия
mcq_key = None
for k in files:
    if 'MCQ' in k.upper():
        mcq_key = k
        break

if mcq_key:
    print(f"  MCQ найден как '{mcq_key}': {len(files[mcq_key])} строк, {len(files[mcq_key].columns)} столбцов")
    print(f"  Столбцы: {list(files[mcq_key].columns)[:20]}...")
else:
    print(f"  MCQ не найден")

# RXQ_RX - лекарства  
if 'RXQ_RX_L' in files:
    rx = files['RXQ_RX_L']
    print(f"  RXQ_RX_L: {len(rx)} строк, столбцы: {list(rx.columns)[:15]}")
    print(f"  Уникальных SEQN: {rx['SEQN'].nunique()}")
    # Лекарства — один человек может принимать несколько
    # Нужно агрегировать: кол-во лекарств на человека
    rx_count = rx.groupby('SEQN').size().reset_index(name='N_MEDICATIONS')
    core = core.merge(rx_count, on='SEQN', how='left')
    core['N_MEDICATIONS'] = core['N_MEDICATIONS'].fillna(0).astype(int)
    print(f"  Добавлено: N_MEDICATIONS (среднее: {core['N_MEDICATIONS'].mean():.1f}, макс: {core['N_MEDICATIONS'].max()})")
else:
    print(f"  RXQ_RX_L не найден")

# ============================================================
# 7. ИТОГОВЫЙ ДАТАСЕТ
# ============================================================
print("\n" + "=" * 80)
print("ИТОГОВЫЙ ДАТАСЕТ")
print("=" * 80)
print(f"  Строк: {len(core)}")
print(f"  Столбцов: {len(core.columns)}")
print(f"\n  Все столбцы:")
for i, col in enumerate(core.columns):
    na = core[col].isna().sum()
    na_pct = na / len(core) * 100
    print(f"    {i+1:3d}. {col:25s} | NaN: {na:5d} ({na_pct:5.1f}%) | dtype: {core[col].dtype}")

# ============================================================
# 8. ТАРГЕТ: Body Iron (формула Cook)
# ============================================================
print("\n" + "=" * 80)
print("ТАРГЕТ: Body Iron (формула Cook)")
print("=" * 80)

ferritin_col = None
tfr_col = None
hgb_col = None

# Ищем ферритин
for c in core.columns:
    if 'FER' in c.upper() and 'LBXFER' in c.upper():
        ferritin_col = c
    elif 'FER' in c.upper() and 'LBX' in c.upper() and ferritin_col is None:
        ferritin_col = c
    if 'TFR' in c.upper() and 'LBX' in c.upper():
        tfr_col = c
    if c.upper() == 'LBXHGB':
        hgb_col = c

# Если не нашли точно, попробуем шире
if ferritin_col is None:
    fer_candidates = [c for c in core.columns if 'FER' in c.upper()]
    print(f"  Кандидаты для ферритина: {fer_candidates}")
    if fer_candidates:
        ferritin_col = fer_candidates[0]

if tfr_col is None:
    tfr_candidates = [c for c in core.columns if 'TFR' in c.upper()]
    print(f"  Кандидаты для sTfR: {tfr_candidates}")
    if tfr_candidates:
        tfr_col = tfr_candidates[0]

print(f"  Ферритин: {ferritin_col}")
print(f"  sTfR:     {tfr_col}")
print(f"  HGB:      {hgb_col}")

if ferritin_col and tfr_col:
    # Фильтруем строки где оба значения есть и > 0
    mask = (core[ferritin_col] > 0) & (core[tfr_col] > 0) & core[ferritin_col].notna() & core[tfr_col].notna()
    print(f"\n  Строк с валидными ферритин + sTfR: {mask.sum()} из {len(core)}")
    
    # ВАЖНО: единицы!
    # LBXTFR = sTfR в mg/L
    # LBXFER = ферритин в ng/mL = ug/L
    # Формула Cook ожидает ОБА в одинаковых единицах (ug/L)
    # Поэтому: sTfR * 1000 (mg/L -> ug/L)
    #
    # Body Iron (mg/kg) = -(log10(sTfR_ugL / ferritin_ugL) - 2.8229) / 0.1207
    
    stfr_ug = core.loc[mask, tfr_col] * 1000  # mg/L -> ug/L
    fer_ug = core.loc[mask, ferritin_col]       # уже в ng/mL = ug/L
    
    core.loc[mask, 'BODY_IRON'] = -(np.log10(stfr_ug / fer_ug) - 2.8229) / 0.1207
    
    print(f"\n  Проверка единиц:")
    print(f"    sTfR (LBXTFR) range: {core.loc[mask, tfr_col].min():.2f} - {core.loc[mask, tfr_col].max():.2f} mg/L")
    print(f"    Ferritin (LBXFER) range: {core.loc[mask, ferritin_col].min():.2f} - {core.loc[mask, ferritin_col].max():.2f} ng/mL")
    print(f"    sTfR * 1000 / Ferritin (ratio) range: {(stfr_ug / fer_ug).min():.1f} - {(stfr_ug / fer_ug).max():.1f}")
    
    # Таргеты
    core['Y_IRON_DEFICIENCY'] = (core['BODY_IRON'] < 0).astype(float)
    core.loc[core['BODY_IRON'].isna(), 'Y_IRON_DEFICIENCY'] = np.nan
    
    if hgb_col:
        # Пол: 1=мужчина, 2=женщина (NHANES coding)
        gender_col = 'RIAGENDR' if 'RIAGENDR' in core.columns else None
        if gender_col:
            # ЖДА: Body Iron < 0 AND HGB < порог (12 жен, 13 муж)
            hgb_threshold = np.where(core[gender_col] == 2, 12.0, 13.0)
            core['Y_IDA'] = ((core['BODY_IRON'] < 0) & (core[hgb_col] < hgb_threshold)).astype(float)
            core.loc[core['BODY_IRON'].isna(), 'Y_IDA'] = np.nan
        else:
            core['Y_IDA'] = ((core['BODY_IRON'] < 0) & (core[hgb_col] < 12.5)).astype(float)
            core.loc[core['BODY_IRON'].isna(), 'Y_IDA'] = np.nan
    
    # Статистика
    valid = core[core['BODY_IRON'].notna()]
    print(f"\n  Body Iron статистика ({len(valid)} валидных):")
    print(f"    Mean:   {valid['BODY_IRON'].mean():.2f} мг/кг")
    print(f"    Median: {valid['BODY_IRON'].median():.2f} мг/кг")
    print(f"    Min:    {valid['BODY_IRON'].min():.2f} мг/кг")
    print(f"    Max:    {valid['BODY_IRON'].max():.2f} мг/кг")
    print(f"    Std:    {valid['BODY_IRON'].std():.2f} мг/кг")
    
    n_id = (valid['Y_IRON_DEFICIENCY'] == 1).sum()
    print(f"\n  Дефицит железа (Body Iron < 0): {n_id} ({n_id/len(valid)*100:.1f}%)")
    
    if 'Y_IDA' in valid.columns:
        n_ida = (valid['Y_IDA'] == 1).sum()
        print(f"  ЖДА (дефицит + HGB↓):           {n_ida} ({n_ida/len(valid)*100:.1f}%)")
    
    # По полу
    if 'RIAGENDR' in valid.columns:
        print(f"\n  По полу:")
        for sex, label in [(1, 'Мужчины'), (2, 'Женщины')]:
            sub = valid[valid['RIAGENDR'] == sex]
            n_id_sex = (sub['Y_IRON_DEFICIENCY'] == 1).sum()
            n_ida_sex = (sub['Y_IDA'] == 1).sum() if 'Y_IDA' in sub.columns else 0
            print(f"    {label}: {len(sub)} чел | дефицит: {n_id_sex} ({n_id_sex/len(sub)*100:.1f}%) | ЖДА: {n_ida_sex} ({n_ida_sex/len(sub)*100:.1f}%)")

else:
    print("  НЕ УДАЛОСЬ ВЫЧИСЛИТЬ BODY IRON — нет ферритина или sTfR!")

# ============================================================
# 9. РЕКОМЕНДАЦИЯ: что берём, что лишнее
# ============================================================
print("\n" + "=" * 80)
print("РЕКОМЕНДАЦИЯ: ЧТО БЕРЁМ / ЧТО ЛИШНЕЕ")
print("=" * 80)

print("""
  ЯДРО (обязательно):
    CBC_L      — ОАК (фичи модели)
    BIOPRO_L   — Биохимия (глюкоза, холестерин, ALT, AST...)
    DEMO_L     — Пол, возраст, раса
    FERTIN_L   — Ферритин (для таргета)
    TFR_L      — sTfR (для таргета)

  ФИЗИЧЕСКИЕ (важно, есть в 29н):
    BMX_L      — ИМТ, рост, вес, окружность талии
    BPXO_L     — Артериальное давление

  АНКЕТНЫЕ (полезно):
    SMQ_L      — Курение (SMQ020, SMQ040)
    ALQ_L      — Алкоголь (ALQ121, ALQ130)
    OCQ_L      — Занятость (OCD150, OCQ180)
    PAQ_L      — Физ. активность

  ЛЕКАРСТВА:
    RXQ_RX_L   — Агрегировано в N_MEDICATIONS
    MCQ_L      — Мед. условия (можно добавить позже)

  ЛИШНЕЕ (убираем из модели):
    DBQ_L      — Диетология (99 переменных, не собирается в РФ)
    DPQ_L      — Депрессия PHQ-9 (не делают при 29н)
    HSQ_L      — Субъективное здоровье (ненадёжно)
    SMQFAM_L   — Курение в семье (нерелевантно для ЖДА)
    SMQRTU_L   — Детали табака (избыточно)
""")

# ============================================================
# 10. Сохраняем объединённый датасет
# ============================================================
out_path = os.path.join(os.path.dirname(__file__), "nhanes_merged.csv")
core.to_csv(out_path, index=False)
print(f"\nСохранено: {out_path}")
print(f"  {len(core)} строк × {len(core.columns)} столбцов")
print(f"\nГотово!")
