# Changelog

## v0.0.4

### Features & Improvements
- **Backup Restore (`POST /api/backup/restore`)**: Admins can now upload a KidArtVault backup `.zip` in **Options → Backup** to idempotently restore missing child profiles, artwork records, and original images while automatically regenerating WebP thumbnails.
- **Batch Capture (`Save & Capture Next`)**: Added **Save & Capture Next** in the upload modal to save an artwork and jump straight back to capture while preserving the selected child, location, and date.
- **Share Link Management Polish**: Improved **Options → Shares** with active/expired status badges, explicit **Revoke** button with confirmation and error handling, **Copied** feedback, active share count, and fixed scope display for untitled single-artwork shares.
- **README Cleanup**: Removed repository CI/CD setup instructions from `README.md` and documented `FORWARDED_ALLOW_IPS`.

### Security Hardening
- **External Exposure Hardening**: Added sliding-window rate limiting on public share endpoints (`/api/public/share/{token}`, `/thumb`, `/image`, and invalid-token misses), made `FORWARDED_ALLOW_IPS` configurable (defaulting to `127.0.0.1,::1` instead of `*`), added `Content-Security-Policy` & `Permissions-Policy` headers, CSRF `Origin` checks, session invalidation on password change, automatic persisted `SECRET_KEY` replacement when unset/placeholder, bounded upload reads, and Pillow decompression-bomb limits.

## v0.0.3

### Features & Improvements
- **Per-Child Filesystem Storage**: Saved artworks and thumbnails are now organized into `/data/originals/<ChildName>/` and `/data/thumbs/<ChildName>/` with human-readable `<child>-<YYYYMMDD>_<HHMMSS>-<id>.<ext>` filenames for easy manual backup.
- **Admin Full Backup (`.zip`)**: Added **Options → Backup** (`GET /api/backup/download`) for admin users to download a compressed `.zip` of all original images and `metadata.json`.
- **Gallery Infinite Scroll & Date Controls**: Added `IntersectionObserver` infinite scroll (30 items/page), **Newest / Oldest** date sorting, **From / To** date range filtering, and a **Clear** filters button.
- **Optional Blank Artwork Titles**: Blank artwork titles are stored as `""` and omitted on gallery cards and detail modals instead of displaying `"Untitled Artwork"`.
- **Frontend Tests & Pipeline**: Added Vitest + React Testing Library suite (9 tests) and wired `npm test` into `Dockerfile`, `ci.yml`, and `release.yml`.
- **Clean Schema**: Removed legacy `medium` column and unused `ALTER TABLE` migration shims.

## v0.0.2

### Fixes
- **HTTP NAS IP Login Fix**: Default `COOKIE_SECURE` to `auto` so session and 2FA cookies work out-of-the-box over plain HTTP (local NAS IP) while automatically enabling the `Secure` flag over HTTPS (reverse proxy / Cloudflare Tunnel).
- **Cropper & Tag Picker Fixes**: Removed hardcoded default fallback when all location/tag presets are cleared in **Options**, and stripped legacy `medium` fields from API responses.

### Features & Improvements
- **User Management & Roles**: Initial setup account is now `admin`; admins can add, edit roles for, and delete `admin`, `member` (upload/edit), and `viewer` (read-only) accounts in **Options → Users**.
- **Testing & Docker Build**: Expanded backend `pytest` suite to 9 tests (auth, roles, rate limiting, uploads, disk cleanup, share scopes/expiry) and integrated `pytest` directly into the `Dockerfile` build.
- **Dependencies & Runtime**: Upgraded backend packages (`fastapi`, `pillow`, `pydantic`, `argon2-cffi`, `uvicorn`, `pytest`), frontend packages (`react-router-dom` v7, `vite` v8, `vite-plugin-pwa` v2, `lucide-react`), and Node builder image to `node:26-alpine`.
