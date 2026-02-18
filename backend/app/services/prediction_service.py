from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor, Pool
from pydantic import BaseModel, ConfigDict, Field

MODEL_NAME = os.getenv("MODEL_NAME", "ironrisk_bi_reg_29n.cbm")
MODEL_PATH = Path(os.getenv("MODEL_PATH", f"/{MODEL_NAME}"))

FEATURES = [
    "LBXWBCSI", "LBXLYPCT", "LBXMOPCT", "LBXNEPCT", "LBXEOPCT", "LBXBAPCT",
    "LBXRBCSI", "LBXHGB", "LBXHCT", "LBXMCVSI", "LBXMC", "LBXMCHSI", "LBXRDW",
    "LBXPLTSI", "LBXMPSI", "RIAGENDR", "RIDAGEYR", "LBXSGL", "LBXSCH",
    "BMXBMI", "BMXHT", "BMXWT", "BMXWAIST", "BP_SYS", "BP_DIA"
]

REQUIRED_FIELDS = [
    "LBXHGB",
    "LBXMCVSI",
    "LBXMCHSI",
    "LBXRDW",
    "LBXRBCSI",
    "LBXHCT",
    "RIDAGEYR",
]

RECOMMENDED_FIELDS = [
    "LBXPLTSI",
    "LBXWBCSI",
    "LBXMPSI",
    "BP_SYS",
    "BP_DIA",
    "BMXWAIST",
    "LBXSCH",
    "LBXSGL",
]


UNIT_CONVERSIONS = {
    "LBXSCR": 1 / 88.4,
    "LBXSUA": 1 / 59.48,
    "LBXSTB": 1 / 17.1,
}


