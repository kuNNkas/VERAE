from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
    status: str
    confidence: str
    model_name: str
    missing_required_fields: list[str] = Field(default_factory=list)

    iron_index: float | None = None
    risk_percent: float | None = None
    risk_tier: str | None = None
    clinical_action: str | None = None


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

    def predict_iron_index(self, payload: dict[str, Any]) -> float:
        payload = dict(payload)
        if payload.get("BMXBMI") is None and payload.get("BMXHT") and payload.get("BMXWT"):
            height_m = payload["BMXHT"] / 100
            payload["BMXBMI"] = payload["BMXWT"] / (height_m * height_m)

        row: dict[str, Any] = {feature: np.nan for feature in FEATURES}
        row.update(payload)
        row.setdefault("RIAGENDR", 2)
        df = pd.DataFrame([row], columns=FEATURES)

        if self.model is None:
            # Local-only deterministic fallback when model artifact is absent.
            bi = (
                0.10 * float(df["LBXHGB"].iloc[0] if pd.notna(df["LBXHGB"].iloc[0]) else 120)
                + 0.08 * float(df["LBXMCVSI"].iloc[0] if pd.notna(df["LBXMCVSI"].iloc[0]) else 85)
                - 0.20 * float(df["LBXRDW"].iloc[0] if pd.notna(df["LBXRDW"].iloc[0]) else 14)
                - 7.0
            )
            return float(bi)

        return float(self.model.predict(df)[0])


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
    risk = 1 / (1 + np.exp(0.5 * (iron_index - 0)))
    return round(float(risk * 100), 1)


app = FastAPI(title="VERAE B2C API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/risk/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    data = payload.model_dump()
    missing_required = resolve_missing_required(data)
    confidence = resolve_confidence(data, missing_required)

    if missing_required:
        return PredictResponse(
            status="needs_input",
            confidence=confidence,
            model_name=MODEL_NAME,
            missing_required_fields=missing_required,
        )

    iron_index = get_runner().predict_iron_index(data)
    risk_tier = resolve_tier_from_iron_index(iron_index)
    return PredictResponse(
        status="ok",
        confidence=confidence,
        model_name=MODEL_NAME,
        iron_index=round(iron_index, 2),
        risk_percent=get_display_risk(iron_index),
        risk_tier=risk_tier,
        clinical_action=resolve_action_from_tier(risk_tier),
    )
