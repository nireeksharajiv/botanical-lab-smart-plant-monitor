from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/api/irrigation-events",
    tags=["irrigation"]
)

from app.services.alert_engine import check_pump_frequency

@router.post("", response_model=schemas.IrrigationEventResponse, status_code=status.HTTP_201_CREATED)
def create_irrigation_event(event: schemas.IrrigationEventCreate, db: Session = Depends(get_db)):
    db_event = models.IrrigationEvent(**event.model_dump(exclude_unset=True))
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    # Check for frequent pump trigger diagnostics (Type B warning)
    try:
        check_pump_frequency(db, db_event.device_id)
    except Exception as e:
        print(f"[WARN] Alert engine pump frequency evaluation error: {e}")
        
    return db_event

@router.get("", response_model=List[schemas.IrrigationEventResponse])
def get_irrigation_events(
    device_id: Optional[int] = Query(None, description="Filter by device ID"),
    limit: int = Query(100, ge=1, le=1000, description="Max events to return"),
    db: Session = Depends(get_db)
):
    query = db.query(models.IrrigationEvent)
    if device_id is not None:
        query = query.filter(models.IrrigationEvent.device_id == device_id)
    return query.order_by(models.IrrigationEvent.timestamp.desc()).limit(limit).all()
