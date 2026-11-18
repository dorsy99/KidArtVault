import pyotp


def test_setup_login_and_2fa_flow(client):
    # Initially needs setup
    r = client.get("/api/auth/status")
    assert r.status_code == 200
    assert r.json()["needs_setup"] is True
    assert r.json()["authenticated"] is False

    # Unauthenticated access to protected route fails
    assert client.get("/api/kids").status_code == 401

    # Setup initial admin
    r = client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})
    assert r.status_code == 201
    assert r.json()["user"]["username"] == "parent"

    # Second setup attempt is rejected
    r = client.post("/api/auth/setup", json={"username": "other", "password": "otherpassword123"})
    assert r.status_code == 409

    # Begin 2FA setup
    r = client.post("/api/auth/2fa/setup")
    assert r.status_code == 200
    secret = r.json()["secret"]
    assert r.json()["qr_data_uri"].startswith("data:image/png;base64,")

    # Enable 2FA with valid TOTP code
    code = pyotp.TOTP(secret).now()
    r = client.post("/api/auth/2fa/enable", json={"secret": secret, "code": code})
    assert r.status_code == 200
    assert r.json()["totp_enabled"] is True

    # Logout
    client.post("/api/auth/logout")
    assert client.get("/api/kids").status_code == 401

    # Login now requires 2FA
    r = client.post("/api/auth/login", json={"username": "parent", "password": "supersecurepassword"})
    assert r.status_code == 200
    assert r.json()["requires_2fa"] is True
    assert client.get("/api/kids").status_code == 401

    # Verify 2FA
    r = client.post("/api/auth/verify-2fa", json={"code": pyotp.TOTP(secret).now()})
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "parent"
    assert r.json()["user"]["role"] == "admin"
    assert client.get("/api/kids").status_code == 200


def test_user_management_and_roles(client):
    r = client.post("/api/auth/setup", json={"username": "admin1", "password": "adminpassword123"})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "admin"

    # Admin creates a viewer and a member
    r = client.post("/api/users", json={"username": "grandma", "password": "viewerpassword1", "role": "viewer"})
    assert r.status_code == 201
    viewer = r.json()
    assert viewer["role"] == "viewer"

    r = client.post("/api/users", json={"username": "partner", "password": "memberpassword1", "role": "member"})
    assert r.status_code == 201
    assert r.json()["role"] == "member"

    # Admin cannot delete themselves
    assert client.delete("/api/users/1").status_code == 400

    # Log in as viewer
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"username": "grandma", "password": "viewerpassword1"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "viewer"

    # Viewer can read artworks/kids, but cannot manage users or kids
    assert client.get("/api/artworks").status_code == 200
    assert client.get("/api/users").status_code == 403
    assert client.post("/api/kids", json={"name": "Kid"}).status_code == 403
    assert client.post("/api/options/tag", json={"value": "Blocked"}).status_code == 403
    assert client.post("/api/shares", json={"label": "Blocked"}).status_code == 403


def test_member_role_and_admin_guards(client):
    client.post("/api/auth/setup", json={"username": "admin1", "password": "adminpassword123"})
    kid = client.post("/api/kids", json={"name": "Maya"}).json()

    # Duplicate username rejected
    r = client.post("/api/users", json={"username": "admin1", "password": "otherpassword123", "role": "member"})
    assert r.status_code == 409

    # Cannot demote the last admin
    r = client.patch("/api/users/1", json={"role": "member"})
    assert r.status_code == 400

    # Create member and log in as member
    client.post("/api/users", json={"username": "partner", "password": "memberpassword1", "role": "member"})
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"username": "partner", "password": "memberpassword1"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "member"

    # Member cannot access admin endpoints
    assert client.get("/api/users").status_code == 403
    assert client.post("/api/kids", json={"name": "Nope"}).status_code == 403
    assert client.post("/api/options/location", json={"value": "Nope"}).status_code == 403
    assert client.post("/api/shares", json={"label": "Nope"}).status_code == 403

    # Member CAN upload, edit, and delete artworks
    import io
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(10, 20, 30)).save(buf, format="PNG")
    r = client.post(
        "/api/artworks",
        data={"kid_id": str(kid["id"]), "title": ""},
        files={"file": ("art.png", buf.getvalue(), "image/png")},
    )
    assert r.status_code == 201
    art = r.json()
    assert art["title"] == ""

    # Switch to viewer and verify viewer cannot mutate artworks
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "admin1", "password": "adminpassword123"})
    client.post("/api/users", json={"username": "viewer1", "password": "viewerpassword1", "role": "viewer"})
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "viewer1", "password": "viewerpassword1"})

    assert client.patch(f"/api/artworks/{art['id']}", json={"title": "Hacked"}).status_code == 403
    assert client.delete(f"/api/artworks/{art['id']}").status_code == 403


