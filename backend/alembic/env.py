import os
import sys
from logging.config import fileConfig
from pathlib import Path
from dotenv import load_dotenv
from alembic import context

# Add backend to path so we can import our modules
# Path of this file is backend/alembic/env.py
# Parent of parent is backend/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env", override=False)

# Import Base from database and all models to ensure they are registered on the metadata
from database import Base, create_database_engine, normalize_database_url
# Importing all models so they are in Base.metadata
from models import User, Certificate, Client, History, Session, TemporaryAccess, OfficeLocation

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the sqlalchemy.url from environment or default to SQLite
# Preference order: DATABASE_URL env > hardcoded default
database_url = os.getenv("DATABASE_URL")
if not database_url:
    # Use the same default logic as in database.py
    DATA_DIR = os.getenv("STORAGE_DIR", os.path.join(str(ROOT_DIR), "data"))
    DB_PATH = os.getenv("DB_PATH", os.path.join(DATA_DIR, "app.db"))
    database_url = f"sqlite:///{DB_PATH}"
database_url = normalize_database_url(database_url)

# target metadata
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = database_url # Use the local variable directly
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_database_engine(database_url)

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
