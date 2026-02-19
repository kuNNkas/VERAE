from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel

from app.db.database import SessionLocal
from app.db.models import Analysis
from app.services.prediction_service import PredictRequest, PredictResponse, predict_payload


class UploadMetadata(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str | None = None
    source: str | None = None


class CreateAnalysisRequest(BaseModel):
    upload: UploadMetadata
    lab: PredictRequest


class JobInfo(BaseModel):
    id: str
    status: str


class CreateAnalysisResponse(BaseModel):
    analysis_id: str
    user_id: str
    status: str
    progress_stage: str
    job: JobInfo
    created_at: str
    updated_at: str


class AnalysisStatusResponse(BaseModel):
    analysis_id: str
    status: str
    progress_stage: str
    error_code: str | None = None
    failure_diagnostic: str | None = None
    updated_at: str


class AnalysisListItem(BaseModel):
    analysis_id: str
    status: str
    created_at: str


class ListAnalysesResponse(BaseModel):
    analyses: list[AnalysisListItem]


_ALLOWED_TRANSITIONS = {
    "queued": {"processing", "failed"},
    "processing": {"completed", "failed"},
    "completed": set(),
    "failed": set(),
}


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def _set_state(record: Analysis, status: str, *, progress_stage: str | None = None) -> None:
    if status != record.status:
        allowed = _ALLOWED_TRANSITIONS.get(record.status, set())
        if status not in allowed:
            raise ValueError(f"Invalid analysis state transition: {record.status} -> {status}")
        record.status = status

    record.progress_stage = progress_stage or status
    record.updated_at = _now_utc_naive()


def _to_status_response(record: Analysis) -> AnalysisStatusResponse:
    return AnalysisStatusResponse(
        analysis_id=record.id,
        status=record.status,
        progress_stage=record.progress_stage,
        error_code=record.failure_reason,
        failure_diagnostic=record.error_message,
        updated_at=_to_iso(record.updated_at),
    )


def process_analysis_job(analysis_id: str) -> None:
    """Run model inference in background and store result. Sets status to completed or failed."""
    with SessionLocal() as session:
        record = session.query(Analysis).filter(Analysis.id == analysis_id).first()
        if record is None:
            return
        if record.status in {"completed", "failed"}:
            return

        lab_payload = record.lab_payload or {}
        if not lab_payload:
            record.failure_reason = "missing_lab_payload"
            record.error_message = "Empty lab payload"
            _set_state(record, "failed", progress_stage="failed")
            session.commit()
            return

        _set_state(record, "processing", progress_stage="model_inference")
        session.commit()

        try:
            result = predict_payload(lab_payload)
            record.result_payload = result.model_dump()
            _set_state(record, "completed", progress_stage="completed")
            record.failure_reason = None
            record.error_message = None
        except Exception as exc:
            record.failure_reason = "inference_error"
            record.error_message = str(exc)
            _set_state(record, "failed", progress_stage="failed")

        session.commit()


def create_analysis(user_id: str, payload: CreateAnalysisRequest) -> CreateAnalysisResponse:
    now = _now_utc_naive()
    analysis_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    record = Analysis(
        id=analysis_id,
        user_id=user_id,
        status="queued",
        progress_stage="queued",
        upload_payload=payload.upload.model_dump(),
        lab_payload=payload.lab.model_dump(),
        result_payload=None,
        failure_reason=None,
        error_message=None,
        created_at=now,
        updated_at=now,
    )

    with SessionLocal() as session:
        session.add(record)
        session.commit()

    return CreateAnalysisResponse(
        analysis_id=analysis_id,
        user_id=user_id,
        status="queued",
        progress_stage="queued",
        job=JobInfo(id=job_id, status="queued"),
        created_at=_to_iso(now),
        updated_at=_to_iso(now),
    )


def get_analysis_status(user_id: str, analysis_id: str) -> AnalysisStatusResponse | None:
    with SessionLocal() as session:
        record = session.query(Analysis).filter(Analysis.id == analysis_id, Analysis.user_id == user_id).first()
        if record is None:
            return None
        return _to_status_response(record)


def advance_analysis_state(
    user_id: str,
    analysis_id: str,
    *,
    status: str = "completed",
    progress_stage: str | None = None,
) -> AnalysisStatusResponse | None:
    with SessionLocal() as session:
        record = session.query(Analysis).filter(Analysis.id == analysis_id, Analysis.user_id == user_id).first()
        if record is None:
            return None

        _set_state(record, status, progress_stage=progress_stage)
        session.commit()
        session.refresh(record)
        return _to_status_response(record)


def get_analysis_result(user_id: str, analysis_id: str) -> PredictResponse | None:
    with SessionLocal() as session:
        record = session.query(Analysis).filter(Analysis.id == analysis_id, Analysis.user_id == user_id).first()
        if record is None or record.status != "completed" or not record.result_payload:
            return None
        return PredictResponse.model_validate(record.result_payload)


def list_analyses(user_id: str) -> ListAnalysesResponse:
    with SessionLocal() as session:
        records = (
            session.query(Analysis)
            .filter(Analysis.user_id == user_id)
            .order_by(Analysis.created_at.desc())
            .all()
        )

    return ListAnalysesResponse(
        analyses=[
            AnalysisListItem(
                analysis_id=r.id,
                status=r.status,
                created_at=_to_iso(r.created_at),
            )
            for r in records
        ]
    )
