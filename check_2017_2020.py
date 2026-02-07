"""
Быстрая проверка NHANES 2017-2020: что есть, размеры, демография
"""
import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

pd.set_option('display.max_columns', None)
pd.set_option('display.width', 200)

DATA_DIR = os.path.join(os.path.dirname(__file__), "NHANES 2017-2020")

print("=" * 80)
print("NHANES 2017-2020 (Pre-Pandemic): ОБЗОР")
print("=" * 80)

files = {}
for fname in sorted(os.listdir(DATA_DIR)):
    if fname.lower().endswith('.xpt'):
        fpath = os.path.join(DATA_DIR, fname)
        key = fname.replace('.xpt', '').strip()
        try:
            df = pd.read_sas(fpath, format='xport')
            files[key] = df
            print(f"  {fname:20s} -> {key:12s} | {len(df):6d} rows | {len(df.columns):3d} cols | {list(df.columns)[:8]}...")
        except Exception as e:
            print(f"  {fname:20s} -> ERROR: {e}")

# ============================================================
# Ключевой вопрос: FERTIN и TFR — кто там?
# ============================================================
print("\n" + "=" * 80)
print("ФЕРРИТИН (P_FERTIN)")
print("=" * 80)

if 'P_FERTIN' in files:
    fer = files['P_FERTIN']
    print(f"  Строк: {len(fer)}")
    print(f"  Столбцы: {list(fer.columns)}")
    fer_val = fer[fer.columns[fer.columns.str.contains('FER', case=False)]].dropna(how='all')
    print(f"  Строк с данными ферритина: {len(fer_val)}")
    
    # Мержим с DEMO чтобы посмотреть пол
    if 'P_DEMO' in files:
        demo = files['P_DEMO']
        fer_demo = fer.merge(demo[['SEQN', 'RIAGENDR', 'RIDAGEYR']], on='SEQN', how='left')
        
        # Фильтруем только тех, у кого есть ферритин
        fer_col = [c for c in fer.columns if 'FER' in c.upper() and 'SEQN' not in c and 'WT' not in c][0]
        has_fer = fer_demo[fer_demo[fer_col].notna()]
        
        print(f"\n  Людей с ферритином: {len(has_fer)}")
        print(f"  По полу:")
        for sex, label in [(1, 'Мужчины'), (2, 'Женщины')]:
            sub = has_fer[has_fer['RIAGENDR'] == sex]
            print(f"    {label}: {len(sub)} ({len(sub)/len(has_fer)*100:.1f}%)")
        
        print(f"  По возрасту:")
        print(f"    Min: {has_fer['RIDAGEYR'].min():.0f}")
        print(f"    Max: {has_fer['RIDAGEYR'].max():.0f}")
        print(f"    Mean: {has_fer['RIDAGEYR'].mean():.0f}")
        
        age_bins = [(1, 5), (6, 11), (12, 17), (18, 39), (40, 59), (60, 80)]
        print(f"  Распределение по возрастам:")
        for lo, hi in age_bins:
            n = ((has_fer['RIDAGEYR'] >= lo) & (has_fer['RIDAGEYR'] <= hi)).sum()
            print(f"    {lo}-{hi}: {n}")

# ============================================================
# P_FETIB — что это?
# ============================================================
print("\n" + "=" * 80)
print("P_FETIB (Iron / TIBC / Transferrin?)")
print("=" * 80)

if 'P_FETIB' in files:
    fetib = files['P_FETIB']
    print(f"  Строк: {len(fetib)}")
    print(f"  Столбцы: {list(fetib.columns)}")
    print(f"  Первые 3 строки:")
    print(fetib.head(3).to_string(index=False))
    
    # Есть ли тут TFR (transferrin receptor)?
    tfr_cols = [c for c in fetib.columns if 'TFR' in c.upper()]
    print(f"\n  Столбцы с TFR: {tfr_cols}")
    
    # Есть ли тут serum iron, TIBC?
    iron_cols = [c for c in fetib.columns if 'IR' in c.upper() or 'TIB' in c.upper() or 'SAT' in c.upper()]
    print(f"  Столбцы с Iron/TIBC/Sat: {iron_cols}")

# ============================================================
# Ищем TFR в ЛЮБОМ файле
# ============================================================
print("\n" + "=" * 80)
print("ПОИСК sTfR (Transferrin Receptor) ВО ВСЕХ ФАЙЛАХ")
print("=" * 80)

found_tfr = False
for key, df in files.items():
    tfr_cols = [c for c in df.columns if 'TFR' in c.upper()]
    if tfr_cols:
        print(f"  {key}: {tfr_cols}")
        found_tfr = True

if not found_tfr:
    print("  sTfR НЕ НАЙДЕН ни в одном файле!")
    print("  -> Нужно скачать P_TFR.xpt отдельно")

