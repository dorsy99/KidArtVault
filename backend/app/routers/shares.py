import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.config import Settings
from app.database import get_db
from app.deps import get_settings, require_admin
from app.models import ShareCreate
from app.routers.artworks import _safe_file_response

router = APIRouter(tags=["shares"])


def _serialize_public_artwork(row) -> dict:
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags") or "[]")
    except json.JSONDecodeError:
        d["tags"] = []
    d["is_favorite"] = bool(d.get("is_favorite"))
    # Strip internal filenames from public responses
    d.pop("original_filename", None)
    d.pop("thumb_filename", None)
    return d


def _validate_share_token(conn, token: str) -> dict:
    share = conn.execute(
        """
        SELECT s.*, k.name AS kid_name
        FROM share_links s
        LEFT JOIN kids k ON k.id = s.kid_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found or revoked")

    if share["expires_at"]:
        expires = datetime.fromisoformat(share["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="This share link has expired")

    return dict(share)


@router.get("/api/shares")
def list_shares(
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    with get_db(settings.db_path) as conn:
        rows = conn.execute(
            """
            SELECT s.*, k.name AS kid_name, a.title AS artwork_title
            FROM share_links s
            LEFT JOIN kids k ON k.id = s.kid_id
            LEFT JOIN artworks a ON a.id = s.artwork_id
            ORDER BY s.created_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/shares", status_code=status.HTTP_201_CREATED)
def create_share(
    body: ShareCreate,
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    if body.kid_id is not None and body.artwork_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specify either kid_id or artwork_id, not both.",
        )

    with get_db(settings.db_path) as conn:
        if body.kid_id is not None:
            if not conn.execute("SELECT id FROM kids WHERE id = ?", (body.kid_id,)).fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
        if body.artwork_id is not None:
            if not conn.execute("SELECT id FROM artworks WHERE id = ?", (body.artwork_id,)).fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")

        token = secrets.token_urlsafe(18)
        expires_at = None
        if body.expires_days is not None:
            expires_at = (datetime.now(timezone.utc) + timedelta(days=body.expires_days)).isoformat()

        conn.execute(
            """
            INSERT INTO share_links (token, label, kid_id, artwork_id, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (token, body.label.strip(), body.kid_id, body.artwork_id, expires_at),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT s.*, k.name AS kid_name, a.title AS artwork_title
            FROM share_links s
            LEFT JOIN kids k ON k.id = s.kid_id
            LEFT JOIN artworks a ON a.id = s.artwork_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    return dict(row)


@router.delete("/api/shares/{token}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(
    token: str,
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> None:
    with get_db(settings.db_path) as conn:
        cur = conn.execute("DELETE FROM share_links WHERE token = ?", (token,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")


@router.get("/api/public/share/{token}")
def get_public_share(
    token: str,
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        share = _validate_share_token(conn, token)

        if share["artwork_id"]:
            rows = conn.execute(
                """
                SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
                FROM artworks a
                JOIN kids k ON k.id = a.kid_id
                WHERE a.id = ?
                """,
                (share["artwork_id"],),
            ).fetchall()
        elif share["kid_id"]:
            rows = conn.execute(
                """
                SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
                FROM artworks a
                JOIN kids k ON k.id = a.kid_id
                WHERE a.kid_id = ?
                ORDER BY a.artwork_date DESC, a.created_at DESC
                """,
                (share["kid_id"],),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
                FROM artworks a
                JOIN kids k ON k.id = a.kid_id
                ORDER BY a.artwork_date DESC, a.created_at DESC
                """
            ).fetchall()

    return {
        "share": {
            "label": share["label"],
            "kid_name": share.get("kid_name"),
            "expires_at": share["expires_at"],
        },
        "artworks": [_serialize_public_artwork(r) for r in rows],
    }


def _get_scoped_artwork_file(settings: Settings, token: str, artwork_id: str, column: str, base_dir) -> FileResponse:
    with get_db(settings.db_path) as conn:
        share = _validate_share_token(conn, token)
        if share["artwork_id"] and share["artwork_id"] != artwork_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not in share scope")
        if share["kid_id"]:
            row = conn.execute(
                f"SELECT {column} FROM artworks WHERE id = ? AND kid_id = ?",
                (artwork_id, share["kid_id"]),
            ).fetchone()
        else:
            row = conn.execute(
                f"SELECT {column} FROM artworks WHERE id = ?",
                (artwork_id,),
            ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
    return _safe_file_response(base_dir, row[column])


@router.get("/api/public/share/{token}/artworks/{artwork_id}/thumb")
def get_public_share_thumb(
    token: str,
    artwork_id: str,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    return _get_scoped_artwork_file(settings, token, artwork_id, "thumb_filename", settings.thumbs_dir)


@router.get("/api/public/share/{token}/artworks/{artwork_id}/image")
def get_public_share_image(
    token: str,
    artwork_id: str,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    return _get_scoped_artwork_file(settings, token, artwork_id, "original_filename", settings.originals_dir)
