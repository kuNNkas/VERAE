from fastapi import Depends, Header, HTTPException, status

from app.services.auth_service import UserRecord, decode_token


def get_current_user(authorization: str | None = Header(default=None)) -> UserRecord:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "missing_token", "message": "Missing/invalid JWT token"},
        )
    token = authorization.split(" ", 1)[1].strip()
    return decode_token(token)
