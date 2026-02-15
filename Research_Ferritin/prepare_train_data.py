"""
ПОДГОТОВКА ДАННЫХ ДЛЯ ОБУЧЕНИЯ
nhanes_final.csv -> X_kdl.csv, X_29n.csv, X_ext.csv, y.csv, crp_validation.csv

Три набора фич (по сценариям развёртывания):
  1) КДЛ-минимум: только ОАК + пол/возраст (17 фич)
  2) 29н-минимум: + глюкоза/холестерин + ИМТ + АД (25 фич)
  3) Расширенный: + полная биохимия + анкеты (курение, алкоголь, работа) (40 фич)

CRP сохраняется отдельно для валидации (не фича, не таргет).
Прямые маркеры железа (LBXFER, LBXTFR, LBXSIR, BODY_IRON) ИСКЛЮЧЕНЫ.
"""

import pandas as pd
import numpy as np
import os
import sys

# Кодировка для Windows-консоли
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "nhanes_final.csv")
OUT = os.path.join(BASE, "train_data")

os.makedirs(OUT, exist_ok=True)

# ============================================================
# 1. Загрузка
# ============================================================
print("=" * 60)
print("ПОДГОТОВКА ДАННЫХ К ОБУЧЕНИЮ")
print("=" * 60)

df = pd.read_csv(SRC)
print(f"\nИсходный датасет: {len(df)} строк x {len(df.columns)} столбцов")

# ============================================================
# 2. Фильтрация: только строки с валидным таргетом
# ============================================================
df = df[df['Y_IRON_DEFICIENCY'].notna()].copy()
print(f"После фильтра (Y_IRON_DEFICIENCY not null): {len(df)} строк")

n_id = int((df['Y_IRON_DEFICIENCY'] == 1).sum())
n_ida = int((df['Y_IDA'] == 1).sum())
print(f"  Дефицит железа (BI<0):  {n_id} ({n_id/len(df)*100:.1f}%)")
print(f"  ЖДА (BI<0 + Hgb low):  {n_ida} ({n_ida/len(df)*100:.1f}%)")

# ============================================================
# 3. Определение наборов фич
# ============================================================

# --- Утечки (НИКОГДА не в фичах) ---
LEAKAGE = ['LBXFER', 'LBXTFR', 'LBXSIR', 'BODY_IRON']

# --- Таргеты ---
TARGETS = ['Y_IRON_DEFICIENCY', 'Y_IDA']

# --- Служебные ---
SERVICE = ['SEQN', 'CYCLE']

# --- Валидация (не фича, не таргет) ---
VALIDATION = ['LBXHSCRP']

# --- ОАК (15 показателей) ---
CBC = [
    'LBXWBCSI',   # WBC
    'LBXLYPCT',   # Lymphocyte %
    'LBXMOPCT',   # Monocyte %
    'LBXNEPCT',   # Neutrophil %
    'LBXEOPCT',   # Eosinophil %
    'LBXBAPCT',   # Basophil %
    'LBXRBCSI',   # RBC
    'LBXHGB',     # Hemoglobin
    'LBXHCT',     # Hematocrit
    'LBXMCVSI',   # MCV
    'LBXMC',      # MCH  (в nhanes_final так назван)
    'LBXMCHSI',   # MCHC
    'LBXRDW',     # RDW
    'LBXPLTSI',   # Platelets
    'LBXMPSI',    # MPV
]

# --- Демография (для обоих наборов) ---
DEMO = [
    'RIAGENDR',   # Пол (1=M, 2=F)
    'RIDAGEYR',   # Возраст
]

# --- Этничность (для расширенного; в 29н нет, но полезно) ---
ETHNICITY = ['RIDRETH3']

# --- Биохимия минимальная (29н: глюкоза, холестерин) ---
BIOCHEM_MIN = [
    'LBXSGL',     # Glucose
    'LBXSCH',     # Cholesterol
]

# --- Биохимия расширенная ---
BIOCHEM_EXT = [
    'LBXSAL',     # Albumin
    'LBXSTP',     # Total protein
    'LBXSATSI',   # ALT
    'LBXSASSI',   # AST
    'LBXSTB',     # Bilirubin
    'LBXSLDSI',   # LDH
    'LBXSCR',     # Creatinine
    'LBXSUA',     # Uric acid
]

