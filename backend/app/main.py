from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import Settings, load_settings
from app.database import init_db
from app.routers import artworks, auth, backup, kids, options, shares, users

STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSP_POLICY = (
    "default-src 'self'; "
    "img-src 'self' data: blob:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)


def _is_origin_allowed(request: Request, settings: Settings) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return True
    normalized_origin = origin.strip().rstrip("/")
    if normalized_origin in settings.allowed_origins:
        return True
    parsed = urlparse(normalized_origin)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    host = host.split(",")[0].strip()
    return bool(parsed.netloc and host and parsed.netloc.lower() == host.lower())


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        resolved_settings.data_dir.mkdir(parents=True, exist_ok=True)
        resolved_settings.originals_dir.mkdir(parents=True, exist_ok=True)
        resolved_settings.thumbs_dir.mkdir(parents=True, exist_ok=True)
        init_db(resolved_settings.db_path)
        yield

    app = FastAPI(title="KidArtVault", version="1.0.0", lifespan=lifespan)
    app.state.settings = resolved_settings

    if resolved_settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(resolved_settings.allowed_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type"],
        )

    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next):
        if request.method in STATE_CHANGING_METHODS and not _is_origin_allowed(request, resolved_settings):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Cross-origin request blocked"},
            )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Content-Security-Policy", CSP_POLICY)
        response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
        return response

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(kids.router)
    app.include_router(artworks.router)
    app.include_router(options.router)
    app.include_router(shares.router)
    app.include_router(backup.router)

    static_dir = resolved_settings.static_dir
    if static_dir and static_dir.is_dir():
        assets_dir = static_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            # Serve exact static file if it exists (manifest.webmanifest, sw.js, icons, etc.)
            candidate = (static_dir / full_path).resolve()
            if (
                full_path
                and static_dir.resolve() in candidate.parents
                and candidate.is_file()
            ):
                return FileResponse(candidate)
            index_file = static_dir / "index.html"
            if index_file.is_file():
                return FileResponse(index_file)
            return {"detail": "Frontend not built"}

    return app


app = create_app()
