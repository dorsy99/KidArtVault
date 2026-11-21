# KidArtVault

A self-hosted, single-container web & PWA gallery for capturing, organizing, and remembering your children's artwork — designed to run on a **Synology NAS** (Container Manager / Docker) and install as an app on **Android**.

## Features

- **Quick Capture & Live Camera**: Snap photos directly via the live camera API (desktop webcam or Android phone) or upload existing files. Title is optional for fast capture.
- **4-Corner Perspective Cropper**: Flatten angled photos of A4 paper or large-format easel paintings, rotate 90°, and optionally apply *Paper Enhance*.
- **Children Profiles & Age Tracking**: Coloured artist radio buttons and dedicated child galleries; every artwork automatically displays your child's exact age when they made it (e.g., `4 yrs 3 mos`).
- **Locations & Tags**: One-tap location chips (`Home`, `School`, `Kindergarten`, etc.) and custom tags, configurable under **Options**.
- **Security for External Access**:
  - **Argon2id** password hashing
  - **Signed HTTP-only session cookies** (`SameSite=Lax`, configurable `Secure` flag for HTTPS)
  - **Built-in TOTP 2FA** (Google Authenticator / Bitwarden / 1Password / Aegis) with QR code setup
  - **Sliding-window rate limiting** on login & 2FA endpoints (respects `X-Forwarded-For` / `X-Real-IP`)
- **Read-Only Family Share Links**: Generate revocable, optionally expiring links (`/s/<token>`) for grandparents to view a single artwork, one child's gallery, or the full collection without creating an account.
- **Android PWA**: Installable from Chrome on Android (`Add to Home screen` / `Install app`) with offline shell caching and thumbnail caching.

---

## Self-Hosted Docker Configuration

### 1. Required Volume & Paths

All persistent application state lives inside a single container directory: **`/data`**.

| Container Path | Purpose |
| --- | --- |
| `/data` | Root data volume (mount this to persistent host storage) |
| `/data/kidartvault.db` | SQLite database (users, kids, artwork metadata, options, share links) |
| `/data/originals/` | Full-resolution uploaded/cropped artwork images |
| `/data/thumbs/` | Generated WebP thumbnails (`800x800` max) |

Example host mount on Synology NAS:
```yaml
volumes:
  - /volume1/docker/kidartvault/data:/data
```

### 2. Port Mappings

| Container Port | Default Host Port | Protocol | Notes |
| --- | --- | --- | --- |
| `8000` | `8080` (`HOST_PORT`) | TCP (HTTP) | Uvicorn serves both the FastAPI API and the built React PWA. Terminate HTTPS in front of this port via reverse proxy. |

### 3. User & Group (`UID`/`GID`) Permissions

Inside the image ([Dockerfile](Dockerfile)), the process runs as a non-root user **`kidart`** with:
- **UID**: `1000`
- **GID**: `1000`

If your host `/data` directory is owned by a different user (common on **Synology NAS**, where your DSM user is often `1026:100`), choose one of the following:

- **Option A — Set folder ownership to `1000:1000` (recommended):**
  ```bash
  mkdir -p /volume1/docker/kidartvault/data
  sudo chown -R 1000:1000 /volume1/docker/kidartvault/data
  ```
- **Option B — Override the container user in `docker-compose.yml`:**
  Run `id` over SSH on your NAS to check your `uid` and `gid`, then add `user:` to the service:
  ```yaml
  services:
    kidartvault:
      user: "1026:100"
  ```

### 4. Environment Variables

Copy [.env.example](.env.example) to `.env` and configure:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SECRET_KEY` | **Yes** | — | Long random hex string (`openssl rand -hex 32`) used to sign session & 2FA cookies. |
| `COOKIE_SECURE` | No | `auto` | `auto` enables `Secure` cookies on HTTPS (reverse proxy) while still allowing local HTTP access via NAS IP. Set `true` to strictly require HTTPS. |
| `HOST_PORT` | No | `8080` | Host port mapped to container port `8000`. |
| `TZ` | No | `UTC` | Timezone for container logs and timestamps (e.g. `Australia/Sydney`). |
| `MAX_UPLOAD_MB` | No | `30` | Maximum upload file size in MB. |
| `ALLOWED_ORIGINS` | No | `""` | Comma-separated CORS origins if accessed cross-origin (leave empty for same-origin reverse proxy). |
| `FORWARDED_ALLOW_IPS` | No | `127.0.0.1,::1` | Comma-separated trusted proxy IPs/CIDRs for `X-Forwarded-*` headers (e.g. `127.0.0.1,::1,172.16.0.0/12` behind Docker/Synology reverse proxy). |

---

## Deploying on Synology NAS (Container Manager)

### Using the Prebuilt Docker Hub Image
Create a folder on your NAS (e.g. `/volume1/docker/kidartvault`), add `.env`, and create a `docker-compose.yml`:

```yaml
services:
  kidartvault:
    image: dorsy99/kidartvault:latest
    container_name: kidartvault
    restart: unless-stopped
    ports:
      - "${HOST_PORT:-8080}:8000"
    environment:
      - DATA_DIR=/data
      - SECRET_KEY=${SECRET_KEY:?Set SECRET_KEY in .env}
      - COOKIE_SECURE=${COOKIE_SECURE:-auto}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-}
      - FORWARDED_ALLOW_IPS=${FORWARDED_ALLOW_IPS:-127.0.0.1,::1}
      - MAX_UPLOAD_MB=${MAX_UPLOAD_MB:-30}
      - TZ=${TZ:-Australia/Sydney}
    volumes:
      - /volume1/docker/kidartvault/data:/data
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    security_opt:
      - no-new-privileges:true
```

Then start it via **Synology Container Manager → Project → Create** or SSH:
```bash
docker compose up -d
```

*(If building from source instead, use the repository's [docker-compose.yml](docker-compose.yml) and run `docker compose up -d --build`.)*

### Exposing Externally (HTTPS) & Installing on Android

1. **HTTPS via Synology Reverse Proxy** (*Control Panel → Login Portal → Advanced → Reverse Proxy*):
   - Source: `https://art.yourdomain.com:443`
   - Destination: `http://localhost:8080` (or your configured `HOST_PORT`)
   - Assign a Let's Encrypt certificate in *Control Panel → Security → Certificate*.
   - Ensure `COOKIE_SECURE=true` is set in `.env`, and set `FORWARDED_ALLOW_IPS` to your reverse proxy's IP or Docker bridge subnet (e.g. `127.0.0.1,::1,172.16.0.0/12`) so real client IPs and `X-Forwarded-Proto` are trusted.
   - *(Alternative: point a Cloudflare Tunnel to `http://localhost:8080`.)*
2. Open `https://art.yourdomain.com` on your first visit and create your parent admin account.
3. Go to **Options → Security** to enable **TOTP 2FA** before sharing the URL externally.
4. On your **Android phone**, open `https://art.yourdomain.com` in Chrome, tap the menu (`⋮`) → **Install app** to add **KidArtVault** to your home screen.

---

## Local Development & Testing

### Backend (FastAPI + SQLite)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
pytest -v
uvicorn app.main:app --reload --port 8000
```

### Frontend (React + Vite PWA)
```bash
cd frontend
npm install
npm run dev
```
