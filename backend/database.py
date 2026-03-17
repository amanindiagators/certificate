from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path

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
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
