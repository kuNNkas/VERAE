"""
ВАЛИДАЦИЯ RIDEXPRG: кому делали sTfR?
Проверка гипотезы: sTfR только беременным / репродуктивного возраста
"""

import pandas as pd
import numpy as np
import sys

sys.stdout.reconfigure(encoding='utf-8')

df = pd.read_csv("nhanes_final.csv")

print("=" * 70)
print("ВАЛИДАЦИЯ: КТО ИМЕЕТ sTfR?")
print("=" * 70)

# ============================================================
# 1. Базовая статистика
# ============================================================
print("\n1. БАЗОВАЯ СТАТИСТИКА")
print("-" * 70)

total = len(df)
has_tfr = df['LBXTFR'].notna().sum()
print(f"Всего строк:        {total:5d}")
print(f"Имеют sTfR:         {has_tfr:5d} ({has_tfr/total*100:.1f}%)")
print(f"Имеют Body Iron:    {df['BODY_IRON'].notna().sum():5d}")

# ============================================================
# 2. Распределение по полу
# ============================================================
print("\n2. ПОЛ (RIAGENDR)")
print("-" * 70)

for sex, label in [(1, "Мужчины"), (2, "Женщины")]:
    subset = df[df['RIAGENDR'] == sex]
    n = len(subset)
    n_tfr = subset['LBXTFR'].notna().sum()
    if n > 0:
        print(f"{label:10s}: {n:5d} | sTfR: {n_tfr:5d} ({n_tfr/n*100:.1f}%)")

# ============================================================
# 3. Возрастное распределение (только женщины с sTfR)
# ============================================================
print("\n3. ВОЗРАСТ ЖЕНЩИН С sTfR")
print("-" * 70)

women = df[(df['RIAGENDR'] == 2) & (df['LBXTFR'].notna())].copy()
print(f"Женщин с sTfR:      {len(women)}")
print(f"Возраст: min={women['RIDAGEYR'].min():.0f}, max={women['RIDAGEYR'].max():.0f}, "
      f"mean={women['RIDAGEYR'].mean():.1f}, median={women['RIDAGEYR'].median():.0f}")

