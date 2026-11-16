import io
from PIL import Image


def _make_jpg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), color=(90, 140, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def test_share_links_are_scoped_and_revocable(client):
    client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})

    kid1 = client.post("/api/kids", json={"name": "Leo", "birthdate": "2020-01-01"}).json()
    kid2 = client.post("/api/kids", json={"name": "Zoe", "birthdate": "2022-03-15"}).json()

    art1 = client.post(
        "/api/artworks",
        data={"kid_id": str(kid1["id"]), "title": "Leo Rocket"},
        files={"file": ("rocket.jpg", _make_jpg_bytes(), "image/jpeg")},
    ).json()
    art2 = client.post(
        "/api/artworks",
        data={"kid_id": str(kid2["id"]), "title": "Zoe Flower"},
        files={"file": ("flower.jpg", _make_jpg_bytes(), "image/jpeg")},
    ).json()

    # Share only Leo's collection
    share = client.post(
        "/api/shares",
        json={"label": "Grandparents", "kid_id": kid1["id"], "expires_days": 30},
    ).json()
    token = share["token"]

    # Public endpoint returns only Leo's artwork
    r = client.get(f"/api/public/share/{token}")
    assert r.status_code == 200
    titles = [a["title"] for a in r.json()["artworks"]]
    assert titles == ["Leo Rocket"]

    # Scoped image access works for Leo's artwork, blocked for Zoe's
    assert client.get(f"/api/public/share/{token}/artworks/{art1['id']}/thumb").status_code == 200
    assert client.get(f"/api/public/share/{token}/artworks/{art2['id']}/thumb").status_code == 404

    # Revoke share
    assert client.delete(f"/api/shares/{token}").status_code == 204
    assert client.get(f"/api/public/share/{token}").status_code == 404
