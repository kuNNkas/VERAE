from fastapi import Header, HTTPException, status

from app.services.auth_service import UserRecord, decode_token


def get_current_user(authorization: str | None = Header(default=None)) -> UserRecord:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "missing_token", "message": "Missing/invalid JWT token"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "invalid_token", "message": "Missing/invalid JWT token"},
        )

    return decode_token(token.strip())
