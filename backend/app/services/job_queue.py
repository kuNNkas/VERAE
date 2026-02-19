from __future__ import annotations

import os
import uuid

from app.services.analyses_service import process_analysis_job

QUEUE_MODE = os.getenv("QUEUE_MODE", "inline").strip().lower()
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = os.getenv("QUEUE_NAME", "analyses")


def enqueue_analysis_job(analysis_id: str) -> str:
    """Enqueue analysis processing and return job id.

    Modes:
    - inline (default): execute immediately in API process (dev/tests fallback)
    - redis: push to RQ queue for dedicated worker process
    """
    if QUEUE_MODE == "redis":
        return _enqueue_redis(analysis_id)

    process_analysis_job(analysis_id)
    return str(uuid.uuid4())


def _enqueue_redis(analysis_id: str) -> str:
    from redis import Redis
    from rq import Queue

    connection = Redis.from_url(REDIS_URL)
    queue = Queue(QUEUE_NAME, connection=connection)
    job = queue.enqueue("app.services.analyses_service.process_analysis_job", analysis_id)
    return str(job.id)
