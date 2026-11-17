# Changelog

## v0.0.2

### Fixes
- **HTTP NAS IP Login Fix**: Default `COOKIE_SECURE` to `auto` so session and 2FA cookies work out-of-the-box over plain HTTP (local NAS IP) while automatically enabling the `Secure` flag over HTTPS (reverse proxy / Cloudflare Tunnel).
- **Cropper & Tag Picker Fixes**: Removed hardcoded default fallback when all location/tag presets are cleared in **Options**, and stripped legacy `medium` fields from API responses.

### Features & Improvements
- **User Management & Roles**: Initial setup account is now `admin`; admins can add, edit roles for, and delete `admin`, `member` (upload/edit), and `viewer` (read-only) accounts in **Options → Users**.
- **Testing & Docker Build**: Expanded backend `pytest` suite to 9 tests (auth, roles, rate limiting, uploads, disk cleanup, share scopes/expiry) and integrated `pytest` directly into the `Dockerfile` build.
- **Dependencies & Runtime**: Upgraded backend packages (`fastapi`, `pillow`, `pydantic`, `argon2-cffi`, `uvicorn`, `pytest`), frontend packages (`react-router-dom` v7, `vite` v8, `vite-plugin-pwa` v2, `lucide-react`), and Node builder image to `node:26-alpine`.
