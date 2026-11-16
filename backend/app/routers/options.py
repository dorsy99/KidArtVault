from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings
from app.database import get_db
from app.deps import get_current_user, get_settings, require_admin

router = APIRouter(prefix="/api/options", tags=["options"])

VALID_KINDS = {"location", "tag"}


class OptionCreate(BaseModel):
    value: str = Field(min_length=1, max_length=60)


def _list_options(conn) -> dict:
    rows = conn.execute(
        "SELECT kind, value FROM vault_options ORDER BY LOWER(value) ASC"
    ).fetchall()
    return {
        "locations": [r["value"] for r in rows if r["kind"] == "location"],
        "tags": [r["value"] for r in rows if r["kind"] == "tag"],
    }


@router.get("")
def get_options(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        return _list_options(conn)


@router.post("/{kind}", status_code=status.HTTP_201_CREATED)
def add_option(
    kind: str,
    body: OptionCreate,
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid option kind")
    clean = body.value.strip()
    if not clean:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Value cannot be empty")

    with get_db(settings.db_path) as conn:
        existing = conn.execute(
            "SELECT value FROM vault_options WHERE kind = ? AND LOWER(value) = LOWER(?)",
            (kind, clean),
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO vault_options (kind, value) VALUES (?, ?)",
                (kind, clean),
            )
            conn.commit()
        return _list_options(conn)


@router.delete("/{kind}")
def remove_option(
    kind: str,
    value: str = Query(..., min_length=1),
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid option kind")

    with get_db(settings.db_path) as conn:
        conn.execute(
            "DELETE FROM vault_options WHERE kind = ? AND LOWER(value) = LOWER(?)",
            (kind, value.strip()),
        )
        conn.commit()
        return _list_options(conn)
