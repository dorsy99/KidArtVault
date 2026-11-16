import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings
from app.database import get_db
from app.deps import get_settings, require_admin
from app.models import UserCreate, UserUpdate
from app.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _serialize_user(row) -> dict:
    d = dict(row)
    d["totp_enabled"] = bool(d["totp_enabled"])
    return d


@router.get("")
def list_users(
    admin: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    with get_db(settings.db_path) as conn:
        rows = conn.execute(
            "SELECT id, username, role, totp_enabled, created_at FROM users ORDER BY id ASC"
        ).fetchall()
    return [_serialize_user(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    admin: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    username = body.username.strip()
    pw_hash = hash_password(body.password)
    with get_db(settings.db_path) as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, pw_hash, body.role),
            )
            conn.commit()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists.",
            ) from exc
        row = conn.execute(
            "SELECT id, username, role, totp_enabled, created_at FROM users WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return _serialize_user(row)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdate,
    admin: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        existing = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        new_role = body.role if body.role is not None else existing["role"]
        if existing["role"] == "admin" and new_role != "admin":
            admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote the last admin user.",
                )

        new_hash = hash_password(body.password) if body.password is not None else existing["password_hash"]
        conn.execute(
            "UPDATE users SET role = ?, password_hash = ? WHERE id = ?",
            (new_role, new_hash, user_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, username, role, totp_enabled, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return _serialize_user(row)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    admin: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> None:
    if user_id == admin["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )
    with get_db(settings.db_path) as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
