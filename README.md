# KidArtVault

A self-hosted, single-container web & PWA gallery for capturing, organizing, and remembering your children's artwork — designed to run cleanly on a **Synology NAS** (Container Manager / Docker) and install as an app on **Android**.

## Features

- **Capture & Perspective Cropper (A4 & Large Paintings)**: Snap photos directly from your Android phone camera or upload existing images. Built-in 4-corner perspective warp flattens angled photos of A4 paper or easel paintings, with 90° rotation and a *Paper Enhance* toggle.
- **Children Profiles & Age Tracking**: Add profiles with birthdates and badge colors; every artwork automatically displays your child's exact age when they made it (e.g., `4 yrs 3 mos`).
- **Search, Mediums, Tags & Favorites**: Filter by child, medium (Drawing, Painting, Markers, Collage, Chalk), favorites, or search titles, notes, and tags.
- **Security for External Access**:
  - **Argon2id** password hashing
  - **Signed HTTP-only session cookies** (`SameSite=Lax`, optional `Secure` flag for HTTPS)
  - **Built-in TOTP 2FA** (Google Authenticator / Bitwarden / 1Password / Aegis) with QR code setup
  - **Sliding-window rate limiting** on login & 2FA endpoints (respects `X-Forwarded-For` / `X-Real-IP`)
- **Read-Only Family Share Links**: Generate revocable, optionally expiring links (`/s/<token>`) for grandparents to view a single artwork, one child's gallery, or the full collection without creating an account.
- **Android PWA**: Installable from Chrome on Android (`Add to Home screen` / `Install app`) with offline shell caching and thumbnail caching.

---

## Deploying on Synology NAS (Container Manager)

1. Copy the repository to a shared folder on your Synology NAS (for example, `/volume1/docker/kidartvault`).
2. Create your `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and set a strong `SECRET_KEY`:
   ```bash
   openssl rand -hex 32
   ```
   If you will access KidArtVault over HTTPS (recommended for external access and required for PWA installation), set:
   ```env
   COOKIE_SECURE=true
   ```
4. In **Synology Container Manager** → **Project** → **Create**, select the folder containing `docker-compose.yml` (or run `docker compose up -d --build` via SSH).
5. All data (SQLite database, full-resolution originals, and WebP thumbnails) is persisted in `./data`.

### Exposing Externally & Installing on Android

1. **HTTPS via Synology Reverse Proxy** (Control Panel → Login Portal → Advanced → Reverse Proxy):
   - Source: `https://art.yourdomain.com:443`
   - Destination: `http://localhost:8080`
   - Assign a Let's Encrypt certificate in Control Panel → Security → Certificate.
   - *(Alternative: point a Cloudflare Tunnel to `http://kidartvault:8000` or `http://localhost:8080`.)*
2. Open `https://art.yourdomain.com` on your first visit and create your parent admin account.
3. Go to **Security & Shares** → **Set Up Authenticator App** to enable **TOTP 2FA** before sharing the URL externally.
4. On your **Android phone**, open `https://art.yourdomain.com` in Chrome, tap the menu (`⋮`) → **Install app** to add **KidArtVault** to your home screen.

---

## Local Development & Testing

### Backend (FastAPI + SQLite)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload --port 8000
```

### Frontend (React + Vite PWA)
```bash
cd frontend
npm install
npm run dev
```

---

## GitHub & Automatic Docker Hub Releases

This repository includes two GitHub Actions workflows:
- [ci.yml](.github/workflows/ci.yml): Runs `pytest` and builds the React PWA on every push/PR to `main`.
- [release.yml](.github/workflows/release.yml): On any `v*` tag (e.g. `v1.0.0`), runs tests, builds a multi-architecture (`linux/amd64` + `linux/arm64`) Docker image, pushes it to Docker Hub, and creates a GitHub Release.

### One-Time Setup
1. Push this repo to GitHub (`main` branch).
2. In Docker Hub, create an Access Token (**Account Settings → Personal access tokens**).
3. In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — your Docker Hub access token

### Publishing a New Release
```bash
git tag v1.0.0
git push origin v1.0.0
```
Once the workflow completes, you can update `docker-compose.yml` on your Synology NAS to pull `<your-dockerhub-username>/kidartvault:latest` instead of building locally.
