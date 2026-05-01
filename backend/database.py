import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Base directory
ROOT_DIR = Path(__file__).parent

# Load file-based env before reading configuration so local and scripted
# deployments do not silently fall back to SQLite.
load_dotenv(ROOT_DIR / ".env", override=False)

# Environment detection
ENVIRONMENT = (os.getenv("ENVIRONMENT") or os.getenv("VERCEL_ENV") or "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in {"prod", "production"}

def _resolve_database_url() -> str:
    database_url = (os.getenv("DATABASE_URL") or "").strip()

    if database_url:
        # Ensure it has the correct prefix for sqlalchemy-libsql
        if database_url.startswith("libsql://"):
            database_url = database_url.replace("libsql://", "sqlite+libsql://")
        return database_url

    if IS_PRODUCTION:
        raise RuntimeError("DATABASE_URL is missing in Vercel settings.")

    DATA_DIR = Path(os.getenv("STORAGE_DIR", str(ROOT_DIR / "data")))
    if not IS_PRODUCTION:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "app.db")))
    return f"sqlite:///{DB_PATH}"


def normalize_database_url(database_url: str) -> str:
    database_url = (database_url or "").strip()
    if database_url.startswith("libsql://"):
        database_url = f"sqlite+libsql://{database_url[len('libsql://'):]}"
    if database_url.startswith("sqlite+libsql://"):
        prefix = "sqlite+libsql://"
        auth_token = (os.getenv("TURSO_AUTH_TOKEN") or os.getenv("DATABASE_AUTH_TOKEN") or "").strip()
        rest = database_url[len(prefix):]
        base = rest.split("?", 1)[0]
        if base and not base.startswith("/") and "/" not in base:
            query = f"?{rest.split('?', 1)[1]}" if "?" in rest else ""
            database_url = f"{prefix}{base}/{query}"
    if database_url.startswith("sqlite+libsql://") and "?" not in database_url and "://" in database_url:
        return f"{database_url}?secure=true"
    return database_url


def create_database_engine(database_url: str):
    database_url = normalize_database_url(database_url)

    if IS_PRODUCTION and database_url.startswith("sqlite:///"):
        raise RuntimeError("File-based SQLite is not allowed in production. Set DATABASE_URL to Turso/libSQL.")

    if database_url.startswith("sqlite+libsql://"):
        parts = urlsplit(database_url)
        auth_token = (
            os.getenv("DATABASE_AUTH_TOKEN")
            or os.getenv("LIBSQL_AUTH_TOKEN")
            or os.getenv("TURSO_AUTH_TOKEN")
            or ""
        ).strip()
        filtered_query = []
        for key, value in parse_qsl(parts.query, keep_blank_values=True):
            if key == "authToken":
                auth_token = auth_token or value
                continue
            filtered_query.append((key, value))
        database_url = urlunsplit(
            (
                parts.scheme,
                parts.netloc,
                parts.path,
                urlencode(filtered_query),
                parts.fragment,
            )
        )
        return create_engine(
            database_url,
            pool_pre_ping=True,
            connect_args={"auth_token": auth_token} if auth_token else {},
        )

    if database_url.startswith("sqlite"):
        return create_engine(database_url, connect_args={"check_same_thread": False})

    return create_engine(
        database_url,
        pool_pre_ping=True,
    )


# Database URL from environment or default to local SQLite
DATABASE_URL = normalize_database_url(_resolve_database_url())
engine = create_database_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
