from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.analyses import router as analyses_router
from app.api.v1.auth import router as auth_router
from app.api.v1.predict import router as predict_router
from app.db.database import init_db


def create_app() -> FastAPI:
    app = FastAPI(title='VERAE B2C API', version='0.3.0')

    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    app.include_router(auth_router)
    app.include_router(analyses_router)
    app.include_router(predict_router)

    @app.on_event("startup")
    def on_startup() -> None:
        init_db()

    return app
