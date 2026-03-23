import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Base directory
ROOT_DIR = Path(__file__).parent

# Environment detection
ENVIRONMENT = (os.getenv("ENVIRONMENT") or "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in {"prod", "production"}

# Database URL from environment or default to SQLite
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    if IS_PRODUCTION:
        raise RuntimeError("DATABASE_URL is required in production.")
    # Default to the current SQLite database
    DATA_DIR = Path(os.getenv("STORAGE_DIR", str(ROOT_DIR / "data")))
    DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "app.db")))
    DATABASE_URL = f"sqlite:///{DB_PATH}"

if IS_PRODUCTION and DATABASE_URL.startswith("sqlite"):
    raise RuntimeError("SQLite is not allowed in production. Set DATABASE_URL.")

# For SQLite, we need connect_args={"check_same_thread": False}
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Neon (serverless Postgres) drops idle connections after ~5 minutes.
    # Defaults below are tuned for Railway + Neon: small pool, aggressive recycle.
    pool_size = int(os.getenv("DB_POOL_SIZE", "3"))
    max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "2"))
    pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "10"))
    pool_recycle = int(os.getenv("DB_POOL_RECYCLE", "300"))  # 5 min < Neon idle timeout
    connect_timeout = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))
    app_name = os.getenv("DB_APPLICATION_NAME", "certificate-backend")

    connect_args = {
        "connect_timeout": max(1, connect_timeout),
        "application_name": app_name,
    }
    # Neon requires SSL; add sslmode if not already in the URL
    if "sslmode" not in DATABASE_URL:
        connect_args["sslmode"] = "require"

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=max(1, pool_size),
        max_overflow=max(0, max_overflow),
        pool_timeout=max(1, pool_timeout),
        pool_recycle=max(30, pool_recycle),
        connect_args=connect_args,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
