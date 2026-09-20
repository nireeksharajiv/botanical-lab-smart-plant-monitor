from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"]
)

def get_or_create_device_settings(db: Session, device_id: Optional[int] = None) -> models.SystemSettings:
    query = db.query(models.SystemSettings)
    if device_id is not None:
        query = query.filter(models.SystemSettings.device_id == device_id)
    settings = query.first()

    if not settings:
        settings = models.SystemSettings(
            device_id=device_id,
            auto_mode=True,
            soil_start_threshold=30.0,
            soil_stop_threshold=45.0,
            tank_minimum_threshold=20.0,
            high_temp_threshold=35.0,
            debounce_samples=3,
            cooldown_seconds=300
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.get("", response_model=schemas.SystemSettingsResponse)
def get_global_settings(db: Session = Depends(get_db)):
    return get_or_create_device_settings(db, None)

@router.put("", response_model=schemas.SystemSettingsResponse)
def update_global_settings(settings_update: schemas.SystemSettingsUpdate, db: Session = Depends(get_db)):
    settings = get_or_create_device_settings(db, None)
    update_data = settings_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings

@router.get("/{device_id}", response_model=schemas.SystemSettingsResponse)
def get_device_settings(device_id: int, db: Session = Depends(get_db)):
    return get_or_create_device_settings(db, device_id)

@router.put("/{device_id}", response_model=schemas.SystemSettingsResponse)
def update_device_settings(
    device_id: int,
    settings_update: schemas.SystemSettingsUpdate,
    db: Session = Depends(get_db)
):
    settings = get_or_create_device_settings(db, device_id)
    update_data = settings_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings
