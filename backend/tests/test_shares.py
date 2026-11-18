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

    # Single-artwork share scope
    single_share = client.post(
        "/api/shares",
        json={"label": "Single Art", "artwork_id": art2["id"]},
    ).json()
    r = client.get(f"/api/public/share/{single_share['token']}")
    assert r.status_code == 200
    assert [a["id"] for a in r.json()["artworks"]] == [art2["id"]]
    assert client.get(f"/api/public/share/{single_share['token']}/artworks/{art1['id']}/thumb").status_code == 404

    # Expired share returns 410 Gone
    from datetime import datetime, timedelta, timezone
    from app.database import get_db

    expired_token = "expired-test-token"
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    with get_db(client.app.state.settings.db_path) as conn:
        conn.execute(
            "INSERT INTO share_links (token, label, expires_at) VALUES (?, ?, ?)",
            (expired_token, "Expired", past),
        )
        conn.commit()
    assert client.get(f"/api/public/share/{expired_token}").status_code == 410


def test_public_share_rate_limiting(client):
    from app.security import share_miss_rate_limiter, share_rate_limiter

    client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})
    kid = client.post("/api/kids", json={"name": "Leo"}).json()
    art = client.post(
        "/api/artworks",
        data={"kid_id": str(kid["id"]), "title": "Sun"},
        files={"file": ("sun.jpg", _make_jpg_bytes(), "image/jpeg")},
    ).json()
    token = client.post("/api/shares", json={"label": "Family", "kid_id": kid["id"]}).json()["token"]

    # Repeated valid metadata requests are rate-limited after share_rate_limiter.max_attempts
    for _ in range(share_rate_limiter.max_attempts):
        assert client.get(f"/api/public/share/{token}").status_code == 200
    assert client.get(f"/api/public/share/{token}").status_code == 429

    # Thumbnail/image endpoint still works with its separate higher media budget
    assert client.get(f"/api/public/share/{token}/artworks/{art['id']}/thumb").status_code == 200

    # Clear limiters and verify invalid token guessing hits 429 across all public share endpoints
    share_rate_limiter._attempts.clear()
    for i in range(share_miss_rate_limiter.max_attempts):
        assert client.get(f"/api/public/share/bad-token-{i}").status_code == 404
    assert client.get("/api/public/share/bad-token-next").status_code == 429
    assert client.get(f"/api/public/share/{token}").status_code == 429
    assert client.get(f"/api/public/share/{token}/artworks/{art['id']}/thumb").status_code == 429
