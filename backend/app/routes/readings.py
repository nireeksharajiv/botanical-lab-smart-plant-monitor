from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/api/readings",
    tags=["readings"]
)

from app.services.alert_engine import evaluate_sensor_reading

@router.post("", response_model=schemas.SensorReadingResponse, status_code=status.HTTP_201_CREATED)
def create_reading(reading: schemas.SensorReadingCreate, db: Session = Depends(get_db)):
    db_reading = models.SensorReading(**reading.model_dump())
    db.add(db_reading)
    db.commit()
    db.refresh(db_reading)
    
    # Evaluate reading against threshold & debounce alert rules
    try:
        evaluate_sensor_reading(db, db_reading)
    except Exception as e:
        print(f"[WARN] Alert engine evaluation error on reading #{db_reading.id}: {e}")
        
    return db_reading

@router.get("", response_model=List[schemas.SensorReadingResponse])
def get_readings(
    device_id: Optional[int] = None,
    sensor: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(models.SensorReading)
    if device_id is not None:
        query = query.filter(models.SensorReading.device_id == device_id)
    if sensor is not None:
        query = query.filter(models.SensorReading.sensor == sensor)
    return query.order_by(models.SensorReading.timestamp.desc()).limit(limit).all()

@router.get("/latest", response_model=List[schemas.SensorReadingResponse])
def get_latest_readings(
    device_id: Optional[int] = None,
    sensor: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if sensor is not None:
        query = db.query(models.SensorReading).filter(models.SensorReading.sensor == sensor)
        if device_id is not None:
            query = query.filter(models.SensorReading.device_id == device_id)
        reading = query.order_by(models.SensorReading.timestamp.desc()).first()
        return [reading] if reading else []

    # Get distinct sensors for the device (or all devices)
    sensor_query = db.query(models.SensorReading.sensor)
    if device_id is not None:
        sensor_query = sensor_query.filter(models.SensorReading.device_id == device_id)
    distinct_sensors = sensor_query.distinct().all()

    latest_readings = []
    for (s,) in distinct_sensors:
        q = db.query(models.SensorReading).filter(models.SensorReading.sensor == s)
        if device_id is not None:
            q = q.filter(models.SensorReading.device_id == device_id)
        latest_item = q.order_by(models.SensorReading.timestamp.desc()).first()
        if latest_item:
            latest_readings.append(latest_item)

    return latest_readings
