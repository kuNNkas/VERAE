from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from pydantic import BaseModel

from app.services.prediction_service import PredictRequest, PredictResponse, predict_payload


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


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


def process_analysis_job(analysis_id: str) -> None:
    """Run model inference in background and store result. Sets status transitions pending->processing->completed|failed."""
    record = _ANALYSES.get(analysis_id)
    if record is None:
        return

    if record.status in {"completed", "failed"}:
        return

    _set_status(record, "processing", progress_stage="model_inference")

    try:
        result = predict_payload(record.lab)
        record.result = result
        _set_status(record, "completed", progress_stage="completed")
    except Exception:
        record.result = None
        _set_status(
            record,
            "failed",
            progress_stage="failed",
            error_message="analysis processing failed",
            failure_reason="inference_error",
        )


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
    record = _ANALYSES.get(analysis_id)
    if record is None or record.user_id != user_id:
        return None

    return AnalysisStatusResponse(
        analysis_id=record.analysis_id,
        status=record.status,
        progress_stage=record.progress_stage,
        error_code=record.failure_reason if record.status == "failed" else None,
        failure_diagnostic=record.failure_reason if record.status == "failed" else None,
        updated_at=record.updated_at,
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
    record = _ANALYSES.get(analysis_id)
    if record is None or record.user_id != user_id:
        return None
    if record.status != "completed":
        return None
    return record.result


class AnalysisListItem(BaseModel):
    analysis_id: str
    status: str
    created_at: str


class ListAnalysesResponse(BaseModel):
    analyses: list[AnalysisListItem]


def list_analyses(user_id: str) -> ListAnalysesResponse:
    items = [
        AnalysisListItem(
            analysis_id=r.analysis_id,
            status=r.status,
            created_at=r.created_at,
        )
        for r in _ANALYSES.values()
        if r.user_id == user_id
    ]
    items.sort(key=lambda x: x.created_at, reverse=True)
    return ListAnalysesResponse(analyses=items)
