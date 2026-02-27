from __future__ import annotations

import os
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "Data")

CYCLES = {
    "2015-2016": {
        "dir": os.path.join(DATA, "NHANES 2015-2016"),
        "files": {
            "cbc": "CBC_I.xpt",
            "biopro": "BIOPRO_I.xpt",
            "demo": "DEMO_I.xpt",
            "fertin": "FERTIN_I.xpt",
            "bmx": "BMX_I.xpt",
            "bp": "BPX_I.xpt",
            "crp": "HSCRP_I.xpt",
            "smq": "SMQ_I.xpt",
            "alq": "ALQ_I.xpt",
            "ocq": "OCQ_I.xpt",
            "paq": "PAQ_I.xpt",
        },
    },
    "2017-2020": {
        "dir": os.path.join(DATA, "NHANES 2017-2020"),
        "files": {
            "cbc": "P_CBC.xpt",
            "biopro": "P_BIOPRO.xpt",
            "demo": "P_DEMO.xpt",
            "fertin": "P_FERTIN.xpt",
            "bmx": "P_BMX.xpt",
            "bp": "P_BPXO.xpt",
            "crp": "P_HSCRP.xpt",
            "smq": "P_SMQ.xpt",
            "alq": "P_ALQ.xpt",
            "ocq": "P_OCQ.xpt",
            "paq": "P_PAQ_I.xpt" if False else "P_PAQ.xpt",  # на всякий случай
        },
    },
    "2021-2023": {
        "dir": os.path.join(DATA, "NHANES 2021-2023"),
        "files": {
            "cbc": "CBC_L.xpt",
            "biopro": "BIOPRO_L.xpt",
            "demo": "DEMO_L.xpt",
            "fertin": "FERTIN_L.xpt",
            "bmx": "BMX_L.xpt",
            "bp": "BPXO_L (1).xpt",
            "crp": "HSCRP_L.xpt",
            "smq": "SMQ_L.xpt",
            "alq": "ALQ_L.xpt",
            "ocq": "OCQ_L.xpt",
            "paq": "PAQ_L.xpt",
        },
    },
}

CBC_COLS = [
    "LBXWBCSI","LBXLYPCT","LBXMOPCT","LBXNEPCT","LBXEOPCT","LBXBAPCT",
    "LBXRBCSI","LBXHGB","LBXHCT","LBXMCVSI","LBXMC","LBXMCHSI",
    "LBXRDW","LBXPLTSI","LBXMPSI",
]

BIOPRO_COLS = [
    "LBXSGL","LBXSCH","LBXSAL","LBXSTP","LBXSATSI","LBXSASSI",
    "LBXSTB","LBXSLDSI","LBXSCR","LBXSUA","LBXSIR"
]

DEMO_COLS = ["RIAGENDR", "RIDAGEYR", "RIDRETH3", "RIDEXPRG"]  # RIDEXPRG пусть остаётся
BMX_COLS = ["BMXBMI", "BMXHT", "BMXWT", "BMXWAIST"]
CRP_STD = "LBXHSCRP"


def load(directory: str, filename: str):
    p = os.path.join(directory, filename)
    if not filename or not os.path.isfile(p):
        return None
    return pd.read_sas(p, format="xport")


def find_col(df: pd.DataFrame, patterns: list[str]):
    for p in patterns:
        for c in df.columns:
            if p.upper() in c.upper():
                return c
    return None


def extract_bp(df: pd.DataFrame) -> pd.DataFrame:
    def _find(patterns):
        return find_col(df, patterns)

    sys_col = _find(["BPXOSY1", "BPXSY1"])
    dia_col = _find(["BPXODI1", "BPXDI1"])

    cols = ["SEQN"]
    renames = {}
    if sys_col:
        cols.append(sys_col); renames[sys_col] = "BP_SYS"
    if dia_col:
        cols.append(dia_col); renames[dia_col] = "BP_DIA"
    return df[cols].rename(columns=renames)


