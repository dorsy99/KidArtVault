# Stage 1: Build the React + Vite PWA frontend (always run on native builder arch)
FROM --platform=$BUILDPLATFORM node:26-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm test && npm run build

# Stage 2: Python FastAPI runtime serving API + built PWA
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static \
    FORWARDED_ALLOW_IPS="127.0.0.1,::1"

WORKDIR /app

# Install minimal system dependencies for Pillow (WebP/JPEG/PNG) and run as non-root user
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    libwebp7 \
    zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 kidart \
    && useradd --uid 1000 --gid 1000 --create-home kidart

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/tests ./tests
COPY backend/pytest.ini ./pytest.ini
RUN pytest -q && rm -rf tests pytest.ini .pytest_cache
COPY --from=frontend-builder /build/dist ./static

RUN mkdir -p /data && chown -R kidart:kidart /data /app

USER kidart

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
