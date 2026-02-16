from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from jose import JWTError, ExpiredSignatureError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field

from app.db.database import SessionLocal
from app.db.models import User
from app.repositories.user_repository import UserRepository

TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "3600"))
TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET", "dev-secret-change-me")
TOKEN_ALGORITHM = os.getenv("AUTH_TOKEN_ALGORITHM", "HS256")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserInfo(BaseModel):
    id: str
    email: str
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserInfo


@dataclass
class UserRecord:
    id: str
    email: str
    password_hash: str
    created_at: str


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_record(user: User) -> UserRecord:
    created_at = user.created_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    return UserRecord(id=user.id, email=user.email, password_hash=user.password_hash, created_at=created_at)


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _build_token(user_id: str, expires_in: int) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(payload, TOKEN_SECRET, algorithm=TOKEN_ALGORITHM)


def decode_token(token: str) -> UserRecord:
    try:
        payload = jwt.decode(token, TOKEN_SECRET, algorithms=[TOKEN_ALGORITHM])
    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "token_expired", "message": "Missing/invalid JWT token"},
        ) from exc
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "invalid_token", "message": "Missing/invalid JWT token"},
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "invalid_token", "message": "Missing/invalid JWT token"},
        )

    with SessionLocal() as session:
        repository = UserRepository(session)
        user = repository.get_by_id(user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "user_not_found", "message": "Missing/invalid JWT token"},
        )

    return _to_record(user)


def register_user(payload: RegisterRequest) -> AuthResponse:
    email = payload.email.lower().strip()

    with SessionLocal() as session:
        repository = UserRepository(session)
        if repository.get_by_email(email):
            raise ValueError("User with this email already exists")

        user = repository.create(
            User(
                id=str(uuid.uuid4()),
                email=email,
                password_hash=_hash_password(payload.password),
                created_at=_now_utc(),
            )
        )

    return AuthResponse(
        access_token=_build_token(user.id, TOKEN_TTL_SECONDS),
        expires_in=TOKEN_TTL_SECONDS,
        user=UserInfo(id=user.id, email=user.email, created_at=user.created_at.strftime("%Y-%m-%dT%H:%M:%SZ")),
    )


def login_user(payload: LoginRequest) -> AuthResponse:
    email = payload.email.lower().strip()

    with SessionLocal() as session:
        repository = UserRepository(session)
        user = repository.get_by_email(email)

    if user is None or not _verify_password(payload.password, user.password_hash):
        raise PermissionError("Invalid credentials")

    return AuthResponse(
        access_token=_build_token(user.id, TOKEN_TTL_SECONDS),
        expires_in=TOKEN_TTL_SECONDS,
        user=UserInfo(id=user.id, email=user.email, created_at=user.created_at.strftime("%Y-%m-%dT%H:%M:%SZ")),
    )
