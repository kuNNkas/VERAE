from __future__ import annotations

import os

from redis import Redis
from rq import Queue, Worker

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = os.getenv("QUEUE_NAME", "analyses")


def run_worker() -> None:
    connection = Redis.from_url(REDIS_URL)
    queue = Queue(QUEUE_NAME, connection=connection)
    worker = Worker([queue], connection=connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    run_worker()
