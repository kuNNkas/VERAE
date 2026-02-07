"""
NHANES 2017-2020: Сборка основного датасета для модели
Ядро + физ. данные + анкеты + таргет Body Iron
"""
import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

pd.set_option('display.max_columns', None)
pd.set_option('display.width', 200)

DATA_DIR = os.path.join(os.path.dirname(__file__), "NHANES 2017-2020")
OUT_DIR = os.path.dirname(__file__)

def load(name):
    path = os.path.join(DATA_DIR, f"{name}.xpt")
    return pd.read_sas(path, format='xport')

# ============================================================
# 1. Загрузка
# ============================================================
print("=" * 80)
print("1. ЗАГРУЗКА")
print("=" * 80)

cbc    = load('P_CBC');    print(f"  CBC:    {len(cbc):6d} rows")
biopro = load('P_BIOPRO'); print(f"  BIOPRO: {len(biopro):6d} rows")
demo   = load('P_DEMO');   print(f"  DEMO:   {len(demo):6d} rows")
fertin = load('P_FERTIN'); print(f"  FERTIN: {len(fertin):6d} rows")
tfr    = load('P_TFR');    print(f"  TFR:    {len(tfr):6d} rows")
bmx    = load('P_BMX');    print(f"  BMX:    {len(bmx):6d} rows")
bpxo   = load('P_BPXO');   print(f"  BPXO:   {len(bpxo):6d} rows")
hscrp  = load('P_HSCRP');  print(f"  HSCRP:  {len(hscrp):6d} rows")
smq    = load('P_SMQ');    print(f"  SMQ:    {len(smq):6d} rows")
alq    = load('P_ALQ');    print(f"  ALQ:    {len(alq):6d} rows")
ocq    = load('P_OCQ');    print(f"  OCQ:    {len(ocq):6d} rows")
paq    = load('P_PAQ');    print(f"  PAQ:    {len(paq):6d} rows")

print(f"\n  TFR столбцы: {list(tfr.columns)}")

# Проверка TFR: сколько людей, по полу
tfr_demo = tfr.merge(demo[['SEQN', 'RIAGENDR', 'RIDAGEYR']], on='SEQN', how='left')
tfr_col = [c for c in tfr.columns if 'TFR' in c.upper() and 'SEQN' not in c][0]
has_tfr = tfr_demo[tfr_demo[tfr_col].notna()]
print(f"  TFR: {len(has_tfr)} людей с данными")
for sex, label in [(1, 'Муж'), (2, 'Жен')]:
    n = (has_tfr['RIAGENDR'] == sex).sum()
    print(f"    {label}: {n}")

# ============================================================
# 2. Мерж ядра
# ============================================================
print("\n" + "=" * 80)
print("2. МЕРЖ ЯДРА")
print("=" * 80)

# CBC — база
df = cbc.copy()
print(f"  CBC (base):  {len(df):6d}")

# BIOPRO — убираем дубли (LBDSATLC может конфликтовать)
biopro_cols = [c for c in biopro.columns if c not in df.columns or c == 'SEQN']
df = df.merge(biopro[biopro_cols], on='SEQN', how='inner')
print(f"  + BIOPRO:    {len(df):6d}")

# DEMO — убираем дубли
demo_cols = [c for c in demo.columns if c not in df.columns or c == 'SEQN']
df = df.merge(demo[demo_cols], on='SEQN', how='inner')
print(f"  + DEMO:      {len(df):6d}")

# FERTIN — только нужное
df = df.merge(fertin[['SEQN', 'LBXFER', 'LBDFERSI']], on='SEQN', how='inner')
print(f"  + FERTIN:    {len(df):6d}")

# TFR — только нужное
tfr_needed = ['SEQN'] + [c for c in tfr.columns if 'TFR' in c.upper()]
df = df.merge(tfr[tfr_needed], on='SEQN', how='inner')
print(f"  + TFR:       {len(df):6d}")

# ============================================================
# 3. Физические данные
# ============================================================
print("\n" + "=" * 80)
print("3. ФИЗИЧЕСКИЕ ДАННЫЕ")
print("=" * 80)

