from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.config import Settings
from app.database import get_db
from app.deps import get_current_user, get_settings
from app.models import (
    ChangePasswordRequest,
    Disable2FARequest,
    Enable2FARequest,
    LoginRequest,
    SetupRequest,
    Verify2FARequest,
)
from app.security import (
    PENDING_2FA_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    auth_rate_limiter,
    create_pending_2fa_token,
    create_session_token,
    generate_qr_data_uri,
    generate_totp_secret,
    get_client_ip,
    get_totp_uri,
    hash_password,
    verify_password,
    verify_pending_2fa_token,
    verify_totp_code,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.get("/status")
def auth_status(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    with get_db(settings.db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    needs_setup = count == 0

    authenticated = False
    user = None
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token and not needs_setup:
        payload = None
        from app.security import verify_session_token

        payload = verify_session_token(settings, token)
        if payload:
            with get_db(settings.db_path) as conn:
                row = conn.execute(
                    "SELECT id, username, totp_enabled, created_at FROM users WHERE id = ?",
                    (payload["uid"],),
                ).fetchone()
            if row:
                authenticated = True
                user = dict(row)

    return {
        "needs_setup": needs_setup,
        "authenticated": authenticated,
        "user": user,
    }


@router.post("/setup", status_code=status.HTTP_201_CREATED)
def setup_admin(
    body: SetupRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    username = body.username.strip()
    pw_hash = hash_password(body.password)

    with get_db(settings.db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Initial setup has already been completed.",
            )
        cur = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, pw_hash),
        )
        conn.commit()
        user_id = cur.lastrowid

    token = create_session_token(settings, user_id, username)
    _set_session_cookie(response, settings, token)
    return {
        "user": {
            "id": user_id,
            "username": username,
            "totp_enabled": False,
        }
    }


@router.post("/login")
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    ip = get_client_ip(request)
    auth_rate_limiter.check(f"login:{ip}")

    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, totp_enabled FROM users WHERE username = ?",
            (body.username.strip(),),
        ).fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    if row["totp_enabled"]:
        pending_token = create_pending_2fa_token(settings, row["id"])
        response.set_cookie(
            key=PENDING_2FA_COOKIE_NAME,
            value=pending_token,
            max_age=settings.pending_2fa_max_age_seconds,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )
        return {"requires_2fa": True}

    auth_rate_limiter.reset(f"login:{ip}")
    token = create_session_token(settings, row["id"], row["username"])
    _set_session_cookie(response, settings, token)
    return {
        "requires_2fa": False,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "totp_enabled": bool(row["totp_enabled"]),
        },
    }


@router.post("/verify-2fa")
def verify_2fa(
    body: Verify2FARequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    ip = get_client_ip(request)
    auth_rate_limiter.check(f"2fa:{ip}")

    pending_token = request.cookies.get(PENDING_2FA_COOKIE_NAME)
    if not pending_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="2FA session expired. Please log in again.",
        )

    user_id = verify_pending_2fa_token(settings, pending_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="2FA session expired. Please log in again.",
        )

    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if not row or not row["totp_enabled"] or not row["totp_secret"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not configured for this user.",
        )

    if not verify_totp_code(row["totp_secret"], body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticator code.",
        )

    auth_rate_limiter.reset(f"2fa:{ip}")
    auth_rate_limiter.reset(f"login:{ip}")
    response.delete_cookie(PENDING_2FA_COOKIE_NAME, path="/")
    token = create_session_token(settings, row["id"], row["username"])
    _set_session_cookie(response, settings, token)
    return {
        "user": {
            "id": row["id"],
            "username": row["username"],
            "totp_enabled": True,
        }
    }


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(PENDING_2FA_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    return {"user": user}


@router.post("/2fa/setup")
def begin_2fa_setup(user: dict = Depends(get_current_user)) -> dict:
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, user["username"])
    qr_data_uri = generate_qr_data_uri(uri)
    return {
        "secret": secret,
        "otpauth_uri": uri,
        "qr_data_uri": qr_data_uri,
    }


@router.post("/2fa/enable")
def enable_2fa(
    body: Enable2FARequest,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    if not verify_totp_code(body.secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Make sure your device clock is accurate.",
        )
    with get_db(settings.db_path) as conn:
        conn.execute(
            "UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?",
            (body.secret, user["id"]),
        )
        conn.commit()
    return {"totp_enabled": True}


@router.post("/2fa/disable")
def disable_2fa(
    body: Disable2FARequest,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password.",
            )
        if row["totp_enabled"] and row["totp_secret"]:
            if not verify_totp_code(row["totp_secret"], body.code):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authenticator code.",
                )
        conn.execute(
            "UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?",
            (user["id"],),
        )
        conn.commit()
    return {"totp_enabled": False}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        if not row or not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect.",
            )
        new_hash = hash_password(body.new_password)
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_hash, user["id"]),
        )
        conn.commit()
    return {"ok": True}