def test_password_change_2fa_disable_and_rate_limiting(client):
    client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})

    # Enable 2FA
    setup = client.post("/api/auth/2fa/setup").json()
    secret = setup["secret"]
    client.post("/api/auth/2fa/enable", json={"secret": secret, "code": pyotp.TOTP(secret).now()})

    # Change password (wrong current rejected, valid succeeds)
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrongpassword", "new_password": "newpassword1234"},
    )
    assert r.status_code == 401

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "supersecurepassword", "new_password": "newpassword1234"},
    )
    assert r.status_code == 200

    # Disable 2FA
    r = client.post(
        "/api/auth/2fa/disable",
        json={"password": "newpassword1234", "code": pyotp.TOTP(secret).now()},
    )
    assert r.status_code == 200
    assert r.json()["totp_enabled"] is False

    # Rate limit after repeated failed logins
    client.post("/api/auth/logout")
    for _ in range(12):
        r = client.post("/api/auth/login", json={"username": "parent", "password": "wrongpassword"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "parent", "password": "wrongpassword"})
    assert r.status_code == 429


def test_cookie_secure_auto_mode(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import Settings
    from app.main import create_app

    settings = Settings(
        data_dir=tmp_path,
        db_path=tmp_path / "auto.db",
        originals_dir=tmp_path / "originals",
        thumbs_dir=tmp_path / "thumbs",
        static_dir=None,
        secret_key="test-secret-key",
        cookie_secure=None,
        allowed_origins=(),
        max_upload_bytes=1024 * 1024,
    )
    app = create_app(settings)

    with TestClient(app, base_url="http://192.168.1.10:8080") as http_client:
        r = http_client.post("/api/auth/setup", json={"username": "nas", "password": "password123"})
        assert r.status_code == 201
        assert "secure" not in r.headers.get("set-cookie", "").lower()

    with TestClient(app, base_url="https://art.example.com") as https_client:
        r = https_client.post("/api/auth/login", json={"username": "nas", "password": "password123"})
        assert r.status_code == 200
        assert "secure" in r.headers.get("set-cookie", "").lower()


def test_session_invalidated_on_password_change_and_csrf_origin(client):
    r = client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})
    assert r.status_code == 201
    assert "content-security-policy" in r.headers
    old_cookie = client.cookies.get("kidart_session")
    assert old_cookie

    # Cross-origin state-changing request is blocked by Origin check
    r_csrf = client.post(
        "/api/kids",
        json={"name": "Blocked"},
        headers={"Origin": "https://evil.example.com"},
    )
    assert r_csrf.status_code == 403

    # Same-origin request succeeds
    r_same = client.post(
        "/api/kids",
        json={"name": "Allowed"},
        headers={"Origin": "http://testserver"},
    )
    assert r_same.status_code == 201

    # Change password rotates the current session cookie and invalidates the old token
    r_pw = client.post(
        "/api/auth/change-password",
        json={"current_password": "supersecurepassword", "new_password": "brandnewpassword123"},
    )
    assert r_pw.status_code == 200
    new_cookie = client.cookies.get("kidart_session")
    assert new_cookie != old_cookie
    assert client.get("/api/kids").status_code == 200

    # Presenting the old pre-password-change cookie is rejected
    client.cookies.set("kidart_session", old_cookie)
    assert client.get("/api/kids").status_code == 401
    assert client.get("/api/auth/status").json()["authenticated"] is False


def test_rate_limit_blocks_rotating_x_forwarded_for_and_persists_secret_key(client, tmp_path, monkeypatch):
    from app.config import load_settings

    client.post("/api/auth/setup", json={"username": "parent", "password": "supersecurepassword"})
    client.post("/api/auth/logout")

    # Even if an attacker rotates X-Forwarded-For on every request, per-username rate limiting blocks brute-forcing
    for i in range(12):
        r = client.post(
            "/api/auth/login",
            json={"username": "parent", "password": "wrongpassword"},
            headers={"X-Forwarded-For": f"203.0.113.{i + 1}"},
        )
        assert r.status_code == 401

    r_blocked = client.post(
        "/api/auth/login",
        json={"username": "parent", "password": "wrongpassword"},
        headers={"X-Forwarded-For": "198.51.100.99"},
    )
    assert r_blocked.status_code == 429

    # Verify placeholder SECRET_KEY is replaced and persisted in DATA_DIR/.secret_key
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "vault_data"))
    monkeypatch.setenv("SECRET_KEY", "change-me-to-a-long-random-hex-string-at-least-32-chars")
    s1 = load_settings()
    s2 = load_settings()
    assert len(s1.secret_key) == 64
    assert s1.secret_key == s2.secret_key
    assert (tmp_path / "vault_data" / ".secret_key").is_file()