# BMX: ИМТ, рост, вес, талия
bmx_cols = ['SEQN', 'BMXBMI', 'BMXHT', 'BMXWT', 'BMXWAIST']
bmx_cols = [c for c in bmx_cols if c in bmx.columns]
df = df.merge(bmx[bmx_cols], on='SEQN', how='left')
print(f"  + BMX:       {len(df):6d} | BMI NaN: {df['BMXBMI'].isna().sum()}")

# BPXO: АД
bp_cols = ['SEQN', 'BPXOSY1', 'BPXODI1', 'BPXOSY2', 'BPXODI2', 'BPXOSY3', 'BPXODI3']
bp_cols = [c for c in bp_cols if c in bpxo.columns]
df = df.merge(bpxo[bp_cols], on='SEQN', how='left')
print(f"  + BPXO:      {len(df):6d} | SYS1 NaN: {df['BPXOSY1'].isna().sum()}")

# HSCRP: CRP
crp_cols = ['SEQN', 'LBXHSCRP']
df = df.merge(hscrp[crp_cols], on='SEQN', how='left')
print(f"  + HSCRP:     {len(df):6d} | CRP NaN: {df['LBXHSCRP'].isna().sum()}")

# ============================================================
# 4. Анкетные данные
# ============================================================
print("\n" + "=" * 80)
print("4. АНКЕТНЫЕ ДАННЫЕ")
print("=" * 80)

# Курение
smq_cols = ['SEQN', 'SMQ020', 'SMQ040']
smq_cols = [c for c in smq_cols if c in smq.columns]
df = df.merge(smq[smq_cols], on='SEQN', how='left')
print(f"  + SMQ:       {len(df):6d} | SMQ020 NaN: {df['SMQ020'].isna().sum()}")

# Алкоголь
alq_cols = ['SEQN', 'ALQ121', 'ALQ130']
alq_cols = [c for c in alq_cols if c in alq.columns]
df = df.merge(alq[alq_cols], on='SEQN', how='left')
print(f"  + ALQ:       {len(df):6d} | ALQ121 NaN: {df['ALQ121'].isna().sum()}")

# Занятость
ocq_cols = ['SEQN', 'OCD150', 'OCQ180']
ocq_cols = [c for c in ocq_cols if c in ocq.columns]
df = df.merge(ocq[ocq_cols], on='SEQN', how='left')
print(f"  + OCQ:       {len(df):6d} | OCD150 NaN: {df['OCD150'].isna().sum()}")

# Физ. активность — столбцы могут отличаться от 2021-2023
paq_target = ['SEQN', 'PAQ605', 'PAQ650', 'PAD680', 'PAQ610', 'PAQ655',
              'PAD790Q', 'PAD800', 'PAD810Q', 'PAD820']
paq_cols = [c for c in paq_target if c in paq.columns]
if len(paq_cols) > 1:
    df = df.merge(paq[paq_cols], on='SEQN', how='left')
    print(f"  + PAQ:       {len(df):6d} | cols: {[c for c in paq_cols if c != 'SEQN']}")
else:
    print(f"  - PAQ: столбцы не найдены. Есть: {list(paq.columns)[:10]}")
    # Берём что есть
    df = df.merge(paq, on='SEQN', how='left')
    print(f"  + PAQ (все): {len(df):6d}")

# ============================================================
# 5. ТАРГЕТ: Body Iron (формула Cook)
# ============================================================
print("\n" + "=" * 80)
print("5. ТАРГЕТ: Body Iron")
print("=" * 80)

# Находим столбцы
fer_col = 'LBXFER'
tfr_col_name = [c for c in df.columns if 'LBXTFR' in c.upper()][0] if any('LBXTFR' in c.upper() for c in df.columns) else None
hgb_col = 'LBXHGB'

print(f"  Ferritin col: {fer_col}")
print(f"  TFR col:      {tfr_col_name}")
print(f"  HGB col:      {hgb_col}")

if tfr_col_name is None:
    # Попробуем найти любой TFR
    tfr_candidates = [c for c in df.columns if 'TFR' in c.upper() and c != 'SEQN']
    print(f"  TFR кандидаты: {tfr_candidates}")
    if tfr_candidates:
        tfr_col_name = tfr_candidates[0]
        print(f"  Используем: {tfr_col_name}")

