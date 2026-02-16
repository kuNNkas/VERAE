from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Optional, Protocol

from pydantic import BaseModel, ConfigDict, Field


class LabFeaturesV1(BaseModel):
    """Каноническая входная модель лабораторных признаков (v1)."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    age_years: Optional[float] = Field(
        default=None,
        description="Возраст пациента, полных лет.",
        ge=0,
        le=120,
    )
    sex: Optional[Literal["female", "male"]] = Field(
        default=None,
        description="Биологический пол (канонические значения: female/male).",
    )

    hgb_g_dl: Optional[float] = Field(default=None, description="Гемоглобин, г/дл.")
    mcv_fl: Optional[float] = Field(default=None, description="Средний объём эритроцита (MCV), фЛ.")
    mch_pg: Optional[float] = Field(default=None, description="Среднее содержание Hb в эритроците (MCH), пг.")
    mchc_g_dl: Optional[float] = Field(default=None, description="Средняя концентрация Hb в эритроците (MCHC), г/дл.")
    rdw_pct: Optional[float] = Field(default=None, description="Ширина распределения эритроцитов (RDW), %.")
    rbc_10e12_l: Optional[float] = Field(default=None, description="Эритроциты, 10^12/л.")
    plt_10e9_l: Optional[float] = Field(default=None, description="Тромбоциты, 10^9/л.")
    wbc_10e9_l: Optional[float] = Field(default=None, description="Лейкоциты, 10^9/л.")
    glucose_mmol_l: Optional[float] = Field(default=None, description="Глюкоза натощак, ммоль/л.")
    total_cholesterol_mmol_l: Optional[float] = Field(default=None, description="Общий холестерин, ммоль/л.")
    bmi_kg_m2: Optional[float] = Field(default=None, description="Индекс массы тела, кг/м^2.")


REQUIRED_FIELDS = (
    "age_years",
    "sex",
    "hgb_g_dl",
    "mcv_fl",
    "mch_pg",
    "mchc_g_dl",
    "rdw_pct",
    "rbc_10e12_l",
    "plt_10e9_l",
    "wbc_10e9_l",
    "glucose_mmol_l",
    "total_cholesterol_mmol_l",
    "bmi_kg_m2",
)

PLAUSIBLE_RANGES = {
    "hgb_g_dl": (3.0, 22.0),
    "mcv_fl": (50.0, 130.0),
    "mch_pg": (10.0, 45.0),
    "mchc_g_dl": (20.0, 40.0),
    "rdw_pct": (8.0, 30.0),
    "rbc_10e12_l": (1.5, 8.0),
    "plt_10e9_l": (20.0, 1500.0),
    "wbc_10e9_l": (1.0, 60.0),
    "glucose_mmol_l": (1.0, 35.0),
    "total_cholesterol_mmol_l": (1.0, 20.0),
    "bmi_kg_m2": (10.0, 80.0),
}


class EligibilityResult(BaseModel):
    eligible: bool
    reasons: list[str]


class FrontendResponse(BaseModel):
    status: Literal["ok", "out_of_scope"]
    risk_score: Optional[float]
    decision: Literal["high_risk", "low_risk", "out_of_scope"]
    explanation: str
    next_steps: list[str]


class TraceRecord(BaseModel):
    timestamp_utc: str
    input_features: dict[str, Any]
    model_version: str
    threshold_version: str
    risk_score: Optional[float]
    decision: str
    status: str


class TraceSink(Protocol):
    def save(self, trace: TraceRecord) -> None:
        ...


@dataclass
class InMemoryTraceSink:
    records: list[TraceRecord]

    def save(self, trace: TraceRecord) -> None:
        self.records.append(trace)


class ProbabilityModel(Protocol):
    def predict_proba(self, rows: list[list[float]]) -> Any:
        ...


def eligibility_check(features: LabFeaturesV1) -> EligibilityResult:
    reasons: list[str] = []
    payload = features.model_dump()

    missing = [field for field in REQUIRED_FIELDS if payload.get(field) is None]
    if missing:
        reasons.append(f"missing_required_fields: {', '.join(missing)}")

    age = payload.get("age_years")
    if age is not None and not (18 <= age <= 50):
        reasons.append("age_out_of_scope: supported range is 18-50 years")

    sex = payload.get("sex")
    if sex is not None and sex != "female":
        reasons.append("sex_out_of_scope: current model is validated for female only")

    for field_name, (lower, upper) in PLAUSIBLE_RANGES.items():
        value = payload.get(field_name)
        if value is None:
            continue
        if not (lower <= value <= upper):
            reasons.append(
                f"data_quality_issue: {field_name}={value} outside plausible range [{lower}, {upper}]"
            )

    return EligibilityResult(eligible=not reasons, reasons=reasons)


def _build_explanation(features: LabFeaturesV1, score: float, threshold: float) -> str:
    if score >= threshold:
        risk_text = "Риск выше порога"
    else:
        risk_text = "Риск ниже порога"

    hints: list[str] = []
    if (features.hgb_g_dl or 100) < 12:
        hints.append("низкий гемоглобин")
    if (features.mcv_fl or 100) < 80:
        hints.append("низкий MCV")
    if (features.rdw_pct or 0) > 15:
        hints.append("повышенный RDW")

    if not hints:
        hints_text = "существенных отклонений ключевых CBC-индикаторов не выявлено"
    else:
        hints_text = ", ".join(hints)

    return f"{risk_text}: score={score:.3f}, threshold={threshold:.3f}; признаки: {hints_text}."


def run_inference(
    features: LabFeaturesV1,
    model: ProbabilityModel,
    *,
    model_version: str,
    threshold: float,
    threshold_version: str,
    trace_sink: TraceSink,
) -> FrontendResponse:
    eligibility = eligibility_check(features)

    if not eligibility.eligible:
        response = FrontendResponse(
            status="out_of_scope",
            risk_score=None,
            decision="out_of_scope",
            explanation="; ".join(eligibility.reasons),
            next_steps=[
                "Проверьте обязательные поля и диапазоны значений.",
                "При несоответствии популяции используйте альтернативный клинический маршрут.",
            ],
        )
        trace_sink.save(
            TraceRecord(
                timestamp_utc=datetime.now(tz=timezone.utc).isoformat(),
                input_features=features.model_dump(),
                model_version=model_version,
                threshold_version=threshold_version,
                risk_score=None,
                decision=response.decision,
                status=response.status,
            )
        )
        return response

    feature_vector = [float(getattr(features, field)) for field in REQUIRED_FIELDS if field != "sex"]
    # sex для текущей версии модели константа (female), поэтому в feature vector не добавляется
    raw = model.predict_proba([feature_vector])
    score = float(raw[0][1])

    decision = "high_risk" if score >= threshold else "low_risk"
    explanation = _build_explanation(features, score, threshold)

    response = FrontendResponse(
        status="ok",
        risk_score=score,
        decision=decision,
        explanation=explanation,
        next_steps=(
            ["Рекомендован добор: ферритин +/- CRP."]
            if decision == "high_risk"
            else ["Срочный добор железного профиля не требуется, повторный контроль по клиническим показаниям."]
        ),
    )

    trace_sink.save(
        TraceRecord(
            timestamp_utc=datetime.now(tz=timezone.utc).isoformat(),
            input_features=features.model_dump(),
            model_version=model_version,
            threshold_version=threshold_version,
            risk_score=score,
            decision=response.decision,
            status=response.status,
        )
    )

    return response
