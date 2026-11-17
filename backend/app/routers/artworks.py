import json
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.config import Settings
from app.database import get_db
from app.deps import get_current_user, get_settings, require_contributor
from app.images import process_and_save_artwork
from app.models import ArtworkUpdate

router = APIRouter(prefix="/api/artworks", tags=["artworks"])


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(t).strip() for t in parsed if str(t).strip()]
        except json.JSONDecodeError:
            pass
    return [t.strip() for t in raw.split(",") if t.strip()]


def _serialize_artwork(row) -> dict:
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags") or "[]")
    except json.JSONDecodeError:
        d["tags"] = []
    d["is_favorite"] = bool(d.get("is_favorite"))
    return d


@router.get("")
def list_artworks(
    kid_id: int | None = Query(default=None),
    location: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    favorite: bool | None = Query(default=None),
    q: str | None = Query(default=None),
    date_from: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    sort: str = Query(default="newest", pattern=r"^(newest|oldest)$"),
    limit: int = Query(default=60, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    clauses = ["1=1"]
    params: list = []

    if kid_id is not None:
        clauses.append("a.kid_id = ?")
        params.append(kid_id)
    if location:
        clauses.append("LOWER(a.location) = LOWER(?)")
        params.append(location.strip())
    if favorite is True:
        clauses.append("a.is_favorite = 1")
    if tag:
        clauses.append("LOWER(a.tags) LIKE ?")
        params.append(f'%"{tag.strip().lower()}"%')
    if date_from:
        clauses.append("a.artwork_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("a.artwork_date <= ?")
        params.append(date_to)
    if q:
        like = f"%{q.strip().lower()}%"
        clauses.append(
            "(LOWER(a.title) LIKE ? OR LOWER(a.notes) LIKE ? OR LOWER(a.tags) LIKE ? OR LOWER(a.location) LIKE ?)"
        )
        params.extend([like, like, like, like])

    where_sql = " AND ".join(clauses)
    order_sql = (
        "a.artwork_date ASC, a.created_at ASC"
        if sort == "oldest"
        else "a.artwork_date DESC, a.created_at DESC"
    )

    with get_db(settings.db_path) as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM artworks a WHERE {where_sql}",
            params,
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
            FROM artworks a
            JOIN kids k ON k.id = a.kid_id
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()

    return {
        "total": total,
        "items": [_serialize_artwork(r) for r in rows],
    }


@router.get("/meta/facets")
def get_facets(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Return distinct tags and locations used across all artworks."""
    tags_set: dict[str, str] = {}
    locations_set: dict[str, str] = {}
    with get_db(settings.db_path) as conn:
        rows = conn.execute("SELECT tags, location FROM artworks").fetchall()
    for row in rows:
        loc = (row["location"] or "").strip()
        if loc and loc.lower() not in locations_set:
            locations_set[loc.lower()] = loc
        try:
            parsed = json.loads(row["tags"] or "[]")
        except json.JSONDecodeError:
            parsed = []
        for t in parsed:
            clean = str(t).strip()
            if clean and clean.lower() not in tags_set:
                tags_set[clean.lower()] = clean
    return {
        "locations": sorted(locations_set.values(), key=str.lower),
        "tags": sorted(tags_set.values(), key=str.lower),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_artwork(
    file: UploadFile = File(...),
    kid_id: int = Form(...),
    title: str = Form(""),
    notes: str = Form(""),
    location: str = Form(""),
    tags: str = Form(""),
    artwork_date: str = Form(""),
    is_favorite: bool = Form(False),
    user: dict = Depends(require_contributor),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        kid = conn.execute("SELECT id, name FROM kids WHERE id = ?", (kid_id,)).fetchone()
        if not kid:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(raw_bytes) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.max_upload_bytes // (1024 * 1024)}MB.",
        )

    artwork_id = uuid.uuid4().hex
    try:
        orig_name, thumb_name, width, height, file_size, exif_date = process_and_save_artwork(
            raw_bytes,
            artwork_id,
            settings.originals_dir,
            settings.thumbs_dir,
            kid_name=kid["name"],
            artwork_date=artwork_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    resolved_date = artwork_date.strip() or exif_date or date.today().isoformat()
    parsed_tags = _parse_tags(tags)
    clean_title = title.strip() or "Untitled Artwork"

    with get_db(settings.db_path) as conn:
        conn.execute(
            """
            INSERT INTO artworks (
                id, kid_id, title, notes, location, tags, artwork_date, is_favorite,
                original_filename, thumb_filename, width, height, file_size
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                artwork_id,
                kid_id,
                clean_title,
                notes.strip(),
                location.strip(),
                json.dumps(parsed_tags),
                resolved_date,
                1 if is_favorite else 0,
                orig_name,
                thumb_name,
                width,
                height,
                file_size,
            ),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
            FROM artworks a
            JOIN kids k ON k.id = a.kid_id
            WHERE a.id = ?
            """,
            (artwork_id,),
        ).fetchone()

    return _serialize_artwork(row)


@router.get("/{artwork_id}")
def get_artwork(
    artwork_id: str,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            """
            SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
            FROM artworks a
            JOIN kids k ON k.id = a.kid_id
            WHERE a.id = ?
            """,
            (artwork_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
    return _serialize_artwork(row)


@router.patch("/{artwork_id}")
def update_artwork(
    artwork_id: str,
    body: ArtworkUpdate,
    user: dict = Depends(require_contributor),
    settings: Settings = Depends(get_settings),
) -> dict:
    with get_db(settings.db_path) as conn:
        existing = conn.execute("SELECT * FROM artworks WHERE id = ?", (artwork_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")

        kid_id = body.kid_id if body.kid_id is not None else existing["kid_id"]
        if body.kid_id is not None:
            kid = conn.execute("SELECT id FROM kids WHERE id = ?", (kid_id,)).fetchone()
            if not kid:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

        title = body.title.strip() if body.title is not None else existing["title"]
        notes = body.notes.strip() if body.notes is not None else existing["notes"]
        location = body.location.strip() if body.location is not None else existing["location"]
        tags_json = json.dumps([t.strip() for t in body.tags if t.strip()]) if body.tags is not None else existing["tags"]
        artwork_date = body.artwork_date if body.artwork_date is not None else existing["artwork_date"]
        is_favorite = (1 if body.is_favorite else 0) if body.is_favorite is not None else existing["is_favorite"]

        conn.execute(
            """
            UPDATE artworks
            SET kid_id = ?, title = ?, notes = ?, location = ?, tags = ?,
                artwork_date = ?, is_favorite = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (kid_id, title, notes, location, tags_json, artwork_date, is_favorite, artwork_id),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT a.*, k.name AS kid_name, k.birthdate AS kid_birthdate, k.color AS kid_color
            FROM artworks a
            JOIN kids k ON k.id = a.kid_id
            WHERE a.id = ?
            """,
            (artwork_id,),
        ).fetchone()
    return _serialize_artwork(row)


@router.delete("/{artwork_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artwork(
    artwork_id: str,
    user: dict = Depends(require_contributor),
    settings: Settings = Depends(get_settings),
) -> None:
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT original_filename, thumb_filename FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
        conn.execute("DELETE FROM artworks WHERE id = ?", (artwork_id,))
        conn.commit()

    orig_file = settings.originals_dir / row["original_filename"]
    thumb_file = settings.thumbs_dir / row["thumb_filename"]
    orig_file.unlink(missing_ok=True)
    thumb_file.unlink(missing_ok=True)
    for parent, root in ((orig_file.parent, settings.originals_dir), (thumb_file.parent, settings.thumbs_dir)):
        if parent != root:
            try:
                parent.rmdir()
            except OSError:
                pass


def _safe_file_response(base_dir: Path, filename: str) -> FileResponse:
    target = (base_dir / filename).resolve()
    if base_dir.resolve() not in target.parents or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(target, headers={"Cache-Control": "private, max-age=86400"})


@router.get("/{artwork_id}/image")
def get_artwork_image(
    artwork_id: str,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT original_filename FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
    return _safe_file_response(settings.originals_dir, row["original_filename"])


@router.get("/{artwork_id}/thumb")
def get_artwork_thumb(
    artwork_id: str,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    with get_db(settings.db_path) as conn:
        row = conn.execute(
            "SELECT thumb_filename FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")
    return _safe_file_response(settings.thumbs_dir, row["thumb_filename"])
