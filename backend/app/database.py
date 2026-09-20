import os
import urllib.parse
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Explicitly load .env from the backend directory
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

raw_database_url = os.getenv("DATABASE_URL")

if not raw_database_url or "your_supabase_postgresql_connection_string" in raw_database_url or "[YOUR-PASSWORD]" in raw_database_url:
    raise RuntimeError(
        "DATABASE_URL is not configured in backend/.env. "
        "Please provide a valid Supabase PostgreSQL connection string in backend/.env."
    )

def normalize_database_url(url_str: str) -> str:
    # Normalize postgres:// to postgresql:// for SQLAlchemy
    if url_str.startswith("postgres://"):
        url_str = url_str.replace("postgres://", "postgresql://", 1)
    
    # Handle passwords containing special characters like '@' or '#'
    if "://" in url_str:
        scheme, rest = url_str.split("://", 1)
        if "@" in rest:
            # Split path/params if any
            if "/" in rest:
                auth_host, path_part = rest.split("/", 1)
                path_part = "/" + path_part
            else:
                auth_host = rest
                path_part = ""
            
            # The host is after the LAST '@'
            last_at_index = auth_host.rfind("@")
            auth_part = auth_host[:last_at_index]
            host_part = auth_host[last_at_index + 1:]
            
            if ":" in auth_part:
                user_part, pass_part = auth_part.split(":", 1)
                # Ensure password is properly URL-encoded (decoding first if partially encoded)
                encoded_pass = urllib.parse.quote(urllib.parse.unquote(pass_part))
                url_str = f"{scheme}://{user_part}:{encoded_pass}@{host_part}{path_part}"
                
    return url_str

DATABASE_URL = normalize_database_url(raw_database_url)

# PostgreSQL Engine Configuration with connection pooling & pre-ping for Supabase
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def run_migrations():
    """Ensure newly introduced tables and columns exist in Supabase PostgreSQL."""
    from sqlalchemy import text
    migration_statements = [
        # Alerts table extensions
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE NOT NULL;",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS alert_type VARCHAR(50) DEFAULT 'THRESHOLD';",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS sensor VARCHAR(50);",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS value FLOAT;",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS threshold FLOAT;",
        
        # System settings extensions
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS high_temp_threshold FLOAT DEFAULT 35.0 NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS debounce_samples INTEGER DEFAULT 3 NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER DEFAULT 300 NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT TRUE NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS daily_summary_enabled BOOLEAN DEFAULT FALSE NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS offline_alert_enabled BOOLEAN DEFAULT TRUE NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS offline_timeout_seconds INTEGER DEFAULT 300 NOT NULL;",
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS daily_summary_hour INTEGER DEFAULT 8 NOT NULL;",

        # Notifications table creation
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
            device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
            channel VARCHAR(20) DEFAULT 'telegram' NOT NULL,
            recipient VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending' NOT NULL,
            sent_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS ix_notifications_channel ON notifications(channel);",
        "CREATE INDEX IF NOT EXISTS ix_notifications_status ON notifications(status);",
        "CREATE INDEX IF NOT EXISTS ix_notifications_alert_id ON notifications(alert_id);",
        "CREATE INDEX IF NOT EXISTS ix_notifications_device_id ON notifications(device_id);",
    ]
    with engine.begin() as conn:
        for stmt in migration_statements:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                print(f"[WARN] Migration statement warning: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
