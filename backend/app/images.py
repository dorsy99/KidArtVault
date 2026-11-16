import io
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

THUMB_MAX_SIZE = (800, 800)


def extract_exif_date(img: Image.Image) -> str | None:
    """Return YYYY-MM-DD from EXIF DateTimeOriginal or DateTime if available."""
    try:
        exif = img.getexif()
        if not exif:
            return None
        # 36867 = DateTimeOriginal, 306 = DateTime
        for tag_id in (36867, 306):
            raw = exif.get(tag_id)
            if isinstance(raw, str) and len(raw) >= 10:
                date_part = raw[:10].replace(":", "-")
                datetime.strptime(date_part, "%Y-%m-%d")
                return date_part
    except Exception:
        return None
    return None


def process_and_save_artwork(
    raw_bytes: bytes,
    artwork_id: str,
    originals_dir: Path,
    thumbs_dir: Path,
) -> tuple[str, str, int, int, int, str | None]:
    """
    Validate image, apply EXIF orientation, save full-res original (JPEG/PNG/WebP),
    and generate a WebP thumbnail.

    Returns: (original_filename, thumb_filename, width, height, file_size, exif_date)
    """
    originals_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Uploaded file is not a valid image.") from exc

    exif_date = extract_exif_date(img)
    img = ImageOps.exif_transpose(img)

    # Convert palette/CMYK modes safely while preserving alpha if PNG/WebP
    fmt = (img.format or "JPEG").upper()
    if fmt == "PNG":
        ext = "png"
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    elif fmt == "WEBP":
        ext = "webp"
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    else:
        ext = "jpg"
        if img.mode != "RGB":
            img = img.convert("RGB")

    width, height = img.size
    original_filename = f"{artwork_id}.{ext}"
    original_path = originals_dir / original_filename

    save_kwargs: dict = {}
    if ext == "jpg":
        save_kwargs = {"format": "JPEG", "quality": 93, "optimize": True}
    elif ext == "webp":
        save_kwargs = {"format": "WEBP", "quality": 92, "method": 4}
    else:
        save_kwargs = {"format": "PNG", "optimize": True}

    img.save(original_path, **save_kwargs)
    file_size = original_path.stat().st_size

    # Generate WebP thumbnail
    thumb = img.copy()
    thumb.thumbnail(THUMB_MAX_SIZE, Image.Resampling.LANCZOS)
    if thumb.mode not in ("RGB", "RGBA"):
        thumb = thumb.convert("RGB")

    thumb_filename = f"{artwork_id}.webp"
    thumb_path = thumbs_dir / thumb_filename
    thumb.save(thumb_path, format="WEBP", quality=84, method=4)

    return original_filename, thumb_filename, width, height, file_size, exif_date
