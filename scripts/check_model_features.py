#!/usr/bin/env python3
"""
Проверка модели после трейна:
- SEQN не должен быть среди фичей (утечка).
- Список фичей модели должен совпадать с features_29n.txt (для API).
"""
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MODEL_PATH = REPO / "ironrisk_bi_29n_women18_49.cbm"
FEATURES_FILE = REPO / "train_data" / "features_29n.txt"


def main() -> None:
    if not MODEL_PATH.exists():
        print(f"Model not found: {MODEL_PATH}")
        return

    from catboost import CatBoostClassifier

    model = CatBoostClassifier()
    model.load_model(str(MODEL_PATH))

    # CatBoost .cbm сохраняет имена фичей; у обученной модели можно получить так:
    try:
        names = model.feature_names_
    except AttributeError:
        names = getattr(model, "get_feature_names", lambda: None)()
    if names is None:
        names = [str(i) for i in range(model.get_feature_count())]
        print("Warning: feature names not in model, using indices")

    print("Model feature count:", len(names))
    print("Features:", names)

    if "SEQN" in names:
        print("\n*** LEAK: SEQN is among model features! Retrain without SEQN. ***")
    else:
        print("\nOK: SEQN is not among features.")

    if FEATURES_FILE.exists():
        expected = [line.strip() for line in FEATURES_FILE.read_text().splitlines() if line.strip()]
        if set(names) != set(expected):
            print("\n*** MISMATCH with features_29n.txt ***")
            print("Only in model:", set(names) - set(expected))
            print("Only in file:", set(expected) - set(names))
        elif list(names) != expected:
            print("\nOrder of features differs from features_29n.txt (names match).")
        else:
            print("\nOK: Feature list matches features_29n.txt (order and set).")
    else:
        print("\nfeatures_29n.txt not found, skip comparison.")


if __name__ == "__main__":
    main()