def process_cycle(name: str, cfg: dict) -> pd.DataFrame | None:
    d = cfg["dir"]
    f = cfg["files"]

    print(f"\n[{name}] Loading...")
    cbc = load(d, f.get("cbc", ""))
    biopro = load(d, f.get("biopro", ""))
    demo = load(d, f.get("demo", ""))
    fertin = load(d, f.get("fertin", ""))

    # optional
    bmx = load(d, f.get("bmx", ""))
    bp  = load(d, f.get("bp", ""))
    crp = load(d, f.get("crp", ""))
    smq = load(d, f.get("smq", ""))
    alq = load(d, f.get("alq", ""))
    ocq = load(d, f.get("ocq", ""))

    # core requirement: CBC + DEMO + FERRITIN (BIOPRO можно оставить core, если хочешь)
    if cbc is None or demo is None or fertin is None:
        print("  SKIP: missing core files (cbc/demo/ferritin)")
        return None

    # --- Ferritin ---
    fer_col = find_col(fertin, ["LBXFER"])
    if not fer_col:
        print("  SKIP: ferritin column not found")
        return None
    fertin_sub = fertin[["SEQN", fer_col]].rename(columns={fer_col: "LBXFER"})

    # --- CBC ---
    cbc_avail = ["SEQN"] + [c for c in CBC_COLS if c in cbc.columns]
    # --- DEMO ---
    demo_avail = ["SEQN"] + [c for c in DEMO_COLS if c in demo.columns]

    df = cbc[cbc_avail].merge(demo[demo_avail], on="SEQN", how="inner")
    df = df.merge(fertin_sub, on="SEQN", how="inner")

    # --- BIOPRO (optional, but рекомендую оставлять как у тебя) ---
    if biopro is not None:
        bio_avail = ["SEQN"] + [c for c in BIOPRO_COLS if c in biopro.columns]
        df = df.merge(biopro[bio_avail], on="SEQN", how="left")

    # --- BMX ---
    if bmx is not None:
        bmx_avail = ["SEQN"] + [c for c in BMX_COLS if c in bmx.columns]
        df = df.merge(bmx[bmx_avail], on="SEQN", how="left")

    # --- BP ---
    if bp is not None:
        df = df.merge(extract_bp(bp), on="SEQN", how="left")

    # --- CRP ---
    if crp is not None:
        crp_c = find_col(crp, ["LBXHSCRP", "LBXCRP"])
        if crp_c:
            df = df.merge(crp[["SEQN", crp_c]].rename(columns={crp_c: CRP_STD}),
                          on="SEQN", how="left")

    # --- Smoking ---
    if smq is not None:
        smq_avail = ["SEQN"] + [c for c in ["SMQ020", "SMQ040"] if c in smq.columns]
        if len(smq_avail) > 1:
            df = df.merge(smq[smq_avail], on="SEQN", how="left")

    # --- Alcohol ---
    if alq is not None:
        alq_avail = ["SEQN"] + [c for c in ["ALQ121", "ALQ130"] if c in alq.columns]
        if len(alq_avail) > 1:
            df = df.merge(alq[alq_avail], on="SEQN", how="left")

    # --- Occupation ---
    if ocq is not None:
        ocq_avail = ["SEQN"] + [c for c in ["OCD150", "OCQ180"] if c in ocq.columns]
        if len(ocq_avail) > 1:
            df = df.merge(ocq[ocq_avail], on="SEQN", how="left")

    df["CYCLE"] = name
    print(f"  Final: {len(df)} rows, {len(df.columns)} cols")
    return df


# ============================================================
# 1) process + concat
# ============================================================
dfs = []
for name, cfg in CYCLES.items():
    part = process_cycle(name, cfg)
    if part is not None:
        dfs.append(part)

df = pd.concat(dfs, ignore_index=True)
print("\nTOTAL:", df.shape)

# drop duplicates SEQN
dups = df["SEQN"].duplicated().sum()
print("Dup SEQN:", dups)
if dups:
    df = df.drop_duplicates(subset="SEQN", keep="first")

# ============================================================
# 2) Targets by ferritin
# ============================================================
# Basic ferritin thresholds (common clinical cutoffs)
df["Y_FER_LT15"] = np.where(df["LBXFER"].notna(), (df["LBXFER"] < 15).astype(float), np.nan)
df["Y_FER_LT30"] = np.where(df["LBXFER"].notna(), (df["LBXFER"] < 30).astype(float), np.nan)

# CRP-aware target example:
# If CRP >=5 mg/L, ferritin is less reliable; mark as NaN (uncertain) so you can exclude in training/eval
if CRP_STD in df.columns:
    crp_ok = df[CRP_STD].notna()
    low_crp = (df[CRP_STD] < 5)
    df["Y_FER_CRPAWARE_LT30"] = np.nan
    df.loc[crp_ok & low_crp & df["LBXFER"].notna(), "Y_FER_CRPAWARE_LT30"] = (df.loc[crp_ok & low_crp, "LBXFER"] < 30).astype(float)
else:
    df["Y_FER_CRPAWARE_LT30"] = np.nan

# ============================================================
# 3) Quick sanity: sexes, cycles, coverage
# ============================================================
valid30 = df["Y_FER_LT30"].notna().sum()
print(f"\nValid ferritin (for Y_FER_LT30): {valid30}/{len(df)} ({valid30/len(df)*100:.1f}%)")

print("\nBy sex (RIAGENDR):")
if "RIAGENDR" in df.columns:
    for sex, lab in [(1, "Men"), (2, "Women")]:
        s = df[df["RIAGENDR"] == sex]
        if len(s):
            prev = np.nanmean(s["Y_FER_LT30"].values) * 100
            print(f"  {lab:5s}: n={len(s):5d} | prev(FER<30)={prev:5.1f}%")
else:
    print("  RIAGENDR missing")

print("\nBy cycle:")
for cycle in df["CYCLE"].unique():
    s = df[df["CYCLE"] == cycle]
    prev = np.nanmean(s["Y_FER_LT30"].values) * 100
    print(f"  {cycle}: n={len(s):5d} | prev(FER<30)={prev:5.1f}%")

if CRP_STD in df.columns:
    crp_cov = df[CRP_STD].notna().sum()
    print(f"\nCRP coverage: {crp_cov}/{len(df)} ({crp_cov/len(df)*100:.1f}%)")
    crpaware_valid = df["Y_FER_CRPAWARE_LT30"].notna().sum()
    print(f"CRP-aware valid (low CRP & ferritin present): {crpaware_valid}/{len(df)} ({crpaware_valid/len(df)*100:.1f}%)")

# ============================================================
# 4) Save
# ============================================================
out = os.path.join(BASE, "nhanes_ferritin_only.csv")
df.to_csv(out, index=False)
print("\nSAVED:", out, "|", df.shape)