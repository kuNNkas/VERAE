"""Quick check: all 3 cycles, key files, row counts, TFR availability"""
import pandas as pd, numpy as np, os
import warnings; warnings.filterwarnings('ignore')

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "Data")

cycles = {
    '2015-2016': {
        'dir': os.path.join(DATA, 'NHANES 2015-2016'),
        'cbc': 'CBC_I.xpt', 'biopro': 'BIOPRO_I.xpt', 'demo': 'DEMO_I.xpt',
        'fertin': 'FERTIN_I.xpt', 'tfr': 'TFR_I.xpt',
        'bmx': 'BMX_I.xpt', 'bp': 'BPX_I.xpt', 'crp': 'HSCRP_I.xpt',
    },
    '2017-2020': {
        'dir': os.path.join(DATA, 'NHANES 2017-2020'),
        'cbc': 'P_CBC.xpt', 'biopro': 'P_BIOPRO.xpt', 'demo': 'P_DEMO.xpt',
        'fertin': 'P_FERTIN.xpt', 'tfr': 'P_TFR.xpt',
        'bmx': 'P_BMX.xpt', 'bp': 'P_BPXO.xpt', 'crp': 'P_HSCRP.xpt',
    },
    '2021-2023': {
        'dir': os.path.join(DATA, 'NHANES 2021-2023'),
        'cbc': 'CBC_L.xpt', 'biopro': 'BIOPRO_L.xpt', 'demo': 'DEMO_L.xpt',
        'fertin': 'FERTIN_L.xpt', 'tfr': 'TFR_L.xpt',
        'bmx': 'BMX_L.xpt', 'bp': 'BPXO_L (1).xpt', 'crp': None,
    },
}

def lx(d, f):
    if f is None: return None
    p = os.path.join(d, f)
    if not os.path.isfile(p): return None
    return pd.read_sas(p, format='xport')

results = []

for name, c in cycles.items():
    print(f"--- {name} ---")
    d = c['dir']
    if not os.path.isdir(d):
        print(f"  DIR NOT FOUND: {d}")
        continue

    cbc = lx(d, c['cbc'])
    demo = lx(d, c['demo'])
    fertin = lx(d, c['fertin'])
    tfr = lx(d, c['tfr'])
    bmx = lx(d, c['bmx'])
    crp = lx(d, c['crp'])

    n_cbc = len(cbc) if cbc is not None else 0
    n_fer = len(fertin) if fertin is not None else 0
    n_tfr = len(tfr) if tfr is not None else 0
    n_bmx = len(bmx) if bmx is not None else 0
    n_crp = len(crp) if crp is not None else 0

    # TFR: find column, count valid, check sex
    tfr_valid = 0; tfr_m = 0; tfr_f = 0
    if tfr is not None and demo is not None:
        tc = [x for x in tfr.columns if 'TFR' in x.upper() and 'LBX' in x]
        if tc:
            td = tfr.merge(demo[['SEQN','RIAGENDR','RIDAGEYR']], on='SEQN', how='left')
            has = td[td[tc[0]].notna()]
            tfr_valid = len(has)
            tfr_m = int((has['RIAGENDR']==1).sum())
            tfr_f = int((has['RIAGENDR']==2).sum())

    # FERTIN: count valid, check sex
    fer_valid = 0; fer_m = 0; fer_f = 0
    if fertin is not None and demo is not None:
        fc = [x for x in fertin.columns if 'FER' in x.upper() and 'LBX' in x]
        if fc:
            fd = fertin.merge(demo[['SEQN','RIAGENDR']], on='SEQN', how='left')
            has = fd[fd[fc[0]].notna()]
            fer_valid = len(has)
            fer_m = int((has['RIAGENDR']==1).sum())
            fer_f = int((has['RIAGENDR']==2).sum())

    # Inner join size (core)
    core_n = 0
    if cbc is not None and fertin is not None and tfr is not None:
        fc = [x for x in fertin.columns if 'FER' in x.upper() and 'LBX' in x]
        tc = [x for x in tfr.columns if 'TFR' in x.upper() and 'LBX' in x]
        if fc and tc:
            tmp = cbc[['SEQN']].merge(fertin[['SEQN',fc[0]]], on='SEQN', how='inner')
            tmp = tmp.merge(tfr[['SEQN',tc[0]]], on='SEQN', how='inner')
            tmp = tmp[(tmp[fc[0]].notna()) & (tmp[tc[0]].notna()) & (tmp[fc[0]]>0) & (tmp[tc[0]]>0)]
            core_n = len(tmp)

    print(f"  CBC:     {n_cbc:6d}")
    print(f"  FERTIN:  {n_fer:6d}  (valid: {fer_valid}, M:{fer_m} F:{fer_f})")
    print(f"  TFR:     {n_tfr:6d}  (valid: {tfr_valid}, M:{tfr_m} F:{tfr_f})")
    print(f"  BMX:     {n_bmx:6d}")
    print(f"  CRP:     {n_crp:6d}")
    print(f"  Core (CBC+FER+TFR valid): {core_n}")
    results.append((name, core_n, tfr_m, tfr_f))

print()
print("=" * 50)
print("ИТОГО")
print("=" * 50)
total = sum(r[1] for r in results)
total_m = sum(r[2] for r in results)
total_f = sum(r[3] for r in results)
for name, n, m, f in results:
    print(f"  {name}: {n:5d} (TFR: M={m}, F={f})")
print(f"  {'TOTAL':10s}: {total:5d}")
print(f"  TFR total: M={total_m}, F={total_f}")
print()
if total >= 5000:
    print("  -> OK: 5k+ observations, enough for robust model")
elif total >= 3000:
    print("  -> OK: 3k+, sufficient for MVP")
else:
    print("  -> SMALL: consider adding cycles")
