from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
import uuid
from dataclasses import dataclass

from pydantic import BaseModel, Field

TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "3600"))
TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET", "dev-secret-change-me")


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


_USERS_BY_EMAIL: dict[str, UserRecord] = {}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _build_token(user_id: str, email: str, expires_in: int) -> str:
    expires_at = int(time.time()) + expires_in
    payload = f"{user_id}:{email}:{expires_at}"
    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    token_raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(token_raw.encode("utf-8")).decode("utf-8")


def register_user(payload: RegisterRequest) -> AuthResponse:
    email = payload.email.lower()
    if email in _USERS_BY_EMAIL:
        raise ValueError("User with this email already exists")

    user = UserRecord(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=_hash_password(payload.password),
        created_at=_now_iso(),
    )
    _USERS_BY_EMAIL[email] = user

    return AuthResponse(
        access_token=_build_token(user.id, user.email, TOKEN_TTL_SECONDS),
        expires_in=TOKEN_TTL_SECONDS,
        user=UserInfo(id=user.id, email=user.email, created_at=user.created_at),
    )


def login_user(payload: LoginRequest) -> AuthResponse:
    email = payload.email.lower()
    user = _USERS_BY_EMAIL.get(email)
    if user is None:
        raise PermissionError("Invalid credentials")

    if not hmac.compare_digest(user.password_hash, _hash_password(payload.password)):
        raise PermissionError("Invalid credentials")

    return AuthResponse(
        access_token=_build_token(user.id, user.email, TOKEN_TTL_SECONDS),
        expires_in=TOKEN_TTL_SECONDS,
        user=UserInfo(id=user.id, email=user.email, created_at=user.created_at),
    )
