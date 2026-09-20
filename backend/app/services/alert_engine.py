from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models, schemas
from app.services.event_broadcaster import broadcaster

# In-memory tracking structures for debounce and cooldown
# _debounce_state: (device_id, sensor) -> int (consecutive qualifying count)
_debounce_state: Dict[Tuple[Optional[int], str], int] = {}

# _cooldown_state: (device_id, alert_type, category, sensor) -> datetime (timestamp of last generated alert)
_cooldown_state: Dict[Tuple[Optional[int], str, str, Optional[str]], datetime] = {}

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def get_device_settings(db: Session, device_id: Optional[int]) -> models.SystemSettings:
    """Retrieve or create system settings for the device."""
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

def check_cooldown(
    device_id: Optional[int],
    alert_type: str,
    category: str,
    sensor: Optional[str],
    cooldown_seconds: int
) -> bool:
    """
    Returns True if we can generate an alert (cooldown has passed or first alert).
    Returns False if still within cooldown period.
    """
    key = (device_id, alert_type, category, sensor)
    last_time = _cooldown_state.get(key)
    if last_time is None:
        return True
    
    elapsed = (utc_now() - last_time).total_seconds()
    return elapsed >= cooldown_seconds

def record_cooldown(
    device_id: Optional[int],
    alert_type: str,
    category: str,
    sensor: Optional[str]
):
    """Record timestamp for cooldown tracking."""
    key = (device_id, alert_type, category, sensor)
    _cooldown_state[key] = utc_now()

def check_debounce(
    device_id: Optional[int],
    sensor: str,
    is_qualifying: bool,
    required_samples: int
) -> bool:
    """
    Tracks consecutive qualifying readings.
    Returns True if threshold has been met for required_samples consecutive times.
    """
    key = (device_id, sensor)
    if not is_qualifying:
        _debounce_state[key] = 0
        return False

    current_count = _debounce_state.get(key, 0) + 1
    _debounce_state[key] = current_count
    return current_count >= required_samples

def reset_debounce(device_id: Optional[int], sensor: str):
    """Reset debounce counter for a sensor."""
    _debounce_state[(device_id, sensor)] = 0

