"""Create missing visualizations and summary for featureset experiment"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

sns.set_style("whitegrid")

BASE = Path(r"c:\Users\Кирилл\Desktop\Rats Marks")
OUTPUT_DIR = BASE / "results" / "featureset_comparison"

# Load results
df = pd.read_csv(OUTPUT_DIR / "featureset_comparison_metrics.csv")

# ============================================================
# 1. CatBoost improvement plot
# ============================================================
improvement = []
for ds in ['kdl', '29n', 'ext']:
    lr = df[(df['dataset'] == ds) & (df['model'] == 'logreg')].iloc[0]
    cb = df[(df['dataset'] == ds) & (df['model'] == 'catboost')].iloc[0]
    
    improvement.append({
        'dataset': ds,
        'delta_pr_auc': cb['pr_auc_mean'] - lr['pr_auc_mean'],
        'delta_roc_auc': cb['roc_auc_mean'] - lr['roc_auc_mean'],
        'delta_brier': lr['brier_mean'] - cb['brier_mean'],  # lower is better
        'missing_rate': cb['missing_rate'],
    })

df_improvement = pd.DataFrame(improvement)

fig, ax = plt.subplots(figsize=(10, 6))

x_pos = np.arange(len(df_improvement))
width = 0.35

ax.bar(x_pos - width/2, df_improvement['delta_pr_auc'] * 100, width, 
       label='Delta PR-AUC (%)', alpha=0.7, color='#2ca02c')
ax.bar(x_pos + width/2, df_improvement['delta_roc_auc'] * 100, width,
       label='Delta ROC-AUC (%)', alpha=0.7, color='#d62728')

ax.set_ylabel('Improvement (percentage points)', fontsize=12)
ax.set_xlabel('Dataset', fontsize=12)
ax.set_title('CatBoost improvement over LogReg', fontsize=14, fontweight='bold')
ax.set_xticks(x_pos)
ax.set_xticklabels(df_improvement['dataset'].str.upper())
ax.axhline(y=0, color='black', linewidth=1)
ax.legend()
ax.grid(axis='y', alpha=0.3)

# Add missing rate
for i, row in df_improvement.iterrows():
    ax.text(i, max(row['delta_pr_auc'], row['delta_roc_auc']) * 100 + 0.2,
            f"miss={row['missing_rate']*100:.1f}%",
            ha='center', va='bottom', fontsize=9, color='gray')

plt.tight_layout()
plt.savefig(OUTPUT_DIR / "catboost_improvement.png", dpi=300, bbox_inches='tight')
print(f"[OK] Saved: catboost_improvement.png")
plt.close()

# ============================================================
# 2. Summary report
# ============================================================

# Find best model
best_idx = df['pr_auc_mean'].idxmax()
best = df.loc[best_idx]

summary = f"""
EXPERIMENT #2: KDL vs 29n vs EXT
=================================

KEY FINDINGS:

1. BEST MODEL
   - {best['dataset'].upper()} + {best['model'].upper()}
   - PR-AUC: {best['pr_auc_mean']:.4f} +/- {best['pr_auc_std']:.4f}
   - ROC-AUC: {best['roc_auc_mean']:.4f} +/- {best['roc_auc_std']:.4f}
   - Brier: {best['brier_mean']:.4f} +/- {best['brier_std']:.4f}

2. KDL (CBC only)
   - LogReg: PR-AUC = {df[(df['dataset']=='kdl') & (df['model']=='logreg')]['pr_auc_mean'].values[0]:.4f}
   - CatBoost: PR-AUC = {df[(df['dataset']=='kdl') & (df['model']=='catboost')]['pr_auc_mean'].values[0]:.4f}
   - Conclusion: Almost linear task, LogReg sufficient

3. 29n (CBC + vitals/bio)
   - LogReg: PR-AUC = {df[(df['dataset']=='29n') & (df['model']=='logreg')]['pr_auc_mean'].values[0]:.4f}
   - CatBoost: PR-AUC = {df[(df['dataset']=='29n') & (df['model']=='catboost')]['pr_auc_mean'].values[0]:.4f}
   - Conclusion: CatBoost {df_improvement[df_improvement['dataset']=='29n']['delta_pr_auc'].values[0]*100:+.2f}% improvement

4. EXT (full)
   - LogReg: PR-AUC = {df[(df['dataset']=='ext') & (df['model']=='logreg')]['pr_auc_mean'].values[0]:.4f}
   - CatBoost: PR-AUC = {df[(df['dataset']=='ext') & (df['model']=='catboost')]['pr_auc_mean'].values[0]:.4f}
   - Conclusion: Many missing values (~{df_improvement[df_improvement['dataset']=='ext']['missing_rate'].values[0]*100:.0f}%), CatBoost better

5. CALIBRATION
   - LogReg: well-calibrated "out of the box" (all datasets)
   - CatBoost: requires isotonic/Platt calibration for production

6. PRACTICAL METRIC (PPV @ Recall=0.90)
   - Important for triage: "how many FP at 90% sensitivity"
   - All models: PPV ~0.071 (baseline prevalence)

RECOMMENDATIONS FOR PRODUCTION:

MVP (KDL):
- LogReg on X_kdl
- PR-AUC ~0.76, excellent calibration
- Simple explanation for doctors

B2B (29n):
- CatBoost on X_29n (if infrastructure available)
- OR LogReg (if simplicity matters more than 1-2% AUC)

B2C (extended):
- Too many missing values, need more data
- Or use 29n as "fallback"

FILES:
- featureset_comparison_metrics.csv - all model metrics
- featureset_comparison_auc.png - ROC/PR-AUC comparison
- calibration_curves.png - calibration curves
- ppv_at_recall90.png - PPV @ 90% recall
- catboost_improvement.png - CatBoost vs LogReg improvement
- comparison_table.md - detailed table
"""

with open(OUTPUT_DIR / "summary.txt", "w", encoding='utf-8') as f:
    f.write(summary)

print(summary)
print(f"\n[OK] Full report saved in: {OUTPUT_DIR}")
print("=" * 80)
