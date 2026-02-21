from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.db.database import SessionLocal
from app.repositories.user_repository import UserRepository
from app.services.auth_service import UserRecord


class UserProfileResponse(BaseModel):
    id: str
    email: str
    first_name: str | None = None
    last_name: str | None = None
    default_age: int | None = None
    default_gender: int | None = None
    default_height: float | None = None
    default_weight: float | None = None
    created_at: str


class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = None
    last_name: str | None = None
    default_age: int | None = Field(default=None, ge=0, le=120)
    default_gender: int | None = Field(default=None, ge=1, le=2)
    default_height: float | None = Field(default=None, gt=0, le=300)
    default_weight: float | None = Field(default=None, gt=0, le=500)


def _to_profile(user) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        default_age=user.default_age,
        default_gender=user.default_gender,
        default_height=user.default_height,
        default_weight=user.default_weight,
        created_at=user.created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def get_user_profile(current_user: UserRecord) -> UserProfileResponse:
    with SessionLocal() as session:
        repository = UserRepository(session)
        user = repository.get_by_id(current_user.id)
        if user is None:
            raise ValueError("User not found")
        return _to_profile(user)


def update_user_profile(current_user: UserRecord, payload: UserProfileUpdate) -> UserProfileResponse:
    update_data = payload.model_dump(exclude_unset=True)
    with SessionLocal() as session:
        repository = UserRepository(session)
        user = repository.get_by_id(current_user.id)
        if user is None:
            raise ValueError("User not found")

        for field_name, field_value in update_data.items():
            setattr(user, field_name, field_value)

        session.commit()
        session.refresh(user)
        return _to_profile(user)