# ============================================================
# P_HSCRP — CRP!
# ============================================================
print("\n" + "=" * 80)
print("P_HSCRP (C-Reactive Protein)")
print("=" * 80)

if 'P_HSCRP' in files:
    crp = files['P_HSCRP']
    print(f"  Строк: {len(crp)}")
    print(f"  Столбцы: {list(crp.columns)}")
    crp_col = [c for c in crp.columns if 'CRP' in c.upper()][0] if any('CRP' in c.upper() for c in crp.columns) else None
    if crp_col:
        vals = crp[crp_col].dropna()
        print(f"  {crp_col}: {len(vals)} значений")
        print(f"    Mean: {vals.mean():.2f}, Median: {vals.median():.2f}, Max: {vals.max():.2f}")

# ============================================================
# CBC — размер
# ============================================================
print("\n" + "=" * 80)
print("P_CBC")
print("=" * 80)

if 'P_CBC' in files:
    cbc = files['P_CBC']
    print(f"  Строк: {len(cbc)}")
    print(f"  Столбцы: {list(cbc.columns)}")
    
    if 'P_DEMO' in files:
        cbc_demo = cbc.merge(files['P_DEMO'][['SEQN', 'RIAGENDR', 'RIDAGEYR']], on='SEQN', how='left')
        print(f"  По полу:")
        for sex, label in [(1, 'Муж'), (2, 'Жен')]:
            print(f"    {label}: {(cbc_demo['RIAGENDR'] == sex).sum()}")

# ============================================================
# DEMO — общий размер выборки
# ============================================================
print("\n" + "=" * 80)
print("P_DEMO (общая выборка)")
print("=" * 80)

if 'P_DEMO' in files:
    demo = files['P_DEMO']
    print(f"  Всего участников: {len(demo)}")
    print(f"  Столбцы: {list(demo.columns)}")
    for sex, label in [(1, 'Мужчины'), (2, 'Женщины')]:
        print(f"  {label}: {(demo['RIAGENDR'] == sex).sum()}")
    print(f"  Возраст: {demo['RIDAGEYR'].min():.0f} - {demo['RIDAGEYR'].max():.0f}")

# ============================================================
# ИТОГО: что есть, что не хватает
# ============================================================
print("\n" + "=" * 80)
print("ЧЕКЛИСТ: ЧТО ЕСТЬ / ЧТО НЕ ХВАТАЕТ")
print("=" * 80)

needed = {
    'P_CBC':    ('OAK (фичи)',           'CBC'),
    'P_BIOPRO': ('Биохимия (фичи)',      'BIOPRO'),
    'P_DEMO':   ('Демография (фичи)',    'DEMO'),
    'P_FERTIN': ('Ферритин (таргет)',    'FERTIN'),
    'P_BMX':    ('ИМТ (фичи)',           'BMX'),
    'P_BPXO':   ('АД (фичи)',            'BPXO'),
    'P_ALQ':    ('Алкоголь (анкета)',    'ALQ'),
    'P_SMQ':    ('Курение (анкета)',     'SMQ'),
    'P_DPQ':    ('Депрессия PHQ-9',      'DPQ - для этапа 2'),
    'P_HSQ':    ('Самооценка здоровья',  'HSQ - для этапа 2'),
    'P_MCQ':    ('Мед. условия',         'MCQ'),
    'P_DBQ':    ('Диета',                'DBQ - для этапа 2'),
    'P_HSCRP':  ('CRP (бонус!)',         'HSCRP'),
    'P_BPQ':    ('Анкета по АД',         'BPQ'),
    'P_FETIB':  ('Железо/TIBC',          'FETIB'),
}

# Нужны но могут отсутствовать
extra_needed = {
    'P_TFR':    ('sTfR (для Body Iron!)', 'КРИТИЧНО'),
    'P_OCQ':    ('Занятость',             'OCQ - полезно'),
    'P_PAQ':    ('Физ. активность',       'PAQ - полезно'),
    'P_RXQ_RX': ('Лекарства',            'RXQ - полезно'),
}

print("\n  ЕСТЬ:")
for key, (desc, note) in needed.items():
    status = 'OK' if key in files else 'НЕТ'
    rows = len(files[key]) if key in files else 0
    print(f"    [{status}] {key:12s} | {desc:25s} | {rows:6d} rows | {note}")

print("\n  НЕ ХВАТАЕТ (нужно скачать):")
for key, (desc, note) in extra_needed.items():
    status = 'OK' if key in files else 'СКАЧАТЬ'
    rows = len(files[key]) if key in files else 0
    mark = '  ' if key in files else '>>'
    print(f"  {mark}[{status}] {key:12s} | {desc:25s} | {note}")
