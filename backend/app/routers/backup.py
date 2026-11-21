import json
import re
import tempfile
import uuid
import zipfile
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import Settings
from app.database import get_db
from app.deps import get_settings, require_admin
from app.images import restore_artwork_files

router = APIRouter(prefix="/api/backup", tags=["backup"])

UPLOAD_CHUNK_SIZE = 1024 * 1024
MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB
MAX_METADATA_BYTES = 20 * 1024 * 1024  # 20 MiB
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _cleanup_file(path: Path) -> None:
    path.unlink(missing_ok=True)


def _clean_iso_date(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if not DATE_RE.match(cleaned):
        return None
    try:
        date.fromisoformat(cleaned)
    except ValueError:
        return None
    return cleaned


def _read_zip_member_bounded(zf: zipfile.ZipFile, member: str, max_bytes: int) -> bytes:
    info = zf.getinfo(member)
    if info.file_size > max_bytes:
        raise ValueError("Archive entry exceeds allowed size.")
    with zf.open(info, "r") as src:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = src.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError("Archive entry exceeds allowed size.")
            chunks.append(chunk)
    return b"".join(chunks)


@router.get("/download")
def download_full_backup(
    background_tasks: BackgroundTasks,
    admin: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Create and stream a ZIP archive of all original artworks and metadata."""
    with get_db(settings.db_path) as conn:
        kids = [
            dict(r)
            for r in conn.execute("SELECT id, name, birthdate, color, created_at FROM kids ORDER BY id ASC").fetchall()
        ]
        artworks = [
            dict(r)
            for r in conn.execute(
                """
                SELECT a.id, a.kid_id, k.name AS kid_name, a.title, a.notes, a.location,
                       a.tags, a.artwork_date, a.is_favorite, a.original_filename,
                       a.width, a.height, a.file_size, a.created_at
                FROM artworks a
                JOIN kids k ON k.id = a.kid_id
                ORDER BY a.artwork_date DESC, a.created_at DESC
                """
            ).fetchall()
        ]

    for art in artworks:
        try:
            art["tags"] = json.loads(art.get("tags") or "[]")
        except json.JSONDecodeError:
            art["tags"] = []
        art["is_favorite"] = bool(art.get("is_favorite"))

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        prefix="kidartvault-backup-",
        suffix=".zip",
        dir=settings.data_dir,
        delete=False,
    )
    tmp_path = Path(tmp.name)
    tmp.close()

    with zipfile.ZipFile(tmp_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        metadata = {
            "exported_at": datetime.now().isoformat(timespec="seconds"),
            "kids": kids,
            "artworks": artworks,
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2), compress_type=zipfile.ZIP_DEFLATED)

        if settings.originals_dir.is_dir():
            for file_path in sorted(settings.originals_dir.rglob("*")):
                if file_path.is_file():
                    rel = file_path.relative_to(settings.originals_dir).as_posix()
                    zf.write(file_path, arcname=f"originals/{rel}", compress_type=zipfile.ZIP_STORED)

    background_tasks.add_task(_cleanup_file, tmp_path)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return FileResponse(
        path=tmp_path,
        media_type="application/zip",
        filename=f"kidartvault-backup-{stamp}.zip",
    )


@router.post("/restore")
async def restore_full_backup(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Restore kids, artworks, and original images from a KidArtVault backup ZIP and regenerate WebP thumbnails."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        prefix="kidartvault-restore-",
        suffix=".zip",
        dir=settings.data_dir,
        delete=False,
    )
    tmp_path = Path(tmp.name)

    try:
        total_bytes = 0
        try:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_BACKUP_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Backup archive exceeds maximum allowed size.",
                    )
                tmp.write(chunk)
        finally:
            tmp.close()

        if total_bytes == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty backup file.")

        try:
            zf = zipfile.ZipFile(tmp_path, mode="r")
        except zipfile.BadZipFile as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is not a valid ZIP archive.",
            ) from exc

        with zf:
            names = set(zf.namelist())
            if "metadata.json" not in names:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Backup archive is missing metadata.json.",
                )

            try:
                raw_meta = _read_zip_member_bounded(zf, "metadata.json", MAX_METADATA_BYTES)
                metadata = json.loads(raw_meta.decode("utf-8"))
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Backup metadata.json is invalid or unreadable.",
                ) from exc

            if not isinstance(metadata, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Backup metadata.json has an unexpected format.",
                )

            kids_data = metadata.get("kids", [])
            artworks_data = metadata.get("artworks", [])
            if not isinstance(kids_data, list) or not isinstance(artworks_data, list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Backup metadata.json must contain 'kids' and 'artworks' lists.",
                )

            restored_kids = 0
            restored_artworks = 0
            skipped_artworks = 0
            kid_id_map: dict[int, int] = {}
            kid_name_map: dict[str, int] = {}

            with get_db(settings.db_path) as conn:
                existing_kids = conn.execute("SELECT id, name, birthdate FROM kids").fetchall()
                for row in existing_kids:
                    kid_name_map[row["name"].strip().lower()] = row["id"]

                for kid in kids_data:
                    if not isinstance(kid, dict):
                        continue
                    name = str(kid.get("name") or "").strip()[:60]
                    if not name:
                        continue
                    birthdate = _clean_iso_date(kid.get("birthdate"))
                    raw_color = str(kid.get("color") or "").strip()
                    color = raw_color if COLOR_RE.match(raw_color) else "#e07a5f"
                    old_kid_id = kid.get("id")

                    existing = conn.execute(
                        """
                        SELECT id FROM kids
                        WHERE LOWER(name) = LOWER(?) AND (birthdate IS ? OR birthdate = ?)
                        """,
                        (name, birthdate, birthdate),
                    ).fetchone()
                    if existing:
                        mapped_id = existing["id"]
                    else:
                        cur = conn.execute(
                            "INSERT INTO kids (name, birthdate, color) VALUES (?, ?, ?)",
                            (name, birthdate, color),
                        )
                        mapped_id = cur.lastrowid
                        restored_kids += 1

                    if isinstance(old_kid_id, int):
                        kid_id_map[old_kid_id] = mapped_id
                    kid_name_map[name.lower()] = mapped_id

                for art in artworks_data:
                    if not isinstance(art, dict):
                        skipped_artworks += 1
                        continue

                    art_id = str(art.get("id") or "").strip()[:64] or uuid.uuid4().hex
                    if conn.execute("SELECT 1 FROM artworks WHERE id = ?", (art_id,)).fetchone():
                        skipped_artworks += 1
                        continue

                    mapped_kid_id: int | None = None
                    raw_kid_id = art.get("kid_id")
                    if isinstance(raw_kid_id, int) and raw_kid_id in kid_id_map:
                        mapped_kid_id = kid_id_map[raw_kid_id]
                    else:
                        raw_kid_name = str(art.get("kid_name") or "").strip().lower()
                        if raw_kid_name and raw_kid_name in kid_name_map:
                            mapped_kid_id = kid_name_map[raw_kid_name]

                    if mapped_kid_id is None:
                        skipped_artworks += 1
                        continue

                    rel_orig = str(art.get("original_filename") or "").replace("\\", "/").lstrip("/")
                    member_name = f"originals/{rel_orig}"
                    if not rel_orig or member_name not in names:
                        skipped_artworks += 1
                        continue

                    try:
                        img_bytes = _read_zip_member_bounded(zf, member_name, settings.max_upload_bytes)
                        orig_name, thumb_name, width, height, file_size = restore_artwork_files(
                            img_bytes,
                            rel_orig,
                            settings.originals_dir,
                            settings.thumbs_dir,
                        )
                    except ValueError:
                        skipped_artworks += 1
                        continue

                    raw_tags = art.get("tags")
                    if isinstance(raw_tags, list):
                        clean_tags = [str(t).strip()[:60] for t in raw_tags[:30] if str(t).strip()]
                    else:
                        clean_tags = []

                    artwork_date = _clean_iso_date(art.get("artwork_date")) or date.today().isoformat()
                    title = str(art.get("title") or "").strip()[:150]
                    notes = str(art.get("notes") or "").strip()[:4000]
                    location = str(art.get("location") or "").strip()[:80]
                    is_favorite = 1 if art.get("is_favorite") else 0

                    conn.execute(
                        """
                        INSERT INTO artworks (
                            id, kid_id, title, notes, location, tags, artwork_date, is_favorite,
                            original_filename, thumb_filename, width, height, file_size
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            art_id,
                            mapped_kid_id,
                            title,
                            notes,
                            location,
                            json.dumps(clean_tags),
                            artwork_date,
                            is_favorite,
                            orig_name,
                            thumb_name,
                            width,
                            height,
                            file_size,
                        ),
                    )
                    restored_artworks += 1

                conn.commit()

        return {
            "restored_kids": restored_kids,
            "restored_artworks": restored_artworks,
            "skipped_artworks": skipped_artworks,
        }
    finally:
        _cleanup_file(tmp_path)
