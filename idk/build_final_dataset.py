"""
ФИНАЛЬНАЯ СБОРКА: 3 цикла NHANES (2015-16, 2017-20, 2021-23)
-> nhanes_final.csv с Body Iron, таргетами, фичами
"""
import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "Data")

# ============================================================
# Конфиг: маппинг файлов и столбцов по циклам
# ============================================================
# 2017-2018 входит в 2017-2020 (P_* файлы), не дублируем.
CYCLES = {
    '2015-2016': {
        'dir': os.path.join(DATA, 'NHANES 2015-2016'),
        'files': {
            'cbc': 'CBC_I.xpt',
            'biopro': 'BIOPRO_I.xpt',
            'demo': 'DEMO_I.xpt',
            'fertin': 'FERTIN_I.xpt',
            'tfr': 'TFR_I.xpt',
            'bmx': 'BMX_I.xpt',
            'bp': 'BPX_I.xpt',
            'crp': 'HSCRP_I.xpt',
            'smq': 'SMQ_I.xpt',
            'alq': 'ALQ_I.xpt',
            'ocq': 'OCQ_I.xpt',
            'paq': 'PAQ_I.xpt',
        }
    },
    '2017-2020': {
        'dir': os.path.join(DATA, 'NHANES 2017-2020'),
        'files': {
            'cbc': 'P_CBC.xpt',
            'biopro': 'P_BIOPRO.xpt',
            'demo': 'P_DEMO.xpt',
            'fertin': 'P_FERTIN.xpt',
            'tfr': 'P_TFR.xpt',
            'bmx': 'P_BMX.xpt',
            'bp': 'P_BPXO.xpt',
            'crp': 'P_HSCRP.xpt',
            'smq': 'P_SMQ.xpt',
            'alq': 'P_ALQ.xpt',
            'ocq': 'P_OCQ.xpt',
            'paq': 'P_PAQ.xpt',
        }
    },
    '2021-2023': {
        'dir': os.path.join(DATA, 'NHANES 2021-2023'),
        'files': {
            'cbc': 'CBC_L.xpt',
            'biopro': 'BIOPRO_L.xpt',
            'demo': 'DEMO_L.xpt',
            'fertin': 'FERTIN_L.xpt',
            'tfr': 'TFR_L.xpt',
            'bmx': 'BMX_L.xpt',
            'bp': 'BPXO_L (1).xpt',
            'crp': 'HSCRP_L.xpt',
            'smq': 'SMQ_L.xpt',
            'alq': 'ALQ_L.xpt',
            'ocq': 'OCQ_L.xpt',
            'paq': 'PAQ_L.xpt',
        }
    },
}

# Единые имена столбцов (маппим из разных циклов)
# CBC: одинаковые имена во всех циклах
CBC_COLS = [
    'LBXWBCSI', 'LBXLYPCT', 'LBXMOPCT', 'LBXNEPCT', 'LBXEOPCT', 'LBXBAPCT',
    'LBXRBCSI', 'LBXHGB', 'LBXHCT', 'LBXMCVSI', 'LBXMC', 'LBXMCHSI',
    'LBXRDW', 'LBXPLTSI', 'LBXMPSI',
]
BIOPRO_COLS = [
    'LBXSGL',   # glucose
    'LBXSCH',   # cholesterol
    'LBXSAL',   # albumin
    'LBXSTP',   # total protein
    'LBXSATSI', # ALT
    'LBXSASSI', # AST
    'LBXSTB',   # bilirubin
    'LBXSLDSI', # LDH
    'LBXSCR',   # creatinine
    'LBXSUA',   # uric acid
    'LBXSIR',   # serum iron (not a feature, but useful for validation)
]
DEMO_COLS = ['RIAGENDR', 'RIDAGEYR', 'RIDRETH3', 'RIDEXPRG']  # добавлен RIDEXPRG для валидации
BMX_COLS = ['BMXBMI', 'BMXHT', 'BMXWT', 'BMXWAIST']
# BP columns differ between cycles; we'll standardize
CRP_COL = 'LBXHSCRP'


def load(directory, filename):
    p = os.path.join(directory, filename)
    if not os.path.isfile(p):
        return None
    return pd.read_sas(p, format='xport')


def find_col(df, patterns):
    """Find first column matching any pattern."""
    for p in patterns:
        for c in df.columns:
            if p.upper() in c.upper():
                return c
    return None


def extract_bp(df):
    """Extract systolic/diastolic BP. Column names vary by cycle."""
    sys_col = find_col(df, ['BPXOSY1', 'BPXSY1'])
    dia_col = find_col(df, ['BPXODI1', 'BPXDI1'])
    cols = ['SEQN']
    renames = {}
    if sys_col:
        cols.append(sys_col)
        renames[sys_col] = 'BP_SYS'
    if dia_col:
        cols.append(dia_col)
        renames[dia_col] = 'BP_DIA'
    return df[cols].rename(columns=renames)