if tfr_col_name:
    mask = (df[fer_col] > 0) & (df[tfr_col_name] > 0) & df[fer_col].notna() & df[tfr_col_name].notna()
    print(f"\n  Строк с валидными ферритин + sTfR: {mask.sum()}")
    
    # Проверяем единицы TFR
    tfr_vals = df.loc[mask, tfr_col_name]
    print(f"  sTfR range: {tfr_vals.min():.2f} - {tfr_vals.max():.2f}")
    
    # Если sTfR в mg/L (типичные значения 2-8), надо * 1000 для формулы Cook
    # Если sTfR уже в ug/L (типичные значения 2000-8000), не надо
    median_tfr = tfr_vals.median()
    if median_tfr < 50:  # в mg/L
        print(f"  sTfR median={median_tfr:.2f} -> в mg/L, конвертируем *1000")
        stfr_ug = df.loc[mask, tfr_col_name] * 1000
    else:  # уже в ug/L
        print(f"  sTfR median={median_tfr:.2f} -> уже в ug/L")
        stfr_ug = df.loc[mask, tfr_col_name]
    
    fer_ug = df.loc[mask, fer_col]  # ng/mL = ug/L
    
    # Body Iron (mg/kg) = -(log10(sTfR_ug / ferritin_ug) - 2.8229) / 0.1207
    df.loc[mask, 'BODY_IRON'] = -(np.log10(stfr_ug / fer_ug) - 2.8229) / 0.1207
    
    # Y: дефицит железа
    df['Y_IRON_DEFICIENCY'] = np.nan
    df.loc[mask, 'Y_IRON_DEFICIENCY'] = (df.loc[mask, 'BODY_IRON'] < 0).astype(float)
    
    # Y: ЖДА (дефицит + низкий гемоглобин)
    df['Y_IDA'] = np.nan
    hgb_threshold = np.where(df.loc[mask, 'RIAGENDR'] == 2, 12.0, 13.0)
    df.loc[mask, 'Y_IDA'] = ((df.loc[mask, 'BODY_IRON'] < 0) & (df.loc[mask, hgb_col] < hgb_threshold)).astype(float)
    
    # Статистика
    valid = df[df['BODY_IRON'].notna()]
    print(f"\n  Body Iron ({len(valid)} валидных):")
    print(f"    Mean:   {valid['BODY_IRON'].mean():.2f} mg/kg")
    print(f"    Median: {valid['BODY_IRON'].median():.2f} mg/kg")
    print(f"    Min:    {valid['BODY_IRON'].min():.2f} mg/kg")
    print(f"    Max:    {valid['BODY_IRON'].max():.2f} mg/kg")
    print(f"    Std:    {valid['BODY_IRON'].std():.2f} mg/kg")
    
    n_id = (valid['Y_IRON_DEFICIENCY'] == 1).sum()
    n_ida = (valid['Y_IDA'] == 1).sum()
    print(f"\n  Дефицит железа (BI < 0):  {n_id:5d} ({n_id/len(valid)*100:.1f}%)")
    print(f"  ЖДА (дефицит + HGB low): {n_ida:5d} ({n_ida/len(valid)*100:.1f}%)")
    
    print(f"\n  По полу:")
    for sex, label in [(1, 'Мужчины'), (2, 'Женщины')]:
        sub = valid[valid['RIAGENDR'] == sex]
        if len(sub) > 0:
            nid = (sub['Y_IRON_DEFICIENCY'] == 1).sum()
            nida = (sub['Y_IDA'] == 1).sum()
            print(f"    {label}: {len(sub):5d} чел | дефицит: {nid:4d} ({nid/len(sub)*100:.1f}%) | ЖДА: {nida:3d} ({nida/len(sub)*100:.1f}%)")
    
    print(f"\n  По возрасту (дефицит железа):")
    age_bins = [(1, 5), (6, 11), (12, 17), (18, 39), (40, 59), (60, 80)]
    for lo, hi in age_bins:
        sub = valid[(valid['RIDAGEYR'] >= lo) & (valid['RIDAGEYR'] <= hi)]
        if len(sub) > 0:
            nid = (sub['Y_IRON_DEFICIENCY'] == 1).sum()
            print(f"    {lo:2d}-{hi:2d}: {len(sub):5d} чел | дефицит: {nid:4d} ({nid/len(sub)*100:.1f}%)")
    
    # CRP vs Body Iron
    if 'LBXHSCRP' in df.columns:
        crp_valid = valid[valid['LBXHSCRP'].notna()]
        if len(crp_valid) > 0:
            crp_high = crp_valid[crp_valid['LBXHSCRP'] > 5]  # воспаление
            crp_low = crp_valid[crp_valid['LBXHSCRP'] <= 5]
            print(f"\n  CRP vs дефицит железа:")
            print(f"    CRP <= 5 (норма):      {len(crp_low):5d} чел | дефицит: {(crp_low['Y_IRON_DEFICIENCY']==1).sum():4d} ({(crp_low['Y_IRON_DEFICIENCY']==1).sum()/len(crp_low)*100:.1f}%)")
            print(f"    CRP > 5 (воспаление):  {len(crp_high):5d} чел | дефицит: {(crp_high['Y_IRON_DEFICIENCY']==1).sum():4d} ({(crp_high['Y_IRON_DEFICIENCY']==1).sum()/len(crp_high)*100:.1f}%)")

