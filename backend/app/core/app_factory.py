import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.analyses import router as analyses_router
from app.api.v1.auth import router as auth_router
from app.api.v1.predict import router as predict_router
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
    env_origins = _parse_origins(os.getenv('CORS_ALLOW_ORIGINS'))
    if env_origins:
        return env_origins

    app_env = os.getenv('APP_ENV', 'dev').strip().lower()
    if app_env == 'prod':
        return PROD_CORS_ORIGINS
    return DEV_CORS_ORIGINS


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db()
        yield

    app = FastAPI(title='VERAE B2C API', version='0.3.0', lifespan=lifespan)
    cors_origins = _resolve_cors_origins()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=bool(cors_origins),
        allow_methods=['*'],
        allow_headers=['*'],
    )

    app.include_router(auth_router)
    app.include_router(analyses_router)
    app.include_router(predict_router)

    return app