def process_cycle(name, cfg):
    """Load and merge one NHANES cycle into a standardized DataFrame."""
    d = cfg['dir']
    f = cfg['files']
    
    print(f"\n  [{name}] Loading...")
    
    cbc = load(d, f['cbc'])
    biopro = load(d, f['biopro'])
    demo = load(d, f['demo'])
    fertin = load(d, f['fertin'])
    tfr = load(d, f['tfr'])
    bmx = load(d, f.get('bmx', ''))
    bp = load(d, f.get('bp', ''))
    crp = load(d, f.get('crp', ''))
    smq = load(d, f.get('smq', ''))
    alq = load(d, f.get('alq', ''))
    ocq = load(d, f.get('ocq', ''))
    
    if cbc is None or fertin is None or tfr is None or demo is None:
        print(f"    SKIP: missing core files")
        return None
    
    # --- Ferritin ---
    fer_col = find_col(fertin, ['LBXFER'])
    fertin_sub = fertin[['SEQN', fer_col]].rename(columns={fer_col: 'LBXFER'})
    
    # --- TFR ---
    tfr_c = find_col(tfr, ['LBXTFR'])
    tfr_sub = tfr[['SEQN', tfr_c]].rename(columns={tfr_c: 'LBXTFR'})
    
    # --- CBC: take only standard cols ---
    cbc_avail = ['SEQN'] + [c for c in CBC_COLS if c in cbc.columns]
    
    # --- BIOPRO: take only standard cols ---
    bio_avail = ['SEQN'] + [c for c in BIOPRO_COLS if c in biopro.columns]
    
    # --- DEMO ---
    demo_avail = ['SEQN'] + [c for c in DEMO_COLS if c in demo.columns]
    
    # --- Merge core ---
    df = cbc[cbc_avail].merge(biopro[bio_avail], on='SEQN', how='inner')
    df = df.merge(demo[demo_avail], on='SEQN', how='inner')
    df = df.merge(fertin_sub, on='SEQN', how='inner')
    df = df.merge(tfr_sub, on='SEQN', how='inner')
    print(f"    Core (CBC+BIO+DEMO+FER+TFR): {len(df)}")
    
    # --- BMX ---
    if bmx is not None:
        bmx_avail = ['SEQN'] + [c for c in BMX_COLS if c in bmx.columns]
        df = df.merge(bmx[bmx_avail], on='SEQN', how='left')
    
    # --- BP ---
    if bp is not None:
        bp_df = extract_bp(bp)
        df = df.merge(bp_df, on='SEQN', how='left')
    
    # --- CRP ---
    if crp is not None:
        crp_c = find_col(crp, ['LBXHSCRP', 'LBXCRP'])
        if crp_c:
            df = df.merge(crp[['SEQN', crp_c]].rename(columns={crp_c: 'LBXHSCRP'}), on='SEQN', how='left')
    
    # --- Smoking ---
    if smq is not None:
        smq_avail = ['SEQN']
        for c in ['SMQ020', 'SMQ040']:
            if c in smq.columns:
                smq_avail.append(c)
        if len(smq_avail) > 1:
            df = df.merge(smq[smq_avail], on='SEQN', how='left')
    
    # --- Alcohol ---
    if alq is not None:
        alq_avail = ['SEQN']
        for c in ['ALQ121', 'ALQ130']:
            if c in alq.columns:
                alq_avail.append(c)
        if len(alq_avail) > 1:
            df = df.merge(alq[alq_avail], on='SEQN', how='left')
    
    # --- Occupation ---
    if ocq is not None:
        ocq_avail = ['SEQN']
        for c in ['OCD150', 'OCQ180']:
            if c in ocq.columns:
                ocq_avail.append(c)
        if len(ocq_avail) > 1:
            df = df.merge(ocq[ocq_avail], on='SEQN', how='left')
    
    # Add cycle label
    df['CYCLE'] = name
    
    print(f"    Final: {len(df)} rows, {len(df.columns)} cols")
    return df


# ============================================================
# 1. Обработка каждого цикла
# ============================================================
print("=" * 70)
print("СБОРКА ФИНАЛЬНОГО ДАТАСЕТА")
print("=" * 70)

dfs = []
for name, cfg in CYCLES.items():
    result = process_cycle(name, cfg)
    if result is not None:
        dfs.append(result)

# ============================================================
# 2. Объединение
# ============================================================
print("\n" + "=" * 70)
print("ОБЪЕДИНЕНИЕ")
print("=" * 70)

df = pd.concat(dfs, ignore_index=True)
print(f"  Всего: {len(df)} строк, {len(df.columns)} столбцов")

# Проверка дубликатов SEQN
dups = df['SEQN'].duplicated().sum()
print(f"  Дубликаты SEQN: {dups}")
if dups > 0:
    df = df.drop_duplicates(subset='SEQN', keep='first')
    print(f"  После удаления: {len(df)}")