# ============================================================
# 6. Итоговый датасет — что вошло
# ============================================================
print("\n" + "=" * 80)
print("6. ИТОГОВЫЙ ДАТАСЕТ")
print("=" * 80)
print(f"  Строк:    {len(df)}")
print(f"  Столбцов: {len(df.columns)}")
print(f"  Valid BI:  {df['BODY_IRON'].notna().sum()}")

# Перечислим ключевые группы столбцов
cbc_features = ['LBXWBCSI','LBXLYPCT','LBXMOPCT','LBXNEPCT','LBXEOPCT','LBXBAPCT',
                'LBXRBCSI','LBXHGB','LBXHCT','LBXMCVSI','LBXMC','LBXMCHSI',
                'LBXRDW','LBXPLTSI','LBXMPSI']
bio_features = ['LBXSGL','LBXSCH','LBXSAL','LBXSTP','LBXSATSI','LBXSASSI',
                'LBXSTB','LBXSLDSI','LBXSCR','LBXSUA']
demo_features = ['RIAGENDR','RIDAGEYR','RIDRETH3']
phys_features = ['BMXBMI','BMXWAIST','BPXOSY1','BPXODI1']
quest_features = ['SMQ020','SMQ040','ALQ121','ALQ130','OCD150','OCQ180']
target_cols = ['BODY_IRON','Y_IRON_DEFICIENCY','Y_IDA']
validation_cols = ['LBXHSCRP','LBXFER',tfr_col_name if tfr_col_name else 'LBXTFR']

print(f"\n  Фичи модели (Уровень A - 29н минимум):")
for c in cbc_features + ['LBXSGL','LBXSCH'] + demo_features[:2] + ['BMXBMI','BPXOSY1']:
    if c in df.columns:
        na = df[c].isna().sum()
        print(f"    {c:15s}: NaN {na:5d} ({na/len(df)*100:.1f}%)")

print(f"\n  Фичи модели (Уровень B - расширенный):")
for c in bio_features + phys_features + quest_features:
    if c in df.columns:
        na = df[c].isna().sum()
        print(f"    {c:15s}: NaN {na:5d} ({na/len(df)*100:.1f}%)")

print(f"\n  Таргеты:")
for c in target_cols:
    if c in df.columns:
        na = df[c].isna().sum()
        print(f"    {c:25s}: NaN {na:5d} | valid: {len(df)-na}")

# ============================================================
# 7. Сохранение
# ============================================================
out_path = os.path.join(OUT_DIR, "nhanes_2017_2020_merged.csv")
df.to_csv(out_path, index=False)
print(f"\nСохранено: {out_path}")
print(f"  {len(df)} строк x {len(df.columns)} столбцов")
print("\nГотово!")
