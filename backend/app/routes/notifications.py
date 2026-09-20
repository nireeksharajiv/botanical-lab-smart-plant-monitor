from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app import models, schemas
from app.database import get_db
from app.services.notification_service import notification_service

router = APIRouter(
    prefix="/api/notifications",
    tags=["notifications"]
)

@router.get("", response_model=List[schemas.NotificationResponse])
def get_notifications(
    device_id: Optional[int] = Query(None, description="Filter by device ID"),
    alert_id: Optional[int] = Query(None, description="Filter by alert ID"),
    status: Optional[str] = Query(None, description="Filter by status (pending, sent, failed)"),
    limit: int = Query(100, ge=1, le=1000, description="Max records to return"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Notification)
    if isinstance(device_id, int):
        query = query.filter(models.Notification.device_id == device_id)
    if isinstance(alert_id, int):
        query = query.filter(models.Notification.alert_id == alert_id)
    if isinstance(status, str):
        query = query.filter(models.Notification.status == status.lower())
    query = query.order_by(models.Notification.created_at.desc())
    if isinstance(limit, int):
        query = query.limit(limit)
    return query.all()

@router.get("/{notification_id}", response_model=schemas.NotificationResponse)
def get_notification(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification #{notification_id} not found"
        )
    return notif

@router.post("/test", response_model=schemas.NotificationResponse, status_code=status.HTTP_201_CREATED)
def send_test_notification(db: Session = Depends(get_db)):
    """
    Explicit test endpoint to trigger a sample Telegram notification.
    Does NOT leak credentials in response or logs.
    """
    recipient = notification_service.chat_id or "default_chat"
    test_msg = (
        f"🌿 BOTANICAL LAB TEST\n\n"
        f"Telegram notification system is working."
    )

    result = notification_service.send_telegram_raw(recipient, test_msg)

    notif = models.Notification(
        alert_id=None,
        device_id=None,
        channel="telegram",
        recipient=recipient,
        message=test_msg,
        status=result["status"],
        sent_at=datetime.now(timezone.utc) if result["status"] == "sent" else None,
        error_message=result["error"]
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif
