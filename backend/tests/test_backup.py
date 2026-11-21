import io
import json
import zipfile

from PIL import Image


def _make_png_bytes(color=(200, 100, 80)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (320, 240), color=color).save(buf, format="PNG")
    return buf.getvalue()


def test_backup_download_and_restore_roundtrip_and_idempotency(client):
    client.post("/api/auth/setup", json={"username": "admin", "password": "supersecurepassword"})

    kid = client.post(
        "/api/kids",
        json={"name": "Maya", "birthdate": "2021-04-12", "color": "#f28482"},
    ).json()

    art = client.post(
        "/api/artworks",
        data={
            "kid_id": str(kid["id"]),
            "title": "Rainbow Castle",
            "notes": "Painted after school",
            "location": "School",
            "tags": json.dumps(["A4", "Castle"]),
            "artwork_date": "2026-05-01",
            "is_favorite": "true",
        },
        files={"file": ("castle.png", _make_png_bytes(), "image/png")},
    ).json()

    # Download backup zip
    r_dl = client.get("/api/backup/download")
    assert r_dl.status_code == 200
    backup_bytes = r_dl.content

    # Delete child (cascades artworks + removes original & thumbnail files)
    assert client.delete(f"/api/kids/{kid['id']}").status_code == 204
    assert client.get("/api/kids").json() == []
    assert client.get("/api/artworks").json()["total"] == 0

    # Restore from backup zip
    r_restore = client.post(
        "/api/backup/restore",
        files={"file": ("backup.zip", backup_bytes, "application/zip")},
    )
    assert r_restore.status_code == 200
    assert r_restore.json() == {
        "restored_kids": 1,
        "restored_artworks": 1,
        "skipped_artworks": 0,
    }

    # Verify child, artwork metadata, original image, and regenerated WebP thumbnail
    kids = client.get("/api/kids").json()
    assert len(kids) == 1
    assert kids[0]["name"] == "Maya"
    assert kids[0]["birthdate"] == "2021-04-12"
    assert kids[0]["color"] == "#f28482"

    items = client.get("/api/artworks").json()["items"]
    assert len(items) == 1
    restored = items[0]
    assert restored["id"] == art["id"]
    assert restored["title"] == "Rainbow Castle"
    assert restored["notes"] == "Painted after school"
    assert restored["location"] == "School"
    assert restored["tags"] == ["A4", "Castle"]
    assert restored["artwork_date"] == "2026-05-01"
    assert restored["is_favorite"] is True

    r_img = client.get(f"/api/artworks/{restored['id']}/image")
    assert r_img.status_code == 200
    r_thumb = client.get(f"/api/artworks/{restored['id']}/thumb")
    assert r_thumb.status_code == 200
    assert r_thumb.headers["content-type"] == "image/webp"

    # Re-restoring the same backup is idempotent (skips existing records)
    r_again = client.post(
        "/api/backup/restore",
        files={"file": ("backup.zip", backup_bytes, "application/zip")},
    )
    assert r_again.status_code == 200
    assert r_again.json() == {
        "restored_kids": 0,
        "restored_artworks": 0,
        "skipped_artworks": 1,
    }


def test_backup_restore_auth_validation_and_path_traversal_protection(client):
    client.post("/api/auth/setup", json={"username": "admin", "password": "supersecurepassword"})
    client.post("/api/users", json={"username": "member1", "password": "memberpassword1", "role": "member"})

    # Invalid non-zip rejected
    r_bad = client.post(
        "/api/backup/restore",
        files={"file": ("notazip.zip", b"plain text", "application/zip")},
    )
    assert r_bad.status_code == 400

    # Zip without metadata.json rejected
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "hello")
    r_nometa = client.post(
        "/api/backup/restore",
        files={"file": ("nometa.zip", buf.getvalue(), "application/zip")},
    )
    assert r_nometa.status_code == 400

    # Zip with path traversal in original_filename is safely skipped and never writes outside originals_dir
    traversal_buf = io.BytesIO()
    with zipfile.ZipFile(traversal_buf, "w") as zf:
        meta = {
            "kids": [{"id": 1, "name": "Leo", "birthdate": "2022-01-01", "color": "#7ec8a7"}],
            "artworks": [
                {
                    "id": "evil-1",
                    "kid_id": 1,
                    "title": "Evil",
                    "original_filename": "../../escaped.png",
                    "artwork_date": "2026-01-01",
                }
            ],
        }
        zf.writestr("metadata.json", json.dumps(meta))
        zf.writestr("originals/../../escaped.png", _make_png_bytes())

    r_trav = client.post(
        "/api/backup/restore",
        files={"file": ("traversal.zip", traversal_buf.getvalue(), "application/zip")},
    )
    assert r_trav.status_code == 200
    assert r_trav.json()["restored_artworks"] == 0
    assert r_trav.json()["skipped_artworks"] == 1
    assert not (client.app.state.settings.data_dir / "escaped.png").exists()

    # Non-admin user is forbidden
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "member1", "password": "memberpassword1"})
    r_forbidden = client.post(
        "/api/backup/restore",
        files={"file": ("backup.zip", traversal_buf.getvalue(), "application/zip")},
    )
    assert r_forbidden.status_code == 403