# ============================================================
# 3. Body Iron (формула Cook)
# ============================================================
print("\n" + "=" * 70)
print("BODY IRON")
print("=" * 70)

mask = (df['LBXFER'] > 0) & (df['LBXTFR'] > 0) & df['LBXFER'].notna() & df['LBXTFR'].notna()

# sTfR in mg/L -> *1000 for ug/L. Ferritin already in ng/mL = ug/L
stfr_ug = df.loc[mask, 'LBXTFR'] * 1000
fer_ug = df.loc[mask, 'LBXFER']

df['BODY_IRON'] = np.nan
df.loc[mask, 'BODY_IRON'] = -(np.log10(stfr_ug / fer_ug) - 2.8229) / 0.1207

# Targets
df['Y_IRON_DEFICIENCY'] = np.nan
df.loc[mask, 'Y_IRON_DEFICIENCY'] = (df.loc[mask, 'BODY_IRON'] < 0).astype(float)

df['Y_IDA'] = np.nan
hgb_thresh = np.where(df.loc[mask, 'RIAGENDR'] == 2, 12.0, 13.0)
df.loc[mask, 'Y_IDA'] = ((df.loc[mask, 'BODY_IRON'] < 0) & (df.loc[mask, 'LBXHGB'] < hgb_thresh)).astype(float)

valid = df[df['BODY_IRON'].notna()]
n_id = int((valid['Y_IRON_DEFICIENCY'] == 1).sum())
n_ida = int((valid['Y_IDA'] == 1).sum())

print(f"  Valid Body Iron: {len(valid)}")
print(f"  Body Iron: mean={valid['BODY_IRON'].mean():.2f}, median={valid['BODY_IRON'].median():.2f}")
print(f"  Range: [{valid['BODY_IRON'].min():.2f}, {valid['BODY_IRON'].max():.2f}]")
print(f"  Дефицит железа (BI<0): {n_id} ({n_id/len(valid)*100:.1f}%)")
print(f"  ЖДА (BI<0 + HGB low):  {n_ida} ({n_ida/len(valid)*100:.1f}%)")

print(f"\n  По полу:")
for sex, lab in [(1, 'Мужчины'), (2, 'Женщины')]:
    s = valid[valid['RIAGENDR'] == sex]
    if len(s):
        nid = int((s['Y_IRON_DEFICIENCY'] == 1).sum())
        nida = int((s['Y_IDA'] == 1).sum())
        print(f"    {lab}: {len(s):5d} | ID: {nid:4d} ({nid/len(s)*100:.1f}%) | IDA: {nida:3d} ({nida/len(s)*100:.1f}%)")

print(f"\n  По циклу:")
for cycle in df['CYCLE'].unique():
    s = valid[valid['CYCLE'] == cycle]
    if len(s):
        nid = int((s['Y_IRON_DEFICIENCY'] == 1).sum())
        print(f"    {cycle}: {len(s):5d} | ID: {nid:4d} ({nid/len(s)*100:.1f}%)")

# CRP coverage
if 'LBXHSCRP' in df.columns:
    crp_valid = valid['LBXHSCRP'].notna().sum()
    print(f"\n  CRP coverage: {crp_valid}/{len(valid)} ({crp_valid/len(valid)*100:.1f}%)")

# ============================================================
# 4. Обзор финальных столбцов
# ============================================================
print("\n" + "=" * 70)
print("ФИНАЛЬНЫЕ СТОЛБЦЫ")
print("=" * 70)

feature_groups = {
    'CBC (фичи модели)': CBC_COLS,
    'Биохимия': [c for c in BIOPRO_COLS if c != 'LBXSIR'],
    'Демография': DEMO_COLS,
    'Физические': BMX_COLS + ['BP_SYS', 'BP_DIA'],
    'Анкетные': ['SMQ020', 'SMQ040', 'ALQ121', 'ALQ130', 'OCD150', 'OCQ180'],
    'Валидация': ['LBXHSCRP', 'LBXSIR'],
    'Таргет/метки': ['BODY_IRON', 'Y_IRON_DEFICIENCY', 'Y_IDA', 'LBXFER', 'LBXTFR'],
    'Служебные': ['SEQN', 'CYCLE'],
}

for group, cols in feature_groups.items():
    present = [c for c in cols if c in df.columns]
    missing = [c for c in cols if c not in df.columns]
    print(f"\n  {group}:")
    for c in present:
        na = df[c].isna().sum()
        print(f"    {c:15s} | NaN: {na:5d} ({na/len(df)*100:5.1f}%)")
    if missing:
        print(f"    [missing: {missing}]")

# ============================================================
# 5. Сохранение
# ============================================================
out = os.path.join(BASE, "nhanes_final.csv")
df.to_csv(out, index=False)
print(f"\n{'=' * 70}")
print(f"СОХРАНЕНО: {out}")
print(f"  {len(df)} строк x {len(df.columns)} столбцов")
print(f"  Valid Body Iron: {len(valid)}")
print(f"  Готово к обучению модели.")
