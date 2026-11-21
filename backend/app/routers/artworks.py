import json
import re
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

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
UPLOAD_CHUNK_SIZE = 1024 * 1024


def _escape_like(val: str) -> str:
    return val.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _validate_iso_date(raw: str) -> str:
    cleaned = raw.strip()
    if not DATE_RE.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="artwork_date must be YYYY-MM-DD",
        )
    try:
        date.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="artwork_date must be a valid calendar date (YYYY-MM-DD)",
        ) from exc
    return cleaned


async def _read_upload_bounded(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum size of {max_bytes // (1024 * 1024)}MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    raw = raw.strip()
    items: list[str]
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                items = [str(t).strip() for t in parsed if str(t).strip()]
            else:
                items = [t.strip() for t in raw.split(",") if t.strip()]
        except json.JSONDecodeError:
            items = [t.strip() for t in raw.split(",") if t.strip()]
    else:
        items = [t.strip() for t in raw.split(",") if t.strip()]
    return [t[:60] for t in items[:30]]


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
        clauses.append("LOWER(a.tags) LIKE ? ESCAPE '\\'")
        params.append(f'%"{_escape_like(tag.strip().lower())}"%')
    if date_from:
        clauses.append("a.artwork_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("a.artwork_date <= ?")
        params.append(date_to)
    if q:
        like = f"%{_escape_like(q.strip().lower())}%"
        clauses.append(
            "(LOWER(a.title) LIKE ? ESCAPE '\\' OR LOWER(a.notes) LIKE ? ESCAPE '\\' "
            "OR LOWER(a.tags) LIKE ? ESCAPE '\\' OR LOWER(a.location) LIKE ? ESCAPE '\\')"
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
    title: str = Form("", max_length=150),
    notes: str = Form("", max_length=4000),
    location: str = Form("", max_length=80),
    tags: str = Form("", max_length=2500),
    artwork_date: str = Form("", max_length=10),
    is_favorite: bool = Form(False),
    user: dict = Depends(require_contributor),
    settings: Settings = Depends(get_settings),
) -> dict:
    validated_date = _validate_iso_date(artwork_date) if artwork_date.strip() else ""

    with get_db(settings.db_path) as conn:
        kid = conn.execute("SELECT id, name FROM kids WHERE id = ?", (kid_id,)).fetchone()
        if not kid:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    raw_bytes = await _read_upload_bounded(file, settings.max_upload_bytes)
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    artwork_id = uuid.uuid4().hex
    try:
        orig_name, thumb_name, width, height, file_size, exif_date = process_and_save_artwork(
            raw_bytes,
            artwork_id,
            settings.originals_dir,
            settings.thumbs_dir,
            kid_name=kid["name"],
            artwork_date=validated_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    resolved_date = validated_date or exif_date or date.today().isoformat()
    parsed_tags = _parse_tags(tags)
    clean_title = title.strip()

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
    if body.artwork_date is not None:
        _validate_iso_date(body.artwork_date)

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
        tags_json = (
            json.dumps([t.strip()[:60] for t in body.tags[:30] if t.strip()])
            if body.tags is not None
            else existing["tags"]
        )
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


def _safe_unlink(base_dir: Path, filename: str) -> None:
    root = base_dir.resolve()
    target = (root / filename).resolve()
    if root not in target.parents:
        return
    target.unlink(missing_ok=True)
    if target.parent != root:
        try:
            target.parent.rmdir()
        except OSError:
            pass


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

    _safe_unlink(settings.originals_dir, row["original_filename"])
    _safe_unlink(settings.thumbs_dir, row["thumb_filename"])


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
