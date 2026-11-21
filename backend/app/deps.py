from fastapi import Depends, HTTPException, Request, status

from app.config import Settings
from app.database import get_db
from app.security import SESSION_COOKIE_NAME, password_fingerprint, verify_session_token


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    payload = verify_session_token(settings, token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT id, username, role, password_hash, totp_enabled, created_at FROM users WHERE id = ?",
            (payload["uid"],),
        ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    expected_pwh = password_fingerprint(row["password_hash"])
    if payload.get("pwh") != expected_pwh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated. Please log in again.",
        )
    user = dict(row)
    user.pop("password_hash", None)
    user["totp_enabled"] = bool(user["totp_enabled"])
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user


def require_contributor(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Contributor privileges required",
        )
    return user
