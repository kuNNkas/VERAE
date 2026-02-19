from app.services import job_queue


def test_enqueue_analysis_job_inline_executes_processor(monkeypatch) -> None:
    called: list[str] = []

    def _fake_process(analysis_id: str) -> None:
        called.append(analysis_id)

    monkeypatch.setattr(job_queue, "QUEUE_MODE", "inline")
    monkeypatch.setattr(job_queue, "process_analysis_job", _fake_process)

    job_id = job_queue.enqueue_analysis_job("analysis-1")

    assert called == ["analysis-1"]
    assert isinstance(job_id, str)
    assert len(job_id) > 0


def test_enqueue_analysis_job_redis_uses_backend(monkeypatch) -> None:
    monkeypatch.setattr(job_queue, "QUEUE_MODE", "redis")
    monkeypatch.setattr(job_queue, "_enqueue_redis", lambda analysis_id: f"job-for-{analysis_id}")

    job_id = job_queue.enqueue_analysis_job("analysis-2")

    assert job_id == "job-for-analysis-2"
