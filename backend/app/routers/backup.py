import json
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse

from app.config import Settings
from app.database import get_db
from app.deps import get_settings, require_admin

router = APIRouter(prefix="/api/backup", tags=["backup"])


def _cleanup_file(path: Path) -> None:
    path.unlink(missing_ok=True)


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
