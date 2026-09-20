import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Set, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import SessionLocal
from app import models
from app.services.alert_engine import create_alert, resolve_active_alerts_for_sensor
from app.services.notification_service import notification_service

logger = logging.getLogger("botanical_lab.offline_checker")

try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")
except Exception:
    IST = timezone(timedelta(hours=5, minutes=30), name="IST")

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

# Tracking state
_offline_devices: Set[int] = set()
_last_summary_date: Optional[str] = None
_checker_task: Optional[asyncio.Task] = None

async def check_device_offline_and_recovery(db: Session):
    """
    Check all active devices for offline conditions (no readings for > timeout).
    Emits ONE offline alert per outage, and ONE recovery alert when telemetry resumes.
    Prevents startup alert spam for devices already in offline state.
    """
    try:
        active_devices = db.query(models.Device).filter(models.Device.is_active == True).all()

        for dev in active_devices:
            settings = db.query(models.SystemSettings).filter(models.SystemSettings.device_id == dev.id).first()
            if not settings or not getattr(settings, "offline_alert_enabled", True):
                continue

            timeout_secs = getattr(settings, "offline_timeout_seconds", 300)

            # Query the newest sensor reading timestamp for this device
            latest_reading = db.query(models.SensorReading).filter(
                models.SensorReading.device_id == dev.id
            ).order_by(models.SensorReading.timestamp.desc()).first()

            now = utc_now()
            is_offline = False

            if not latest_reading:
                # Device has never sent telemetry readings; do not trigger offline outage
                continue
            else:
                reading_time = ensure_utc(latest_reading.timestamp)
                if reading_time:
                    elapsed = (now - reading_time).total_seconds()
                    if elapsed > timeout_secs:
                        is_offline = True

            dev_label = dev.location or dev.device_name

            # Check if active unresolved offline alert already exists in database
            existing_unresolved_offline_alert = db.query(models.Alert).filter(
                models.Alert.device_id == dev.id,
                models.Alert.category == "connectivity",
                models.Alert.message.like("%offline%"),
                models.Alert.is_resolved == False
            ).first()

            # 1. Transition to OFFLINE: Device just went offline
            if is_offline:
                if existing_unresolved_offline_alert:
                    # Sync in-memory state on startup / reboot without re-alerting
                    _offline_devices.add(dev.id)
                    continue

                if dev.id not in _offline_devices:
                    _offline_devices.add(dev.id)
                    msg = f"ESP32 device appears offline. No sensor data received for {int(timeout_secs / 60)} minutes."
                    create_alert(
                        db=db,
                        device_id=dev.id,
                        category="connectivity",
                        message=msg,
                        severity="alert",
                        alert_type="THRESHOLD",
                        sensor=None,
                        value=None,
                        threshold=float(timeout_secs)
                    )
                    logger.warning(f"[OFFLINE CHECKER] Device #{dev.id} ({dev_label}) marked OFFLINE. Single alert generated.")

            # 2. Transition to RECOVERY: Device came back online
            elif not is_offline and (dev.id in _offline_devices or existing_unresolved_offline_alert):
                _offline_devices.discard(dev.id)
                # Resolve active offline alerts
                resolve_active_alerts_for_sensor(db, dev.id, sensor="", category="connectivity")
                
                # Emit recovery alert (resolved immediately)
                msg = f"ESP32 device is back online."
                create_alert(
                    db=db,
                    device_id=dev.id,
                    category="connectivity",
                    message=msg,
                    severity="warning",
                    alert_type="THRESHOLD",
                    sensor=None,
                    value=None,
                    threshold=None,
                    is_resolved=True
                )
                logger.info(f"[OFFLINE CHECKER] Device #{dev.id} ({dev_label}) recovered and is ONLINE. Single recovery alert generated.")
    except Exception as e:
        logger.error(f"[OFFLINE CHECKER] Error in offline check: {e}")

