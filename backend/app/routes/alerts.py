from fastapi import APIRouter, Depends, Query, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import asyncio

from app import models, schemas
from app.database import get_db
from app.services.event_broadcaster import broadcaster
from app.services.alert_engine import (
    acknowledge_alert as engine_ack_alert,
    resolve_alert as engine_res_alert,
    create_alert as engine_create_alert
)

router = APIRouter(
    prefix="/api/alerts",
    tags=["alerts"]
)

@router.get("/stream")
async def stream_alerts(request: Request):
    """
    Server-Sent Events (SSE) endpoint providing live real-time alert events.
    Supports auto-reconnection and periodic keepalive pings.
    """
    async def event_generator():
        queue = broadcaster.subscribe()
        try:
            # Initial connection handshake event
            yield 'event: connected\ndata: {"status": "connected", "message": "SSE connection established"}\n\n'
            
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break
                
                try:
                    # Wait for next event or trigger keepalive after 15s
                    message = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield message
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("", response_model=schemas.AlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(alert: schemas.AlertCreate, db: Session = Depends(get_db)):
    created = engine_create_alert(
        db=db,
        device_id=alert.device_id,
        category=alert.category or "system",
        message=alert.message,
        severity=alert.severity,
        alert_type=alert.alert_type or "THRESHOLD",
        sensor=alert.sensor,
        value=alert.value,
        threshold=alert.threshold
    )
    return created

@router.get("", response_model=List[schemas.AlertResponse])
def get_alerts(
    device_id: Optional[int] = Query(None, description="Filter by device ID"),
    is_resolved: Optional[bool] = Query(None, description="Filter by resolution status"),
    acknowledged: Optional[bool] = Query(None, description="Filter by acknowledged status"),
    severity: Optional[str] = Query(None, description="Filter by severity (normal, warning, alert)"),
    limit: int = Query(100, ge=1, le=1000, description="Max alerts to return"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Alert)
    if device_id is not None:
        query = query.filter(models.Alert.device_id == device_id)
    if is_resolved is not None:
        query = query.filter(models.Alert.is_resolved == is_resolved)
    if acknowledged is not None:
        query = query.filter(models.Alert.acknowledged == acknowledged)
    if severity is not None:
        query = query.filter(models.Alert.severity == severity.lower())
    return query.order_by(models.Alert.timestamp.desc()).limit(limit).all()

@router.patch("/{alert_id}/acknowledge", response_model=schemas.AlertResponse)
def patch_acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = engine_ack_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert #{alert_id} not found")
    return alert

@router.patch("/{alert_id}/resolve", response_model=schemas.AlertResponse)
def patch_resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = engine_res_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert #{alert_id} not found")
    return alert
