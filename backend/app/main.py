from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, run_migrations
from app import models
from app.routes import readings, alerts, irrigation, settings, devices, notifications
from app.services.offline_checker import start_offline_checker, stop_offline_checker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Automatically create tables and apply migrations in Supabase PostgreSQL
    try:
        Base.metadata.create_all(bind=engine)
        run_migrations()
    except Exception as e:
        print(f"[WARN] Database table initialization / migration warning: {e}")

    # Start controlled background offline and daily summary checker
    try:
        start_offline_checker()
    except Exception as e:
        print(f"[WARN] Error starting offline checker: {e}")

    yield

    # Cleanly stop background checker on shutdown
    try:
        stop_offline_checker()
    except Exception as e:
        print(f"[WARN] Error stopping offline checker: {e}")

app = FastAPI(
    title="Botanical Lab API",
    description="Backend for Botanical Lab Smart Plant Water Management System connected to Supabase PostgreSQL with Telegram Bot API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "Botanical Lab API",
        "database": "Supabase PostgreSQL",
        "notifications": "Telegram Bot API"
    }

# Register API Routers
app.include_router(readings.router)
app.include_router(alerts.router)
app.include_router(irrigation.router)
app.include_router(settings.router)
app.include_router(devices.router)
app.include_router(notifications.router)
