"""График распределения BODY_IRON из nhanes_final.csv"""
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

script_dir = Path(__file__).resolve().parent
csv_path = script_dir / "nhanes_final.csv"
out_path = script_dir / "body_iron_distribution.png"

df = pd.read_csv(csv_path)
body_iron = df["BODY_IRON"].dropna()

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# Гистограмма
axes[0].hist(body_iron, bins=50, edgecolor="black", alpha=0.7)
axes[0].set_xlabel("BODY_IRON")
axes[0].set_ylabel("Частота")
axes[0].set_title("Гистограмма распределения BODY_IRON")
axes[0].grid(True, alpha=0.3)

# KDE (оценка плотности)
body_iron.plot(kind="kde", ax=axes[1], linewidth=2)
axes[1].set_xlabel("BODY_IRON")
axes[1].set_ylabel("Плотность")
axes[1].set_title("Оценка плотности распределения BODY_IRON")
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(out_path, dpi=150, bbox_inches="tight")
print(f"График сохранён: {out_path}")
print(f"Наблюдений: {len(body_iron)}, пропусков: {df['BODY_IRON'].isna().sum()}")
print(f"Среднее: {body_iron.mean():.3f}, стд: {body_iron.std():.3f}")
plt.show()