def create_alert(
    db: Session,
    device_id: Optional[int],
    category: str,
    message: str,
    severity: str = "warning",
    alert_type: str = "THRESHOLD",
    sensor: Optional[str] = None,
    value: Optional[float] = None,
    threshold: Optional[float] = None,
    is_resolved: bool = False
) -> models.Alert:
    """Create, persist, and broadcast a new alert."""
    alert = models.Alert(
        device_id=device_id,
        timestamp=utc_now(),
        category=category,
        message=message,
        severity=severity,
        is_resolved=is_resolved,
        acknowledged=False,
        alert_type=alert_type,
        sensor=sensor,
        value=value,
        threshold=threshold
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    # Record cooldown
    record_cooldown(device_id, alert_type, category, sensor)

    # Broadcast live SSE event
    alert_data = {
        "id": alert.id,
        "device_id": alert.device_id,
        "timestamp": (alert.timestamp if alert.timestamp.tzinfo else alert.timestamp.replace(tzinfo=timezone.utc)).isoformat() if alert.timestamp else None,
        "category": alert.category,
        "message": alert.message,
        "severity": alert.severity,
        "is_resolved": alert.is_resolved,
        "acknowledged": alert.acknowledged,
        "alert_type": alert.alert_type,
        "sensor": alert.sensor,
        "value": alert.value,
        "threshold": alert.threshold
    }
    broadcaster.broadcast("alert_created", alert_data)
    print(f"[ALERT ENGINE] Created and broadcasted alert #{alert.id} ({severity.upper()}): {message}")

    # Trigger Telegram notification for WARNING/CRITICAL severities (guaranteed non-blocking)
    try:
        from app.services.notification_service import notification_service
        notification_service.send_alert_notification(db, alert)
    except Exception as e:
        print(f"[WARN] Error dispatching Telegram notification for alert #{alert.id}: {e}")

    return alert

def resolve_active_alerts_for_sensor(
    db: Session,
    device_id: Optional[int],
    sensor: str,
    category: str
) -> int:
    """
    Resolves any active (unresolved) alerts for the given device and sensor/category.
    Returns count of resolved alerts.
    """
    query = db.query(models.Alert).filter(
        models.Alert.is_resolved == False,
        models.Alert.category == category
    )
    if device_id is not None:
        query = query.filter(models.Alert.device_id == device_id)
    if sensor:
        query = query.filter(models.Alert.sensor == sensor)

    active_alerts = query.all()
    resolved_count = 0

    for alert in active_alerts:
        alert.is_resolved = True
        resolved_count += 1
        # Broadcast resolution
        broadcaster.broadcast("alert_resolved", {
            "id": alert.id,
            "device_id": alert.device_id,
            "category": alert.category,
            "sensor": alert.sensor,
            "is_resolved": True,
            "acknowledged": alert.acknowledged,
            "message": f"Alert condition resolved for {sensor}"
        })
        print(f"[ALERT ENGINE] Auto-resolved alert #{alert.id} for {sensor} (Condition cleared)")

    if resolved_count > 0:
        db.commit()
        reset_debounce(device_id, sensor)

    return resolved_count

def evaluate_sensor_reading(db: Session, reading: models.SensorReading) -> Optional[models.Alert]:
    """
    Main evaluation pipeline called on every sensor reading ingestion.
    Evaluates:
      1. Soil Moisture Low (Trigger < soil_start, Clear >= soil_stop)
      2. Tank Level Low (Trigger < tank_min, Clear >= tank_min + 5.0)
      3. High Temperature (Trigger > high_temp, Clear <= high_temp - 2.0)
    Applies debounce, hysteresis, and cooldown.
    """
    settings = get_device_settings(db, reading.device_id)
    val = reading.raw_value
    sensor = reading.sensor
    dev_id = reading.device_id

    # ----------------------------------------------------
    # 1. SOIL MOISTURE EVALUATION
    # ----------------------------------------------------
    if sensor == "soil_moisture":
        start_thresh = settings.soil_start_threshold  # Default: 30.0%
        stop_thresh = settings.soil_stop_threshold    # Default: 45.0%

        # Check Clear Condition (Hysteresis)
        if val >= stop_thresh:
            resolve_active_alerts_for_sensor(db, dev_id, "soil_moisture", "soil")
            reset_debounce(dev_id, "soil_moisture")
            return None

        # Check Trigger Condition
        is_qualifying = val < start_thresh
        is_debounced = check_debounce(dev_id, "soil_moisture", is_qualifying, settings.debounce_samples)

        if is_debounced:
            # Check if active unresolved alert already exists
            existing_active = db.query(models.Alert).filter(
                models.Alert.device_id == dev_id,
                models.Alert.category == "soil",
                models.Alert.sensor == "soil_moisture",
                models.Alert.is_resolved == False
            ).first()

            can_alert = check_cooldown(dev_id, "THRESHOLD", "soil", "soil_moisture", settings.cooldown_seconds)

            if not existing_active or can_alert:
                msg = f"Soil moisture has fallen below start threshold ({val:.1f}% < {start_thresh:.1f}%)"
                return create_alert(
                    db=db,
                    device_id=dev_id,
                    category="soil",
                    message=msg,
                    severity="warning",
                    alert_type="THRESHOLD",
                    sensor="soil_moisture",
                    value=round(val, 2),
                    threshold=round(start_thresh, 2)
                )

    # ----------------------------------------------------
    # 2. TANK LEVEL EVALUATION
    # ----------------------------------------------------
    elif sensor == "tank_level":
        min_thresh = settings.tank_minimum_threshold  # Default: 20.0%
        clear_thresh = min_thresh + 5.0              # Hysteresis clear margin: 25.0%

        # Check Clear Condition (Hysteresis)
        if val >= clear_thresh:
            resolve_active_alerts_for_sensor(db, dev_id, "tank_level", "tank")
            reset_debounce(dev_id, "tank_level")
            return None

        # Check Trigger Condition
        is_qualifying = val < min_thresh
        is_debounced = check_debounce(dev_id, "tank_level", is_qualifying, settings.debounce_samples)

        if is_debounced:
            existing_active = db.query(models.Alert).filter(
                models.Alert.device_id == dev_id,
                models.Alert.category == "tank",
                models.Alert.sensor == "tank_level",
                models.Alert.is_resolved == False
            ).first()

            can_alert = check_cooldown(dev_id, "THRESHOLD", "tank", "tank_level", settings.cooldown_seconds)

            if not existing_active or can_alert:
                msg = f"Water tank level is low ({val:.1f}% < {min_thresh:.1f}%)"
                return create_alert(
                    db=db,
                    device_id=dev_id,
                    category="tank",
                    message=msg,
                    severity="warning",
                    alert_type="THRESHOLD",
                    sensor="tank_level",
                    value=round(val, 2),
                    threshold=round(min_thresh, 2)
                )

    # ----------------------------------------------------
    # 3. TEMPERATURE EVALUATION
    # ----------------------------------------------------
    elif sensor == "temperature":
        high_thresh = getattr(settings, "high_temp_threshold", 35.0)  # Default: 35.0°C
        clear_thresh = high_thresh - 2.0                             # Hysteresis clear margin: 33.0°C

        # Check Clear Condition (Hysteresis)
        if val <= clear_thresh:
            resolve_active_alerts_for_sensor(db, dev_id, "temperature", "temperature")
            reset_debounce(dev_id, "temperature")
            return None

        # Check Trigger Condition
        is_qualifying = val > high_thresh
        is_debounced = check_debounce(dev_id, "temperature", is_qualifying, settings.debounce_samples)

        if is_debounced:
            existing_active = db.query(models.Alert).filter(
                models.Alert.device_id == dev_id,
                models.Alert.category == "temperature",
                models.Alert.sensor == "temperature",
                models.Alert.is_resolved == False
            ).first()

            can_alert = check_cooldown(dev_id, "THRESHOLD", "temperature", "temperature", settings.cooldown_seconds)

            if not existing_active or can_alert:
                msg = f"High ambient temperature detected ({val:.1f}°C > {high_thresh:.1f}°C)"
                return create_alert(
                    db=db,
                    device_id=dev_id,
                    category="temperature",
                    message=msg,
                    severity="warning",
                    alert_type="THRESHOLD",
                    sensor="temperature",
                    value=round(val, 2),
                    threshold=round(high_thresh, 2)
                )

    return None

def check_pump_frequency(db: Session, device_id: Optional[int]) -> Optional[models.Alert]:
    """
    Type B Diagnostic Alert:
    Evaluates irrigation event frequency over a sliding 1-hour window.
    Triggers warning if pump ON count > 5 events within 1 hour.
    Applies 1-hour cooldown to avoid duplicate alerts on every pump trigger.
    """
    one_hour_ago = utc_now() - timedelta(hours=1)
    
    query = db.query(func.count(models.IrrigationEvent.id)).filter(
        models.IrrigationEvent.action == "ON",
        models.IrrigationEvent.timestamp >= one_hour_ago
    )
    if device_id is not None:
        query = query.filter(models.IrrigationEvent.device_id == device_id)
        
    pump_on_count = query.scalar() or 0

    if pump_on_count > 5:
        # Check cooldown (3600 seconds = 1 hour)
        can_alert = check_cooldown(device_id, "FREQUENCY", "irrigation", None, 3600)
        
        # Check if unresolved active frequency alert already exists
        existing_active = db.query(models.Alert).filter(
            models.Alert.alert_type == "FREQUENCY",
            models.Alert.category == "irrigation",
            models.Alert.is_resolved == False
        )
        if device_id is not None:
            existing_active = existing_active.filter(models.Alert.device_id == device_id)
        active_alert = existing_active.first()

        if not active_alert or can_alert:
            msg = "Frequent pump triggering detected — possible leak, faulty sensor, or pump delivery issue."
            return create_alert(
                db=db,
                device_id=device_id,
                category="irrigation",
                message=msg,
                severity="warning",
                alert_type="FREQUENCY",
                sensor=None,
                value=float(pump_on_count),
                threshold=5.0
            )

    return None

def acknowledge_alert(db: Session, alert_id: int) -> Optional[models.Alert]:
    """Mark alert as acknowledged and broadcast update."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        return None

    alert.acknowledged = True
    db.commit()
    db.refresh(alert)

    # Broadcast SSE update
    broadcaster.broadcast("alert_acknowledged", {
        "id": alert.id,
        "device_id": alert.device_id,
        "category": alert.category,
        "sensor": alert.sensor,
        "is_resolved": alert.is_resolved,
        "acknowledged": True,
        "message": alert.message
    })
    print(f"[ALERT ENGINE] Acknowledged alert #{alert.id}")
    return alert

def resolve_alert(db: Session, alert_id: int) -> Optional[models.Alert]:
    """Manually mark alert as resolved and broadcast update."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        return None

    alert.is_resolved = True
    db.commit()
    db.refresh(alert)

    # Broadcast SSE update
    broadcaster.broadcast("alert_resolved", {
        "id": alert.id,
        "device_id": alert.device_id,
        "category": alert.category,
        "sensor": alert.sensor,
        "is_resolved": True,
        "acknowledged": alert.acknowledged,
        "message": alert.message
    })
    print(f"[ALERT ENGINE] Resolved alert #{alert.id}")
    return alert
