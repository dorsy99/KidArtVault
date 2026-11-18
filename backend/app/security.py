import base64
import hashlib
import io
import time
from collections import defaultdict
from threading import Lock

import pyotp
import qrcode
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import Settings

SESSION_COOKIE_NAME = "kidart_session"
PENDING_2FA_COOKIE_NAME = "kidart_pending_2fa"

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def create_session_token(
    settings: Settings,
    user_id: int,
    username: str,
    password_hash: str = "",
) -> str:
    s = URLSafeTimedSerializer(settings.secret_key, salt="kidart-session-v1")
    payload: dict = {"uid": user_id, "usr": username}
    if password_hash:
        payload["pwh"] = password_fingerprint(password_hash)
    return s.dumps(payload)


def verify_session_token(settings: Settings, token: str) -> dict | None:
    s = URLSafeTimedSerializer(settings.secret_key, salt="kidart-session-v1")
    try:
        return s.loads(token, max_age=settings.session_max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None


def create_pending_2fa_token(settings: Settings, user_id: int) -> str:
    s = URLSafeTimedSerializer(settings.secret_key, salt="kidart-pending-2fa-v1")
    return s.dumps({"uid": user_id})


def verify_pending_2fa_token(settings: Settings, token: str) -> int | None:
    s = URLSafeTimedSerializer(settings.secret_key, salt="kidart-pending-2fa-v1")
    try:
        data = s.loads(token, max_age=settings.pending_2fa_max_age_seconds)
        return int(data["uid"])
    except (BadSignature, SignatureExpired, KeyError, ValueError):
        return None


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str, issuer: str = "KidArtVault") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)


def verify_totp_code(secret: str, code: str) -> bool:
    clean = code.strip().replace(" ", "")
    if not clean.isdigit() or len(clean) != 6:
        return False
    return pyotp.TOTP(secret).verify(clean, valid_window=1)


def generate_qr_data_uri(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Use the rightmost IP appended by the reverse proxy rather than the client-spoofable first entry
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[-1]
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """Thread-safe sliding-window rate limiter for auth endpoints."""

    def __init__(self, max_attempts: int = 10, window_seconds: int = 300, max_keys: int = 2048) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _prune_unlocked(self, cutoff: float) -> None:
        stale_keys = [k for k, ts in self._attempts.items() if not ts or ts[-1] <= cutoff]
        for k in stale_keys:
            self._attempts.pop(k, None)
        while len(self._attempts) >= self.max_keys:
            oldest_key = min(self._attempts, key=lambda k: self._attempts[k][-1] if self._attempts[k] else 0.0)
            self._attempts.pop(oldest_key, None)

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            if key not in self._attempts and len(self._attempts) >= self.max_keys:
                self._prune_unlocked(cutoff)
            recent = [t for t in self._attempts.get(key, []) if t > cutoff]
            if len(recent) >= self.max_attempts:
                self._attempts[key] = recent
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many authentication attempts. Please wait a few minutes and try again.",
                )
            recent.append(now)
            self._attempts[key] = recent

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


auth_rate_limiter = RateLimiter(max_attempts=12, window_seconds=300)
