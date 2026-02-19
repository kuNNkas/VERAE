from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from pydantic import BaseModel

from app.core.observability import log_event, reset_correlation_id, set_correlation_id
from app.db.database import SessionLocal
from app.db.models import Analysis as AnalysisModel
from app.services.prediction_service import PredictRequest, PredictResponse, predict_payload


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _db_save_analysis(record: "AnalysisRecord", *, input_payload: dict | None = None) -> None:
    with SessionLocal() as session:
        row = session.get(AnalysisModel, record.analysis_id)
        if row is None:
            row = AnalysisModel(
                id=record.analysis_id,
                user_id=record.user_id,
                status=record.status,
                progress_stage=record.progress_stage,
                error_message=record.error_message,
                failure_reason=record.failure_reason,
                input_payload=input_payload,
                result_payload=None,
                created_at=_now_utc(),
                updated_at=_now_utc(),
            )
            session.add(row)
        else:
            row.status = record.status
            row.progress_stage = record.progress_stage
            row.error_message = record.error_message
            row.failure_reason = record.failure_reason
            row.updated_at = _now_utc()
            if record.result is not None:
                row.result_payload = record.result.model_dump()
        session.commit()


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


@dataclass
class AnalysisRecord:
    analysis_id: str
    user_id: str
    status: str
    progress_stage: str
    created_at: str
    updated_at: str
    upload: UploadMetadata
    lab: dict
    result: PredictResponse | None = None
    error_message: str | None = None
    failure_reason: str | None = None


_ANALYSES: dict[str, AnalysisRecord] = {}

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"processing"},
    "processing": {"completed", "failed"},
    "completed": set(),
    "failed": set(),
}


def _set_status(record: AnalysisRecord, next_status: str, *, progress_stage: str, error_message: str | None = None, failure_reason: str | None = None) -> None:
    if next_status != record.status:
        allowed = _ALLOWED_TRANSITIONS.get(record.status, set())
        if next_status not in allowed:
            raise ValueError(f"Invalid status transition: {record.status} -> {next_status}")
    record.status = next_status
    record.progress_stage = progress_stage
    record.error_message = error_message
    record.failure_reason = failure_reason
    record.updated_at = _now_iso()


def process_analysis_job(analysis_id: str, correlation_id: str | None = None) -> None:
    """Run model inference in background and store result. Sets status to completed or failed."""
    token = set_correlation_id(correlation_id or analysis_id)
    record = _ANALYSES.get(analysis_id)
    if record is None:
        log_event('analysis_job_missing', analysis_id=analysis_id)
        reset_correlation_id(token)
        return
    if not record.lab:
        record.status = "failed"
        record.progress_stage = "failed"
        record.failure_reason = "empty_lab_payload"
        record.error_message = "Lab payload is empty"
        record.updated_at = _now_iso()
        log_event('analysis_completed', analysis_id=analysis_id, status='failed', reason='empty_lab_payload')
        reset_correlation_id(token)
        return

    log_event('analysis_processing_started', analysis_id=analysis_id)
    record.status = "processing"
    record.progress_stage = "model_inference"
    record.updated_at = _now_iso()
    try:
        result = predict_payload(record.lab)
        record.result = result
        record.status = "completed"
        record.progress_stage = "completed"
        log_event('analysis_completed', analysis_id=analysis_id, status='success', result_status=result.status)
    except Exception as exc:
        record.status = "failed"
        record.progress_stage = "failed"
        record.failure_reason = "inference_error"
        record.error_message = str(exc)
        log_event('analysis_completed', analysis_id=analysis_id, status='failed', reason='inference_error')
    record.updated_at = _now_iso()
    _db_save_analysis(record)
    reset_correlation_id(token)


def create_analysis(user_id: str, payload: CreateAnalysisRequest) -> CreateAnalysisResponse:
    now = _now_iso()
    analysis_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    lab_dict = payload.lab.model_dump()
    record = AnalysisRecord(
        analysis_id=analysis_id,
        user_id=user_id,
        status="pending",
        progress_stage="queued",
        created_at=now,
        updated_at=now,
        upload=payload.upload,
        lab=lab_dict,
    )
    _ANALYSES[analysis_id] = record
    _db_save_analysis(record, input_payload=lab_dict)
    log_event(
        'analysis_created',
        analysis_id=analysis_id,
        user_id=user_id,
        correlation_id=analysis_id,
        upload_source=payload.upload.source,
    )

    return CreateAnalysisResponse(
        analysis_id=analysis_id,
        user_id=user_id,
        status="pending",
        progress_stage="queued",
        job=JobInfo(id=job_id, status="queued"),
        created_at=now,
        updated_at=now,
    )


def get_analysis_status(user_id: str, analysis_id: str) -> AnalysisStatusResponse | None:
    with SessionLocal() as session:
        row = session.get(AnalysisModel, analysis_id)
    if row is None or row.user_id != user_id:
        return None

    return AnalysisStatusResponse(
        analysis_id=row.id,
        status=row.status,
        progress_stage=row.progress_stage,
        error_code=row.failure_reason if row.status == "failed" else None,
        failure_diagnostic=row.failure_reason if row.status == "failed" else None,
        updated_at=row.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def advance_analysis_state(
    user_id: str,
    analysis_id: str,
    *,
    status: str = "completed",
    progress_stage: str | None = None,
) -> AnalysisStatusResponse | None:
    record = _ANALYSES.get(analysis_id)
    if record is None or record.user_id != user_id:
        return None

    _set_status(record, status, progress_stage=progress_stage or status)

    return AnalysisStatusResponse(
        analysis_id=record.analysis_id,
        status=record.status,
        progress_stage=record.progress_stage,
        error_code=record.failure_reason if record.status == "failed" else None,
        failure_diagnostic=record.failure_reason if record.status == "failed" else None,
        updated_at=record.updated_at,
    )


def get_analysis_result(user_id: str, analysis_id: str) -> PredictResponse | None:
    with SessionLocal() as session:
        row = session.get(AnalysisModel, analysis_id)
    if row is None or row.user_id != user_id:
        return None
    if row.status != "completed":
        return None
    if row.result_payload is None:
        mem = _ANALYSES.get(analysis_id)
        return mem.result if mem else None
    return PredictResponse.model_validate(row.result_payload)


class AnalysisListItem(BaseModel):
    analysis_id: str
    status: str
    created_at: str


class ListAnalysesResponse(BaseModel):
    analyses: list[AnalysisListItem]


def list_analyses(user_id: str) -> ListAnalysesResponse:
    with SessionLocal() as session:
        rows = (
            session.query(AnalysisModel)
            .filter(AnalysisModel.user_id == user_id)
            .order_by(AnalysisModel.created_at.desc())
            .all()
        )
    items = [
        AnalysisListItem(
            analysis_id=row.id,
            status=row.status,
            created_at=row.created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        for row in rows
    ]
    return ListAnalysesResponse(analyses=items)
