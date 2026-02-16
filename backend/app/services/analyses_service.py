from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass

from pydantic import BaseModel


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
    updated_at: str


class AnalysisResultResponse(BaseModel):
    score: float
    decision: str
    explanation_summary: str


@dataclass
class AnalysisRecord:
    analysis_id: str
    user_id: str
    status: str
    progress_stage: str
    created_at: str
    updated_at: str
    upload: UploadMetadata


_ANALYSES: dict[str, AnalysisRecord] = {}


def _derive_result(record: AnalysisRecord) -> AnalysisResultResponse:
    digest = hashlib.sha256(
        f"{record.analysis_id}:{record.upload.filename}:{record.upload.size_bytes}".encode("utf-8")
    ).hexdigest()
    score = (int(digest[:8], 16) % 1000) / 1000

    if score < 0.33:
        decision = "low_risk"
    elif score < 0.66:
        decision = "medium_risk"
    else:
        decision = "high_risk"

    summary = (
        "Анализ обработан. Итоговая оценка сформирована для MVP-пайплайна "
        "(deterministic placeholder до подключения полного production workflow)."
    )
    return AnalysisResultResponse(score=round(score, 3), decision=decision, explanation_summary=summary)


def create_analysis(user_id: str, payload: CreateAnalysisRequest) -> CreateAnalysisResponse:
    now = _now_iso()
    analysis_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    record = AnalysisRecord(
        analysis_id=analysis_id,
        user_id=user_id,
        status="queued",
        progress_stage="queued",
        created_at=now,
        updated_at=now,
        upload=payload.upload,
    )
    _ANALYSES[analysis_id] = record

    return CreateAnalysisResponse(
        analysis_id=analysis_id,
        user_id=user_id,
        status="queued",
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
        error_code=None,
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

    record.status = status
    record.progress_stage = progress_stage or status
    record.updated_at = _now_iso()

    return AnalysisStatusResponse(
        analysis_id=record.analysis_id,
        status=record.status,
        progress_stage=record.progress_stage,
        error_code=None,
        updated_at=record.updated_at,
    )


def get_analysis_result(user_id: str, analysis_id: str) -> AnalysisResultResponse | None:
    record = _ANALYSES.get(analysis_id)
    if record is None or record.user_id != user_id:
        return None

    if record.status != "completed":
        return AnalysisResultResponse(score=-1, decision="low_risk", explanation_summary="PENDING")

    return _derive_result(record)
