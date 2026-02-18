from __future__ import annotations

import contextvars
import json
import logging
import time
import uuid
from typing import Any


_correlation_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("correlation_id", default=None)


def generate_correlation_id() -> str:
    return str(uuid.uuid4())


def get_correlation_id() -> str | None:
    return _correlation_id_ctx.get()


def set_correlation_id(correlation_id: str) -> contextvars.Token[str | None]:
    return _correlation_id_ctx.set(correlation_id)


def reset_correlation_id(token: contextvars.Token[str | None]) -> None:
    _correlation_id_ctx.reset(token)


def log_event(event: str, **fields: Any) -> None:
    payload: dict[str, Any] = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event": event,
        **fields,
    }
    correlation_id = fields.get("correlation_id") or get_correlation_id()
    if correlation_id:
        payload["correlation_id"] = correlation_id

    logging.getLogger("verae").info(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

