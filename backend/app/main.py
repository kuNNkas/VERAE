from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


MODEL_NAME = os.getenv("MODEL_NAME", "ironrisk_bi_29n_women18_49.cbm")
MODEL_PATH = Path(os.getenv("MODEL_PATH", f"/{MODEL_NAME}"))
FEATURES_PATH = Path(os.getenv("FEATURES_PATH", "/train_data/features_29n.txt"))
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
    LBXHGB: float | None = None
    LBXMCVSI: float | None = None
    LBXMCHSI: float | None = None
    LBXRDW: float | None = None
    LBXRBCSI: float | None = None
    LBXHCT: float | None = None
    RIDAGEYR: int | None = None
    BMXBMI: float | None = None
    BMXHT: float | None = None
    BMXWT: float | None = None

    LBXPLTSI: float | None = None
    LBXWBCSI: float | None = None
    LBXMPSI: float | None = None
    BP_SYS: float | None = None
    BP_DIA: float | None = None
    BMXWAIST: float | None = None
    LBXSCH: float | None = None
    LBXSGL: float | None = None

    LBXLYPCT: float | None = None
    LBXMOPCT: float | None = None
    LBXNEPCT: float | None = None
    LBXEOPCT: float | None = None
    LBXBAPCT: float | None = None
    LBXMC: float | None = None


class PredictResponse(BaseModel):
    risk_percent: float | None = None
    risk_tier: str | None = None
    confidence: str
    status: str
    missing_required_fields: list[str] = Field(default_factory=list)
    model_name: str


class ModelRunner:
    def __init__(self, model_path: Path, features_path: Path) -> None:
        self.model_path = model_path
        self.features = self._load_features(features_path)
        self.model = self._load_model(model_path)

    @staticmethod
    def _load_features(path: Path) -> list[str]:
        if not path.exists():
            return [
                "LBXWBCSI", "LBXLYPCT", "LBXMOPCT", "LBXNEPCT", "LBXEOPCT", "LBXBAPCT",
                "LBXRBCSI", "LBXHGB", "LBXHCT", "LBXMCVSI", "LBXMC", "LBXMCHSI", "LBXRDW",
                "LBXPLTSI", "LBXMPSI", "RIAGENDR", "RIDAGEYR", "LBXSGL", "LBXSCH",
                "BMXBMI", "BMXHT", "BMXWT", "BMXWAIST", "BP_SYS", "BP_DIA"
            ]
        return [line.strip() for line in path.read_text().splitlines() if line.strip()]

    @staticmethod
    def _load_model(path: Path) -> CatBoostClassifier | None:
        if not path.exists():
            return None
        model = CatBoostClassifier()
        model.load_model(str(path))
        return model

    def predict_proba(self, payload: dict[str, Any]) -> float:
        if payload.get("BMXBMI") is None and payload.get("BMXHT") and payload.get("BMXWT"):
            height_m = payload["BMXHT"] / 100
            payload["BMXBMI"] = payload["BMXWT"] / (height_m * height_m)

        row: dict[str, Any] = {feature: np.nan for feature in self.features}
        row.update(payload)
        row.setdefault("RIAGENDR", 2)
        df = pd.DataFrame([row], columns=self.features)

        if self.model is None:
            # Safe deterministic fallback only for local bring-up when model file is absent.
            heuristic = (
                0.15 * float(df["LBXRDW"].iloc[0] if pd.notna(df["LBXRDW"].iloc[0]) else 14)
                - 0.01 * float(df["LBXHGB"].iloc[0] if pd.notna(df["LBXHGB"].iloc[0]) else 120)
                - 0.005 * float(df["LBXMCVSI"].iloc[0] if pd.notna(df["LBXMCVSI"].iloc[0]) else 85)
            )
            return float(1 / (1 + np.exp(-heuristic)))

        proba = self.model.predict_proba(df)[:, 1][0]
        return float(proba)


@lru_cache
def get_runner() -> ModelRunner:
    return ModelRunner(MODEL_PATH, FEATURES_PATH)


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


def resolve_tier(risk: float) -> str:
    if risk >= 0.50:
        return "high"
    if risk < 0.10:
        return "low"
    return "gray"


app = FastAPI(title="VERAE B2C API", version="0.1.0")

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
            missing_required_fields=missing_required,
            model_name=MODEL_NAME,
        )

    risk = get_runner().predict_proba(data)
    return PredictResponse(
        status="ok",
        risk_percent=round(risk * 100, 1),
        risk_tier=resolve_tier(risk),
        confidence=confidence,
        model_name=MODEL_NAME,
    )
