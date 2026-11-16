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
    assert client.get("/api/kids").status_code == 200
