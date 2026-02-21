from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.services.auth_service import UserRecord
from app.services.users_service import UserProfileResponse, UserProfileUpdate, get_user_profile, update_user_profile

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: UserRecord = Depends(get_current_user)) -> UserProfileResponse:
    try:
        return get_user_profile(current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/me", response_model=UserProfileResponse)
def patch_me(payload: UserProfileUpdate, current_user: UserRecord = Depends(get_current_user)) -> UserProfileResponse:
    try:
        return update_user_profile(current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
