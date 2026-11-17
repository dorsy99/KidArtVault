import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    birthdate TEXT,
    color TEXT NOT NULL DEFAULT '#e07a5f',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artworks (
    id TEXT PRIMARY KEY,
    kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    artwork_date TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    original_filename TEXT NOT NULL,
    thumb_filename TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artworks_kid_date ON artworks(kid_id, artwork_date DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_date ON artworks(artwork_date DESC);

CREATE TABLE IF NOT EXISTS share_links (
    token TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    kid_id INTEGER REFERENCES kids(id) ON DELETE CASCADE,
    artwork_id TEXT REFERENCES artworks(id) ON DELETE CASCADE,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vault_options (
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (kind, value)
);
"""

DEFAULT_LOCATIONS = ["Home", "School", "Kindergarten", "Daycare", "Grandparents", "Holiday"]
DEFAULT_TAGS = ["A4", "Large Painting", "Animals", "Family", "Gift", "Birthday", "Nature", "School Project"]


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.executescript(SCHEMA_SQL)
        opt_count = conn.execute("SELECT COUNT(*) FROM vault_options").fetchone()[0]
        if opt_count == 0:
            conn.executemany(
                "INSERT OR IGNORE INTO vault_options (kind, value) VALUES (?, ?)",
                [("location", v) for v in DEFAULT_LOCATIONS] + [("tag", v) for v in DEFAULT_TAGS],
            )
        conn.commit()


@contextmanager
def get_db(db_path: Path) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        conn.close()