def normalize_input(data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(data)

    hgb = normalized.get("LBXHGB")
    if hgb is not None and hgb > 50:
        normalized["LBXHGB"] = hgb / 10

    mchc = normalized.get("LBXMCHSI")
    if mchc is not None and mchc > 100:
        normalized["LBXMCHSI"] = mchc / 10

    glucose = normalized.get("LBXSGL")
    if glucose is not None and glucose < 25:
        normalized["LBXSGL"] = glucose * 18.01

    cholesterol = normalized.get("LBXSCH")
    if cholesterol is not None and cholesterol < 25:
        normalized["LBXSCH"] = cholesterol * 38.67

    for feature_name, multiplier in UNIT_CONVERSIONS.items():
        value = normalized.get(feature_name)
        if value is not None and value > 10:
            normalized[feature_name] = value * multiplier

    return normalized

FEATURE_LABELS = {
    "LBXWBCSI": "Лейкоциты (WBC)",
    "LBXLYPCT": "Лимфоциты (%)",
    "LBXMOPCT": "Моноциты (%)",
    "LBXNEPCT": "Нейтрофилы (%)",
    "LBXEOPCT": "Эозинофилы (%)",
    "LBXBAPCT": "Базофилы (%)",
    "LBXRBCSI": "Эритроциты (RBC)",
    "LBXHGB": "Гемоглобин",
    "LBXHCT": "Гематокрит (HCT)",
    "LBXMCVSI": "Средний объем эритроцита (MCV)",
    "LBXMC": "Содержание гемоглобина в эритроците (MCH)",
    "LBXMCHSI": "Концентрация гемоглобина (MCHC)",
    "LBXRDW": "Ширина распределения эритроцитов (RDW)",
    "LBXPLTSI": "Тромбоциты (PLT)",
    "LBXMPSI": "Средний объем тромбоцита (MPV)",
    "RIAGENDR": "Пол",
    "RIDAGEYR": "Возраст",
    "LBXSGL": "Глюкоза",
    "LBXSCH": "Холестерин",
    "BMXBMI": "Индекс массы тела (ИМТ)",
    "BMXHT": "Рост",
    "BMXWT": "Вес",
    "BMXWAIST": "Окружность талии",
    "BP_SYS": "Систолическое давление",
    "BP_DIA": "Диастолическое давление",
}


class PredictRequest(BaseModel):
    LBXWBCSI: float | None = None
    LBXLYPCT: float | None = None
    LBXMOPCT: float | None = None
    LBXNEPCT: float | None = None
    LBXEOPCT: float | None = None
    LBXBAPCT: float | None = None
    LBXRBCSI: float | None = None
    LBXHGB: float | None = None
    LBXHCT: float | None = None
    LBXMCVSI: float | None = None
    LBXMC: float | None = None
    LBXMCHSI: float | None = None
    LBXRDW: float | None = None
    LBXPLTSI: float | None = None
    LBXMPSI: float | None = None
    RIAGENDR: int | None = None
    RIDAGEYR: int | None = None
    LBXSGL: float | None = None
    LBXSCH: float | None = None
    BMXBMI: float | None = None
    BMXHT: float | None = None
    BMXWT: float | None = None
    BMXWAIST: float | None = None
    BP_SYS: float | None = None
    BP_DIA: float | None = None


class PredictResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: str
    confidence: str
    model_name: str
    error_code: str | None = None
    message: str | None = None
    invalid_fields: list[dict[str, str]] = Field(default_factory=list)
    missing_required_fields: list[str] = Field(default_factory=list)

    iron_index: float | None = None
    risk_percent: float | None = None
    risk_tier: str | None = None
    clinical_action: str | None = None
    explanations: list[dict[str, Any]] = Field(default_factory=list)


def build_explanation_text(feature_name: str, direction: str) -> str:
    if direction == "negative":
        negative_map = {
            "LBXRDW": "Профиль RDW вносит вклад в снижение индекса железа и может быть связан с дефицитным паттерном.",
            "LBXHGB": "Уровень гемоглобина в текущем профиле уменьшает оценку запасов железа.",
            "LBXMCVSI": "MCV в текущем профиле сдвигает прогноз в сторону более низкого индекса железа.",
            "LBXMC": "MCH в текущем профиле связан со снижением итоговой оценки железа.",
            "LBXMCHSI": "MCHC в текущем профиле снижает прогнозируемый индекс железа.",
        }
        return negative_map.get(
            feature_name,
            "Этот показатель снижает итоговый индекс железа в модели.",
        )

    positive_map = {
        "BMXBMI": "Текущий ИМТ в модели повышает расчетный индекс железа.",
        "LBXWBCSI": "Профиль лейкоцитов в модели увеличивает итоговый индекс железа.",
        "LBXPLTSI": "Текущее значение тромбоцитов вносит положительный вклад в индекс железа.",
    }
    return positive_map.get(
        feature_name,
        "Этот показатель повышает итоговый индекс железа в модели.",
    )


class ModelRunner:
    def __init__(self, model_path: Path) -> None:
        self.model_path = model_path
        self.model = self._load_model(model_path)

    @staticmethod
    def _load_model(path: Path) -> CatBoostRegressor | None:
        if not path.exists():
            return None
        model = CatBoostRegressor()
        model.load_model(str(path))
        return model

    @staticmethod
    def _build_dataframe(payload: dict[str, Any]) -> pd.DataFrame:
        payload = normalize_input(payload)
        if payload.get("BMXBMI") is None and payload.get("BMXHT") and payload.get("BMXWT"):
            height_m = payload["BMXHT"] / 100
            payload["BMXBMI"] = payload["BMXWT"] / (height_m * height_m)

        row: dict[str, Any] = {feature: np.nan for feature in FEATURES}
        row.update(payload)
        # Gender is accepted by API and can be persisted upstream, but is not sent into model scoring.
        row["RIAGENDR"] = np.nan
        return pd.DataFrame([row], columns=FEATURES)

    @staticmethod
    def _fallback_bi(df: pd.DataFrame) -> float:
        return float(
            0.10 * float(df["LBXHGB"].iloc[0] if pd.notna(df["LBXHGB"].iloc[0]) else 120)
            + 0.08 * float(df["LBXMCVSI"].iloc[0] if pd.notna(df["LBXMCVSI"].iloc[0]) else 85)
            - 0.20 * float(df["LBXRDW"].iloc[0] if pd.notna(df["LBXRDW"].iloc[0]) else 14)
            - 7.0
        )

    def predict_iron_index(self, payload: dict[str, Any]) -> float:
        df = self._build_dataframe(payload)

        if self.model is None:
            return self._fallback_bi(df)

        return float(self.model.predict(df)[0])

    def get_explanations(self, payload: dict[str, Any], top_n: int = 8) -> list[dict[str, Any]]:
        df = self._build_dataframe(payload)

        if self.model is None:
            fallback_impacts = {
                "LBXHGB": 0.10 * float(df["LBXHGB"].iloc[0] if pd.notna(df["LBXHGB"].iloc[0]) else 120),
                "LBXMCVSI": 0.08 * float(df["LBXMCVSI"].iloc[0] if pd.notna(df["LBXMCVSI"].iloc[0]) else 85),
                "LBXRDW": -0.20 * float(df["LBXRDW"].iloc[0] if pd.notna(df["LBXRDW"].iloc[0]) else 14),
            }
            explanations = []
            for feature, impact in sorted(fallback_impacts.items(), key=lambda item: item[1]):
                direction = "negative" if impact < 0 else "positive"
                explanations.append(
                    {
                        "feature": feature,
                        "label": FEATURE_LABELS.get(feature, feature),
                        "impact": round(float(impact), 4),
                        "direction": direction,
                        "text": build_explanation_text(feature, direction),
                    }
                )
            return explanations

        shap_values = self.model.get_feature_importance(Pool(df), type="ShapValues")[0]
        explanations = []
        for feature_name, impact in zip(FEATURES, shap_values[:-1]):
            if abs(impact) < 0.01:
                continue
            direction = "negative" if impact < 0 else "positive"
            explanations.append(
                {
                    "feature": feature_name,
                    "label": FEATURE_LABELS.get(feature_name, feature_name),
                    "impact": round(float(impact), 4),
                    "direction": direction,
                    "text": build_explanation_text(feature_name, direction),
                }
            )

        explanations.sort(key=lambda item: item["impact"])
        negative = [item for item in explanations if item["impact"] < 0]
        positive = [item for item in explanations if item["impact"] >= 0]
        return (negative[:top_n] + positive[:top_n])[:top_n]


@lru_cache
def get_runner() -> ModelRunner:
    return ModelRunner(MODEL_PATH)


def resolve_missing_required(payload: dict[str, Any]) -> list[str]:
    missing = [name for name in REQUIRED_FIELDS if payload.get(name) is None]
    has_bmi = payload.get("BMXBMI") is not None
    has_hw = payload.get("BMXHT") is not None and payload.get("BMXWT") is not None
    if not has_bmi and not has_hw:
        missing.append("BMXBMI_or_BMXHT_BMXWT")
    return missing


def resolve_confidence(payload: dict[str, Any], missing_required: list[str]) -> str:
    if missing_required:
        return "low"
    rec_present = sum(payload.get(name) is not None for name in RECOMMENDED_FIELDS)
    return "high" if rec_present >= len(RECOMMENDED_FIELDS) / 2 else "medium"


def resolve_risk_profile(iron_index: float) -> tuple[str, str]:
    tier = resolve_tier_from_iron_index(iron_index)
    return tier, resolve_action_from_tier(tier)


def validate_payload_values(payload: dict[str, Any]) -> list[dict[str, str]]:
    invalid_fields: list[dict[str, str]] = []
    for field_name, value in payload.items():
        if value is None or field_name not in FEATURES:
            continue

        if isinstance(value, (int, float)):
            numeric = float(value)
            if not np.isfinite(numeric):
                invalid_fields.append({"field": field_name, "reason": "must_be_finite_number"})
                continue
            if numeric < 0:
                invalid_fields.append({"field": field_name, "reason": "must_be_non_negative"})
                continue
            if field_name in {"BMXBMI", "BMXHT", "BMXWT", "RIDAGEYR"} and numeric <= 0:
                invalid_fields.append({"field": field_name, "reason": "must_be_positive"})
            continue

        invalid_fields.append({"field": field_name, "reason": "must_be_number"})

    return invalid_fields


def build_needs_input_response(
    *,
    confidence: str,
    missing_required_fields: list[str],
    error_code: str,
    message: str,
    invalid_fields: list[dict[str, str]] | None = None,
) -> PredictResponse:
    return PredictResponse(
        status="needs_input",
        confidence=confidence,
        model_name=MODEL_NAME,
        error_code=error_code,
        message=message,
        invalid_fields=invalid_fields or [],
        missing_required_fields=missing_required_fields,
    )


def resolve_tier_from_iron_index(iron_index: float) -> str:
    if iron_index < 0:
        return "HIGH"
    if iron_index <= 2:
        return "WARNING"
    if iron_index <= 5:
        return "GRAY"
    return "LOW"


def resolve_action_from_tier(tier: str) -> str:
    actions = {
        "HIGH": "Срочно: ферритин + терапевт.",
        "WARNING": "Рекомендовано: добор ферритина.",
        "GRAY": "Совет: мониторинг + питание.",
        "LOW": "Спокойствие: доборы не нужны.",
    }
    return actions[tier]


def get_display_risk(iron_index: float) -> float:
    risk = 1 / (1 + np.exp(0.5 * iron_index))
    return round(float(risk * 100), 1)


def predict_payload(data: dict[str, Any]) -> PredictResponse:
    invalid_fields = validate_payload_values(data)
    if invalid_fields:
        return build_needs_input_response(
            confidence="low",
            missing_required_fields=[],
            error_code="invalid_payload",
            message="Payload contains invalid numeric values",
            invalid_fields=invalid_fields,
        )

    missing_required = resolve_missing_required(data)
    confidence = resolve_confidence(data, missing_required)

    if missing_required:
        return build_needs_input_response(
            confidence=confidence,
            missing_required_fields=missing_required,
            error_code="needs_input",
            message="Required fields are missing",
        )

    runner = get_runner()
    iron_index = runner.predict_iron_index(data)
    risk_tier, clinical_action = resolve_risk_profile(iron_index)

    return PredictResponse(
        status="ok",
        confidence=confidence,
        model_name=MODEL_NAME,
        iron_index=round(iron_index, 2),
        risk_percent=get_display_risk(iron_index),
        risk_tier=risk_tier,
        clinical_action=clinical_action,
        explanations=runner.get_explanations(data),
    )
