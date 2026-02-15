"""Update comparison table with full data"""
import pandas as pd
from pathlib import Path

BASE = Path(r"c:\Users\Кирилл\Desktop\Rats Marks")
OUTPUT_DIR = BASE / "results" / "featureset_comparison"

# Load results
df = pd.read_csv(OUTPUT_DIR / "featureset_comparison_metrics.csv")

# Format table
table = df.copy()
table['ROC-AUC'] = table['roc_auc_mean'].apply(lambda x: f"{x:.4f}") + " ± " + table['roc_auc_std'].apply(lambda x: f"{x:.4f}")
table['PR-AUC'] = table['pr_auc_mean'].apply(lambda x: f"{x:.4f}") + " ± " + table['pr_auc_std'].apply(lambda x: f"{x:.4f}")
table['Brier'] = table['brier_mean'].apply(lambda x: f"{x:.4f}") + " ± " + table['brier_std'].apply(lambda x: f"{x:.4f}")
table['PPV@R90'] = table['ppv_at_recall90_mean'].apply(lambda x: f"{x:.4f}") + " ± " + table['ppv_at_recall90_std'].apply(lambda x: f"{x:.4f}")
table['missing_rate'] = (table['missing_rate'] * 100).apply(lambda x: f"{x:.1f}%")

table_display = table[['dataset', 'model', 'n_features', 'missing_rate', 'ROC-AUC', 'PR-AUC', 'Brier', 'PPV@R90']]

# Save as markdown
with open(OUTPUT_DIR / "comparison_table.md", "w", encoding='utf-8') as f:
    f.write("# Featureset Comparison: Detailed Results\n\n")
    f.write("## Model Performance (5×3 Cross-Validation)\n\n")
    f.write(table_display.to_markdown(index=False))
    f.write("\n\n## Notes\n\n")
    f.write("- **Target**: Y_IRON_DEFICIENCY (Body Iron < 0), prevalence 7.1%\n")
    f.write("- **Metrics**: mean ± std across 15 CV folds\n")
    f.write("- **missing_rate**: average proportion of missing values per feature\n")
    f.write("- **PPV@R90**: Positive Predictive Value at 90% Recall (sensitivity)\n")
    f.write("- **Best PR-AUC**: ext + catboost (0.7913)\n")
    f.write("- **Best calibration**: all logreg models\n")
    f.write("- **Production recommendation**: 29n + logreg (simplicity + performance)\n")

print("Updated comparison_table.md")
