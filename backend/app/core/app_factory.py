import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.api.v1.analyses import router as analyses_router
from app.api.v1.auth import router as auth_router
from app.api.v1.predict import router as predict_router
from app.api.v1.users import router as users_router
from app.core.observability import generate_correlation_id, reset_correlation_id, set_correlation_id
from app.db.database import init_db


DEV_CORS_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
]
PROD_CORS_ORIGINS = ['https://app.verae.ai']


def _parse_origins(raw_origins: str | None) -> list[str]:
    if not raw_origins:
        return []
    return [origin.strip() for origin in raw_origins.split(',') if origin.strip()]


def _resolve_cors_origins() -> list[str]:
    app_env = os.getenv('APP_ENV', 'dev').strip().lower()
    env_origins = _parse_origins(os.getenv('CORS_ALLOW_ORIGINS'))

    if app_env == 'prod':
        # In production we require explicit allowlist and reject wildcard origins.
        if not env_origins:
            raise RuntimeError('CORS_ALLOW_ORIGINS must be set in production')
        if '*' in env_origins:
            raise RuntimeError('Wildcard CORS origin is not allowed in production')
        return env_origins

    if env_origins:
        return env_origins
    return DEV_CORS_ORIGINS


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db()
        yield

    app = FastAPI(title='VERAE B2C API', version='0.3.0', lifespan=lifespan)
    logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
    cors_origins = _resolve_cors_origins()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=bool(cors_origins),
        allow_methods=['*'],
        allow_headers=['*'],
    )

    @app.middleware('http')
    async def correlation_middleware(request: Request, call_next) -> Response:
        correlation_id = request.headers.get('x-correlation-id') or request.headers.get('x-request-id') or generate_correlation_id()
        token = set_correlation_id(correlation_id)
        try:
            response = await call_next(request)
        finally:
            reset_correlation_id(token)
        response.headers['x-correlation-id'] = correlation_id
        return response

    app.include_router(auth_router)
    app.include_router(analyses_router)
    app.include_router(users_router)
    app.include_router(predict_router)

    return app