# --- Физические (29н: ИМТ, рост, вес, ОТ, АД) ---
PHYSICAL = [
    'BMXBMI',     # BMI
    'BMXHT',      # Height
    'BMXWT',      # Weight
    'BMXWAIST',   # Waist circumference
    'BP_SYS',     # Systolic BP
    'BP_DIA',     # Diastolic BP
]

# --- Анкетные (расширенный) ---
QUESTIONNAIRE = [
    'SMQ020',     # Smoked 100+ cigarettes
    'SMQ040',     # Current smoking status
    'ALQ121',     # Alcohol frequency (2017+)
    'ALQ130',     # Avg drinks/occasion
    'OCD150',     # Occupation type
    'OCQ180',     # Hours worked/week
]

# ============================================================
# Набор 1: КДЛ-минимум (только лабораторные данные)
# ============================================================
FEATURES_KDL = CBC + DEMO
FEATURES_KDL = [c for c in FEATURES_KDL if c in df.columns]

# ============================================================
# Набор 2: 29н-минимум (корпоративный скрининг)
# ============================================================
FEATURES_29N = CBC + DEMO + BIOCHEM_MIN + PHYSICAL
FEATURES_29N = [c for c in FEATURES_29N if c in df.columns]

# ============================================================
# Набор 3: Расширенный (полные данные)
# ============================================================
FEATURES_EXT = CBC + DEMO + ETHNICITY + BIOCHEM_MIN + BIOCHEM_EXT + PHYSICAL + QUESTIONNAIRE
FEATURES_EXT = [c for c in FEATURES_EXT if c in df.columns]

# ============================================================
# 4. Проверка: нет ли утечек
# ============================================================
for feat_list, label in [(FEATURES_KDL, 'КДЛ-мин'), (FEATURES_29N, '29н-мин'), (FEATURES_EXT, 'Расширенный')]:
    leaks = [c for c in feat_list if c in LEAKAGE]
    if leaks:
        print(f"\n  ОШИБКА: утечка в {label}: {leaks}")
        raise ValueError(f"Leakage detected: {leaks}")

print("\n  Утечки проверены: чисто.")

# ============================================================
# 5. Статистика по наборам
# ============================================================
print("\n" + "=" * 60)
print("НАБОР 1: КДЛ-МИНИМУМ (только лабораторные)")
print("=" * 60)
print(f"  Фич: {len(FEATURES_KDL)}")
for c in FEATURES_KDL:
    na = df[c].isna().sum()
    pct = na / len(df) * 100
    print(f"    {c:15s}  NaN: {na:5d} ({pct:5.1f}%)")

complete_kdl = df[FEATURES_KDL].dropna().shape[0]
print(f"\n  Полных строк (без NaN): {complete_kdl} / {len(df)} ({complete_kdl/len(df)*100:.1f}%)")

print("\n" + "=" * 60)
print("НАБОР 2: 29н-МИНИМУМ (корпоративный скрининг)")
print("=" * 60)
print(f"  Фич: {len(FEATURES_29N)}")
extra_29n = [c for c in FEATURES_29N if c not in FEATURES_KDL]
print(f"  Добавлено поверх КДЛ ({len(extra_29n)}):")
for c in extra_29n:
    na = df[c].isna().sum()
    pct = na / len(df) * 100
    print(f"    {c:15s}  NaN: {na:5d} ({pct:5.1f}%)")

complete_29n = df[FEATURES_29N].dropna().shape[0]
print(f"\n  Полных строк (без NaN): {complete_29n} / {len(df)} ({complete_29n/len(df)*100:.1f}%)")

print("\n" + "=" * 60)
print("НАБОР 3: РАСШИРЕННЫЙ (полные данные)")
print("=" * 60)
print(f"  Фич: {len(FEATURES_EXT)}")
extra_ext = [c for c in FEATURES_EXT if c not in FEATURES_29N]
print(f"  Добавлено поверх 29н ({len(extra_ext)}):")
for c in extra_ext:
    na = df[c].isna().sum()
    pct = na / len(df) * 100
    print(f"    {c:15s}  NaN: {na:5d} ({pct:5.1f}%)")