async def check_daily_summary(db: Session):
    """
    Check if a daily summary Telegram notification should be dispatched at the configured hour (Asia/Kolkata IST).
    IMPORTANT: NO flow sensor -> strictly NO litres used calculation.
    """
    global _last_summary_date
    now_ist = datetime.now(IST)
    today_str = now_ist.strftime("%Y-%m-%d")

    if _last_summary_date == today_str:
        return  # Already sent today

    try:
        active_devices = db.query(models.Device).filter(models.Device.is_active == True).all()

        for dev in active_devices:
            settings = db.query(models.SystemSettings).filter(models.SystemSettings.device_id == dev.id).first()
            if not settings or not getattr(settings, "daily_summary_enabled", False):
                continue

            target_hour = getattr(settings, "daily_summary_hour", 8)
            if now_ist.hour != target_hour:
                continue

            # Query past 24 hours of telemetry
            since = utc_now() - timedelta(hours=24)
            dev_label = dev.location or dev.device_name

            # 1. Soil moisture min/max
            soil_stats = db.query(
                func.min(models.SensorReading.raw_value),
                func.max(models.SensorReading.raw_value)
            ).filter(
                models.SensorReading.device_id == dev.id,
                models.SensorReading.sensor == "soil_moisture",
                models.SensorReading.timestamp >= since
            ).first()

            # 2. Tank level min
            tank_min = db.query(
                func.min(models.SensorReading.raw_value)
            ).filter(
                models.SensorReading.device_id == dev.id,
                models.SensorReading.sensor == "tank_level",
                models.SensorReading.timestamp >= since
            ).scalar()

            # 3. Temperature min/max
            temp_stats = db.query(
                func.min(models.SensorReading.raw_value),
                func.max(models.SensorReading.raw_value)
            ).filter(
                models.SensorReading.device_id == dev.id,
                models.SensorReading.sensor == "temperature",
                models.SensorReading.timestamp >= since
            ).first()

            # 4. Pump ON runs in 24 hours
            pump_runs = db.query(
                func.count(models.IrrigationEvent.id)
            ).filter(
                models.IrrigationEvent.device_id == dev.id,
                models.IrrigationEvent.action == "ON",
                models.IrrigationEvent.timestamp >= since
            ).scalar() or 0

            # Format Daily Summary (Strictly NO litres used)
            summary_msg = notification_service.format_daily_summary_telegram(
                device_name=dev_label,
                soil_min=soil_stats[0] if soil_stats else None,
                soil_max=soil_stats[1] if soil_stats else None,
                tank_min=tank_min,
                temp_min=temp_stats[0] if temp_stats else None,
                temp_max=temp_stats[1] if temp_stats else None,
                pump_runs=pump_runs
            )

            recipient = notification_service.chat_id or "default_chat"
            result = notification_service.send_telegram_raw(recipient, summary_msg)

            # Record in notifications table
            notif = models.Notification(
                alert_id=None,
                device_id=dev.id,
                channel="telegram",
                recipient=recipient,
                message=summary_msg,
                status=result["status"],
                sent_at=utc_now() if result["status"] == "sent" else None,
                error_message=result["error"]
            )
            db.add(notif)
            db.commit()

            _last_summary_date = today_str
            logger.info(f"[DAILY SUMMARY] Dispatched Telegram summary for device #{dev.id}")
    except Exception as e:
        logger.error(f"[DAILY SUMMARY] Error generating daily summary: {e}")

async def offline_checker_loop():
    """Controlled periodic loop running approximately every 60 seconds."""
    logger.info("Starting Botanical Lab background offline & daily summary checker...")
    while True:
        try:
            db = SessionLocal()
            try:
                await check_device_offline_and_recovery(db)
                await check_daily_summary(db)
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[OFFLINE CHECKER] Loop error: {e}")

        await asyncio.sleep(60)

def start_offline_checker():
    """Start the background offline checker daemon task."""
    global _checker_task
    if _checker_task is None or _checker_task.done():
        _checker_task = asyncio.create_task(offline_checker_loop())
        logger.info("Offline checker task initialized.")

def stop_offline_checker():
    """Cleanly cancel the background offline checker daemon task on shutdown."""
    global _checker_task
    if _checker_task and not _checker_task.done():
        _checker_task.cancel()
        _checker_task = None
        logger.info("Offline checker task stopped.")
