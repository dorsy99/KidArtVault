import re
from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings
from app.database import get_db
from app.deps import get_current_user, get_settings, require_admin
from app.models import KidCreate, KidUpdate

router = APIRouter(prefix="/api/kids", tags=["kids"])

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.get("")
def list_kids(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    with get_db(settings.db_path) as conn:
        rows = conn.execute(
            """
            SELECT k.id, k.name, k.birthdate, k.color, k.created_at,
                   COUNT(a.id) AS artwork_count
            FROM kids k
            LEFT JOIN artworks a ON a.kid_id = k.id
            GROUP BY k.id
            ORDER BY k.created_at ASC, k.id ASC
            """
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_kid(
    body: KidCreate,
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        cur = conn.execute(
            "INSERT INTO kids (name, birthdate, color) VALUES (?, ?, ?)",
            (body.name.strip(), body.birthdate, body.color),
        )
        conn.commit()
        kid_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, name, birthdate, color, created_at, 0 AS artwork_count FROM kids WHERE id = ?",
            (kid_id,),
        ).fetchone()
    return dict(row)


@router.patch("/{kid_id}")
def update_kid(
    kid_id: int,
    body: KidUpdate,
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        existing = conn.execute("SELECT * FROM kids WHERE id = ?", (kid_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

        name = body.name.strip() if body.name is not None else existing["name"]
        color = body.color if body.color is not None else existing["color"]
        if body.birthdate is not None:
            if body.birthdate == "":
                birthdate = None
            elif DATE_RE.match(body.birthdate):
                birthdate = body.birthdate
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="birthdate must be YYYY-MM-DD",
                )
        else:
            birthdate = existing["birthdate"]

        conn.execute(
            "UPDATE kids SET name = ?, birthdate = ?, color = ? WHERE id = ?",
            (name, birthdate, color, kid_id),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT k.id, k.name, k.birthdate, k.color, k.created_at,
                   COUNT(a.id) AS artwork_count
            FROM kids k
            LEFT JOIN artworks a ON a.kid_id = k.id
            WHERE k.id = ?
            GROUP BY k.id
            """,
            (kid_id,),
        ).fetchone()
    return dict(row)


@router.delete("/{kid_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kid(
    kid_id: int,
    user: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> None:
    with get_db(settings.db_path) as conn:
        existing = conn.execute("SELECT id FROM kids WHERE id = ?", (kid_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

        artworks = conn.execute(
            "SELECT original_filename, thumb_filename FROM artworks WHERE kid_id = ?",
            (kid_id,),
        ).fetchall()
        conn.execute("DELETE FROM kids WHERE id = ?", (kid_id,))
        conn.commit()

    for art in artworks:
        orig_file = settings.originals_dir / art["original_filename"]
        thumb_file = settings.thumbs_dir / art["thumb_filename"]
        orig_file.unlink(missing_ok=True)
        thumb_file.unlink(missing_ok=True)
        for parent, root in ((orig_file.parent, settings.originals_dir), (thumb_file.parent, settings.thumbs_dir)):
            if parent != root:
                try:
                    parent.rmdir()
                except OSError:
                    pass