# Бины
bins = [0, 18, 25, 35, 45, 55, 65, 100]
labels = ['<18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
women['age_bin'] = pd.cut(women['RIDAGEYR'], bins=bins, labels=labels, right=False)

print("\nРаспределение по возрасту:")
for age_group in labels:
    n = (women['age_bin'] == age_group).sum()
    pct = n / len(women) * 100 if len(women) > 0 else 0
    print(f"  {age_group:8s}: {n:5d} ({pct:5.1f}%)")

# ============================================================
# 4. RIDEXPRG (статус беременности)
# ============================================================
print("\n4. RIDEXPRG (СТАТУС БЕРЕМЕННОСТИ)")
print("-" * 70)
print("Кодировка NHANES:")
print("  1 = Yes, positive lab pregnancy test")
print("  2 = Not pregnant")
print("  3 = Cannot ascertain (вероятно, постменопауза / мужчины)")
print("")

if 'RIDEXPRG' in df.columns:
    # Только женщины с sTfR
    women_tfr = df[(df['RIAGENDR'] == 2) & (df['LBXTFR'].notna())].copy()
    
    print(f"Женщин с sTfR:      {len(women_tfr)}")
    print(f"RIDEXPRG not null:  {women_tfr['RIDEXPRG'].notna().sum()} "
          f"({women_tfr['RIDEXPRG'].notna().sum()/len(women_tfr)*100:.1f}%)")
    print("")
    
    preg_counts = women_tfr['RIDEXPRG'].value_counts(dropna=False).sort_index()
    for val, count in preg_counts.items():
        pct = count / len(women_tfr) * 100
        if pd.isna(val):
            label = "NaN (нет данных)"
        elif val == 1:
            label = "1 (беременна)"
        elif val == 2:
            label = "2 (не беременна)"
        elif val == 3:
            label = "3 (неопределимо)"
        else:
            label = f"{val} (неизвестно)"
        print(f"  {label:25s}: {count:5d} ({pct:5.1f}%)")
    
    # ============================================================
    # 5. Критичная проверка: есть ли sTfR у небеременных и старше 45?
    # ============================================================
    print("\n5. КРИТИЧНАЯ ПРОВЕРКА: sTfR У НЕБЕРЕМЕННЫХ СТАРШЕ 45 ЛЕТ?")
    print("-" * 70)
    
    non_pregnant = women_tfr[women_tfr['RIDEXPRG'] == 2]
    print(f"Небеременных с sTfR:        {len(non_pregnant)} ({len(non_pregnant)/len(women_tfr)*100:.1f}%)")
    
    if len(non_pregnant) > 0:
        print(f"  Возраст: min={non_pregnant['RIDAGEYR'].min():.0f}, "
              f"max={non_pregnant['RIDAGEYR'].max():.0f}, "
              f"mean={non_pregnant['RIDAGEYR'].mean():.1f}")
        
        older_non_preg = non_pregnant[non_pregnant['RIDAGEYR'] >= 45]
        print(f"  Из них ≥45 лет:           {len(older_non_preg)} ({len(older_non_preg)/len(non_pregnant)*100:.1f}%)")
    
    # ============================================================
    # 6. Вывод: ограничение модели
    # ============================================================
    print("\n" + "=" * 70)
    print("ВЫВОД: ОГРАНИЧЕНИЕ ПРИМЕНИМОСТИ МОДЕЛИ")
    print("=" * 70)
    
    total_women = (df['RIAGENDR'] == 2).sum()
    women_with_tfr = len(women_tfr)
    coverage = women_with_tfr / total_women * 100 if total_women > 0 else 0
    
    print(f"\nВсего женщин в NHANES:  {total_women}")
    print(f"Женщин с sTfR:          {women_with_tfr} ({coverage:.1f}%)")
    print(f"Женщин БЕЗ sTfR:        {total_women - women_with_tfr} ({100-coverage:.1f}%)")
    print("")
    
    # Средний возраст
    if len(women_tfr) > 0:
        mean_age = women_tfr['RIDAGEYR'].mean()
        median_age = women_tfr['RIDAGEYR'].median()
        age_range = (women_tfr['RIDAGEYR'].min(), women_tfr['RIDAGEYR'].max())
        
        print(f"Средний возраст с sTfR: {mean_age:.1f} лет (медиана {median_age:.0f})")
        print(f"Диапазон возраста:      {age_range[0]:.0f}-{age_range[1]:.0f} лет")
        print("")
        
        # Процент небеременных
        if 'RIDEXPRG' in women_tfr.columns:
            non_preg_pct = (women_tfr['RIDEXPRG'] == 2).sum() / len(women_tfr) * 100
            preg_pct = (women_tfr['RIDEXPRG'] == 1).sum() / len(women_tfr) * 100
            unknown_pct = women_tfr['RIDEXPRG'].isna().sum() / len(women_tfr) * 100
            
            print(f"Беременные:             {preg_pct:.1f}%")
            print(f"Небеременные:           {non_preg_pct:.1f}%")
            print(f"Статус неизвестен:      {unknown_pct:.1f}%")
    
    print("\n" + "-" * 70)
    print("ОГРАНИЧЕНИЕ:")
    if len(non_pregnant[non_pregnant['RIDAGEYR'] >= 45]) < 100:
        print("  ⚠ Модель обучена ПРЕИМУЩЕСТВЕННО на женщинах репродуктивного возраста.")
        print("  ⚠ Применимость для женщин >45 лет и мужчин НЕ ВАЛИДИРОВАНА.")
        print("  ⚠ Для пилота: работать с женщинами 18-50 лет.")
        print("  ⚠ Для scale: собрать российские данные с sTfR для других групп.")
    else:
        print("  ✓ Данные покрывают разные возрастные группы.")
        print("  ✓ Модель может быть применима шире.")
    print("-" * 70)

else:
    print("  RIDEXPRG не найден в датасете.")

# ============================================================
# 7. Сохранение подвыборки для документации
# ============================================================
print("\n6. СОХРАНЕНИЕ ВАЛИДАЦИИ")
print("-" * 70)

validation = women_tfr[['SEQN', 'CYCLE', 'RIDAGEYR', 'RIDEXPRG', 'LBXTFR', 'LBXFER', 'BODY_IRON', 'Y_IRON_DEFICIENCY']].copy()
validation.to_csv("train_data/pregnancy_validation.csv", index=False)
print(f"Сохранено: train_data/pregnancy_validation.csv ({len(validation)} строк)")
print("\nГотово. См. выводы выше.")
