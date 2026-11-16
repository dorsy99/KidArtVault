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
