"""
Проверка NHANES 2015-2016 + суммарный объём данных (2015-16 + 2017-20 + 2021-23)
sTfR в NHANES есть только в циклах с iron status — старее 2015 нет TFR.
"""
import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

BASE = os.path.dirname(os.path.abspath(__file__))
# Support both "Rats Marks/Data/NHANES..." and "Rats Marks/NHANES..."
DATA = os.path.join(BASE, "Data")
if not os.path.isdir(DATA):
    DATA = BASE

def load_xpt(path):
    return pd.read_sas(path, format='xport')

def build_core_bi(directory, fertin_file, tfr_file, demo_file, cbc_file, biopro_file):
    """Build core (CBC+BIOPRO+DEMO+FERTIN+TFR), compute Body Iron. Returns df, n_valid, n_id, n_ida."""
    def p(f):
        return os.path.join(directory, f)
    
    cbc    = load_xpt(p(cbc_file))
    biopro = load_xpt(p(biopro_file))
    demo   = load_xpt(p(demo_file))
    fertin = load_xpt(p(fertin_file))
    tfr    = load_xpt(p(tfr_file))
    
    # Avoid duplicate columns: take only SEQN + needed from biopro
    biopro_cols = ['SEQN'] + [c for c in biopro.columns if c not in cbc.columns and c != 'SEQN']
    if len(biopro_cols) <= 1:
        biopro_cols = ['SEQN'] + [c for c in biopro.columns if c != 'SEQN'][:20]
    
    fertin_fer = [c for c in fertin.columns if 'FER' in c.upper() and 'LBX' in c]
    tfr_tfr    = [c for c in tfr.columns if 'TFR' in c.upper() and 'LBX' in c]
    if not fertin_fer or not tfr_tfr:
        return None, 0, 0, 0
    fertin_sub = fertin[['SEQN', fertin_fer[0]]].rename(columns={fertin_fer[0]: 'LBXFER'})
    tfr_sub    = tfr[['SEQN', tfr_tfr[0]]].rename(columns={tfr_tfr[0]: 'LBXTFR'})
    
    df = cbc.merge(biopro[biopro_cols], on='SEQN', how='inner')
    df = df.merge(demo[['SEQN', 'RIAGENDR', 'RIDAGEYR']], on='SEQN', how='inner')
    df = df.merge(fertin_sub, on='SEQN', how='inner')
    df = df.merge(tfr_sub, on='SEQN', how='inner')
    
    mask = (df['LBXFER'] > 0) & (df['LBXTFR'] > 0) & df['LBXFER'].notna() & df['LBXTFR'].notna()
    stfr_ug = df.loc[mask, 'LBXTFR'] * 1000
    fer_ug  = df.loc[mask, 'LBXFER']
    df.loc[mask, 'BODY_IRON'] = -(np.log10(stfr_ug / fer_ug) - 2.8229) / 0.1207
    
    hgb_col = 'LBXHGB' if 'LBXHGB' in df.columns else None
    n_valid = int(mask.sum())
    n_id = int((df.loc[mask, 'BODY_IRON'] < 0).sum()) if n_valid else 0
    n_ida = 0
    if hgb_col and n_valid:
        df['Y_IRON_DEFICIENCY'] = (df['BODY_IRON'] < 0).astype(float) if 'BODY_IRON' in df.columns else np.nan
        thresh = np.where(df.loc[mask, 'RIAGENDR'] == 2, 12.0, 13.0)
        df.loc[mask, 'Y_IDA'] = ((df.loc[mask, 'BODY_IRON'] < 0) & (df.loc[mask, hgb_col].values < thresh)).astype(float)
        n_ida = int((df.loc[mask, 'Y_IDA'] == 1).sum())
    
    return df, n_valid, n_id, n_ida

print("=" * 70)
print("1. NHANES 2015-2016")
print("=" * 70)

n_valid_1516, n_id_1516, n_ida_1516 = 0, 0, 0
dir_1516 = os.path.join(DATA, "NHANES 2015-2016")
if not os.path.isdir(dir_1516):
    print("  NHANES 2015-2016 не найден: " + dir_1516)
else:
    try:
        df_1516, n_valid_1516, n_id_1516, n_ida_1516 = build_core_bi(
            dir_1516,
            "FERTIN_I.xpt", "TFR_I.xpt",
            "DEMO_I.xpt", "CBC_I.xpt", "BIOPRO_I.xpt"
        )
        if df_1516 is not None:
            print(f"  После мержа (CBC+BIOPRO+DEMO+FERTIN+TFR): {len(df_1516)} строк")
        print(f"  Валидный Body Iron:                        {n_valid_1516}")
        if n_valid_1516:
            print(f"  Дефицит железа (BI < 0):                   {n_id_1516} ({n_id_1516/n_valid_1516*100:.1f}%)")
            print(f"  ЖДА:                                        {n_ida_1516} ({n_ida_1516/n_valid_1516*100:.1f}%)")
            if df_1516 is not None and 'RIAGENDR' in df_1516.columns:
                v = df_1516[df_1516['BODY_IRON'].notna()]
                for sex, lab in [(1,'М'), (2,'Ж')]:
                    s = v[v['RIAGENDR']==sex]
                    if len(s): print(f"  По полу: {lab}: {len(s)}")
    except Exception as e:
        print(f"  Ошибка: {e}")
        import traceback
        traceback.print_exc()
        n_valid_1516, n_id_1516, n_ida_1516 = 0, 0, 0

print()
print("=" * 70)
print("2. ИТОГО: все циклы с sTfR (2015-16, 2017-20, 2021-23)")
print("=" * 70)

# 2017-2020 — уже считали: 2715 valid, 180 ID, 159 IDA
# 2021-2023 — 1688 valid, 103 ID, 96 IDA
n_1720, n_id_1720, n_ida_1720 = 2715, 180, 159
n_2123, n_id_2123, n_ida_2123 = 1688, 103, 96

total_valid = n_valid_1516 + n_1720 + n_2123
total_id    = n_id_1516 + n_id_1720 + n_id_2123
total_ida   = n_ida_1516 + n_ida_1720 + n_ida_2123

print(f"  2015-2016:  {n_valid_1516:5d} valid BI  |  ID: {n_id_1516:4d}  |  IDA: {n_ida_1516:4d}")
print(f"  2017-2020:  {n_1720:5d} valid BI  |  ID: {n_id_1720:4d}  |  IDA: {n_ida_1720:4d}")
print(f"  2021-2023:  {n_2123:5d} valid BI  |  ID: {n_id_2123:4d}  |  IDA: {n_ida_2123:4d}")
print(f"  " + "-" * 50)
print(f"  ИТОГО:      {total_valid:5d} valid BI  |  ID: {total_id:4d}  |  IDA: {total_ida:4d}")
print(f"  Доля ID:    {total_id/total_valid*100:.1f}%  |  Доля IDA: {total_ida/total_valid*100:.1f}%")
print()
print("  Хватает ли для модели:")
print(f"  - Положительный класс (ID):  {total_id}  -> {'OK (>=200)' if total_id >= 200 else 'мало'}")
print(f"  - Всего наблюдений:          {total_valid} -> {'OK (>=5k)' if total_valid >= 5000 else 'OK (>=3k)' if total_valid >= 3000 else 'мало'}")
print()
print("  sTfR в NHANES: есть только в циклах с iron status.")
print("  Старее 2015-2016 TFR не выкладывают (или нет в одном наборе) — докидывать нечего.")
print("  Источник: https://wwwn.cdc.gov/nchs/nhanes/Default.aspx (по циклам смотреть TFR/FERTIN).")
