import io
from PIL import Image


def _make_png_bytes(color=(220, 120, 80), size=(320, 240)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format="PNG")
    return buf.getvalue()


def _auth(client):
    client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})


def test_kids_and_artworks_lifecycle(client):
    _auth(client)

    # Create a child
    r = client.post(
        "/api/kids",
        json={"name": "Maya", "birthdate": "2021-05-10", "color": "#e07a5f"},
    )
    assert r.status_code == 201
    kid = r.json()
    assert kid["name"] == "Maya"

    # Upload an artwork
    img_bytes = _make_png_bytes()
    r = client.post(
        "/api/artworks",
        data={
            "kid_id": str(kid["id"]),
            "title": "Rainbow Dinosaur",
            "notes": "Drawn on A4 after the zoo trip",
            "location": "School",
            "tags": "dinosaur, rainbow, a4",
            "artwork_date": "2026-11-10",
            "is_favorite": "true",
        },
        files={"file": ("dino.png", img_bytes, "image/png")},
    )
    assert r.status_code == 201
    art = r.json()
    assert art["title"] == "Rainbow Dinosaur"
    assert art["location"] == "School"
    assert art["tags"] == ["dinosaur", "rainbow", "a4"]
    assert art["is_favorite"] is True
    assert art["width"] == 320
    assert art["height"] == 240

    # List & search by query, favorite, and location
    r = client.get("/api/artworks", params={"q": "dinosaur", "favorite": "true", "location": "school"})
    assert r.status_code == 200
    assert r.json()["total"] == 1

    # Facets endpoint returns distinct locations & tags
    r = client.get("/api/artworks/meta/facets")
    assert r.status_code == 200
    assert "School" in r.json()["locations"]
    assert "dinosaur" in r.json()["tags"]

    # Fetch original & thumbnail
    assert client.get(f"/api/artworks/{art['id']}/image").status_code == 200
    assert client.get(f"/api/artworks/{art['id']}/thumb").status_code == 200

    # Update artwork
    r = client.patch(f"/api/artworks/{art['id']}", json={"title": "Super Rainbow Dino"})
    assert r.status_code == 200
    assert r.json()["title"] == "Super Rainbow Dino"

    # Delete artwork
    r = client.delete(f"/api/artworks/{art['id']}")
    assert r.status_code == 204
    assert client.get(f"/api/artworks/{art['id']}").status_code == 404


def test_options_locations_and_tags(client):
    _auth(client)

    r = client.get("/api/options")
    assert r.status_code == 200
    assert "Home" in r.json()["locations"]
    assert "A4" in r.json()["tags"]

    r = client.post("/api/options/location", json={"value": "Art Class"})
    assert r.status_code == 201
    assert "Art Class" in r.json()["locations"]

    r = client.delete("/api/options/tag", params={"value": "A4"})
    assert r.status_code == 200
    assert "A4" not in r.json()["tags"]


def test_kid_update_cascade_cleanup_and_invalid_uploads(client, tmp_path):
    _auth(client)
    kid = client.post("/api/kids", json={"name": "Leo", "birthdate": "2020-02-02"}).json()

    # Update kid profile
    r = client.patch(f"/api/kids/{kid['id']}", json={"name": "Leonardo", "color": "#7ec8a7"})
    assert r.status_code == 200
    assert r.json()["name"] == "Leonardo"
    assert r.json()["color"] == "#7ec8a7"

    # Reject non-image upload
    r = client.post(
        "/api/artworks",
        data={"kid_id": str(kid["id"]), "title": "Not an image"},
        files={"file": ("bad.txt", b"hello world", "text/plain")},
    )
    assert r.status_code == 400

    # Reject oversized upload (> 10MB test limit)
    r = client.post(
        "/api/artworks",
        data={"kid_id": str(kid["id"]), "title": "Too big"},
        files={"file": ("big.png", b"\x00" * (10 * 1024 * 1024 + 10), "image/png")},
    )
    assert r.status_code == 413

    # Upload valid artwork, then delete kid and confirm disk files are cleaned up
    art = client.post(
        "/api/artworks",
        data={"kid_id": str(kid["id"]), "title": ""},
        files={"file": ("art.png", _make_png_bytes(), "image/png")},
    ).json()
    assert art["title"] == ""
    kid_orig_files = list((tmp_path / "originals" / "Leonardo").iterdir())
    kid_thumb_files = list((tmp_path / "thumbs" / "Leonardo").iterdir())
    assert len(kid_orig_files) == 1
    assert len(kid_thumb_files) == 1
    assert kid_orig_files[0].name.startswith("leonardo-")

    assert client.delete(f"/api/kids/{kid['id']}").status_code == 204
    assert len(list((tmp_path / "originals").iterdir())) == 0
    assert len(list((tmp_path / "thumbs").iterdir())) == 0


def test_full_backup_download_admin_only(client):
    import json
    import zipfile

    _auth(client)
    kid = client.post("/api/kids", json={"name": "Maya"}).json()
    client.post(
        "/api/artworks",
        data={"kid_id": str(kid["id"]), "title": "Sunny Day", "location": "Home"},
        files={"file": ("sun.png", _make_png_bytes(), "image/png")},
    )

    r = client.get("/api/backup/download")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        names = zf.namelist()
        assert "metadata.json" in names
        assert any(n.startswith("originals/Maya/maya-") for n in names)
        meta = json.loads(zf.read("metadata.json"))
        assert meta["artworks"][0]["title"] == "Sunny Day"

    # Non-admin member cannot download full backup
    client.post("/api/users", json={"username": "member1", "password": "memberpassword1", "role": "member"})
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "member1", "password": "memberpassword1"})
    assert client.get("/api/backup/download").status_code == 403


def test_artwork_date_filter_sort_and_pagination(client):
    _auth(client)
    kid = client.post("/api/kids", json={"name": "Maya"}).json()

    for title, d in [("Jan Art", "2026-01-15"), ("Mar Art", "2026-03-20"), ("Feb Art", "2026-02-10")]:
        client.post(
            "/api/artworks",
            data={"kid_id": str(kid["id"]), "title": title, "artwork_date": d},
            files={"file": ("art.png", _make_png_bytes(), "image/png")},
        )

    # Sort oldest first + pagination
    r1 = client.get("/api/artworks", params={"sort": "oldest", "limit": 2, "offset": 0})
    assert r1.status_code == 200
    assert r1.json()["total"] == 3
    assert [a["title"] for a in r1.json()["items"]] == ["Jan Art", "Feb Art"]

    r2 = client.get("/api/artworks", params={"sort": "oldest", "limit": 2, "offset": 2})
    assert [a["title"] for a in r2.json()["items"]] == ["Mar Art"]

    # Date range filter
    r3 = client.get("/api/artworks", params={"date_from": "2026-02-01", "date_to": "2026-02-28"})
    assert r3.json()["total"] == 1
    assert r3.json()["items"][0]["title"] == "Feb Art"