complete_ext = df[FEATURES_EXT].dropna().shape[0]
print(f"\n  Полных строк (без NaN): {complete_ext} / {len(df)} ({complete_ext/len(df)*100:.1f}%)")

# ============================================================
# 6. Баланс классов
# ============================================================
print("\n" + "=" * 60)
print("БАЛАНС КЛАССОВ")
print("=" * 60)

for target_name in TARGETS:
    t = df[target_name]
    n1 = int((t == 1).sum())
    n0 = int((t == 0).sum())
    na = int(t.isna().sum())
    ratio = n0 / n1 if n1 > 0 else float('inf')
    print(f"\n  {target_name}:")
    print(f"    0 (норма):   {n0:5d}")
    print(f"    1 (патол):   {n1:5d}")
    print(f"    NaN:         {na:5d}")
    print(f"    Дисбаланс:   1:{ratio:.1f}")

# ============================================================
# 7. Корреляция ОАК-фич с таргетом (быстрый взгляд)
# ============================================================
print("\n" + "=" * 60)
print("КОРРЕЛЯЦИЯ ОАК С Y_IRON_DEFICIENCY (point-biserial)")
print("=" * 60)

target = df['Y_IRON_DEFICIENCY']
corrs = []
for c in CBC:
    if c in df.columns:
        r = df[c].corr(target)
        corrs.append((c, r))
corrs.sort(key=lambda x: abs(x[1]), reverse=True)
for c, r in corrs:
    bar = '#' * int(abs(r) * 50)
    sign = '+' if r > 0 else '-'
    print(f"  {c:15s}  r={r:+.3f}  {sign} {bar}")

# ============================================================
# 8. Сохранение
# ============================================================
print("\n" + "=" * 60)
print("СОХРАНЕНИЕ")
print("=" * 60)

# Таргеты
y = df[['SEQN'] + TARGETS].copy()
y.to_csv(os.path.join(OUT, "y.csv"), index=False)
print(f"  y.csv:              {y.shape}")

# КДЛ-минимум
X_kdl = df[['SEQN'] + FEATURES_KDL].copy()
X_kdl.to_csv(os.path.join(OUT, "X_kdl.csv"), index=False)
print(f"  X_kdl.csv:          {X_kdl.shape}  ({len(FEATURES_KDL)} фич)")

# 29н-минимум
X_29n = df[['SEQN'] + FEATURES_29N].copy()
X_29n.to_csv(os.path.join(OUT, "X_29n.csv"), index=False)
print(f"  X_29n.csv:          {X_29n.shape}  ({len(FEATURES_29N)} фич)")

# Расширенный
X_ext = df[['SEQN'] + FEATURES_EXT].copy()
X_ext.to_csv(os.path.join(OUT, "X_ext.csv"), index=False)
print(f"  X_ext.csv:          {X_ext.shape}  ({len(FEATURES_EXT)} фич)")

# CRP для валидации
crp_val = df[['SEQN', 'LBXHSCRP']].copy() if 'LBXHSCRP' in df.columns else pd.DataFrame()
if len(crp_val):
    crp_val.to_csv(os.path.join(OUT, "crp_validation.csv"), index=False)
    print(f"  crp_validation.csv: {crp_val.shape}")

# Метаданные
meta = df[['SEQN', 'CYCLE', 'RIAGENDR', 'RIDAGEYR']].copy()
meta.to_csv(os.path.join(OUT, "meta.csv"), index=False)
print(f"  meta.csv:           {meta.shape}")

# Списки фич (для воспроизводимости)
with open(os.path.join(OUT, "features_kdl.txt"), 'w') as f:
    f.write('\n'.join(FEATURES_KDL))
with open(os.path.join(OUT, "features_29n.txt"), 'w') as f:
    f.write('\n'.join(FEATURES_29N))
with open(os.path.join(OUT, "features_ext.txt"), 'w') as f:
    f.write('\n'.join(FEATURES_EXT))
print(f"  features_kdl.txt:   {len(FEATURES_KDL)} фич")
print(f"  features_29n.txt:   {len(FEATURES_29N)} фич")
print(f"  features_ext.txt:   {len(FEATURES_EXT)} фич")

print(f"\nВсё сохранено в: {OUT}")
print("Готово. Можно обучать модель.")
