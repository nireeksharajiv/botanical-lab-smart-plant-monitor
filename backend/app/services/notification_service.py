import os
import json
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger("botanical_lab.notifications")

try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")
except Exception:
    IST = timezone(timedelta(hours=5, minutes=30), name="IST")

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def format_event_time_ist(dt: Optional[datetime]) -> str:
    """Convert UTC/aware datetime to Asia/Kolkata (IST) and format as '05:07 PM IST'."""
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_dt = dt.astimezone(IST)
    return ist_dt.strftime("%I:%M %p IST")

class NotificationService:
    @property
    def bot_token(self) -> Optional[str]:
        return os.getenv("TELEGRAM_BOT_TOKEN")

    @property
    def chat_id(self) -> Optional[str]:
        return os.getenv("TELEGRAM_CHAT_ID")

    def is_configured(self) -> bool:
        """Check if Telegram environment variables are present and non-placeholder."""
        token = self.bot_token
        chat = self.chat_id

        if not token or not chat:
            return False

        # Ignore placeholder values
        placeholders = [
            "your_bot_token",
            "your_telegram_bot_token_here",
            "your_chat_id",
            "your_telegram_chat_id_here"
        ]
        if any(p in token or p in chat for p in placeholders):
            return False

        return True

    def send_telegram_raw(self, recipient_chat_id: str, message_text: str) -> Dict[str, Any]:
        """
        Low-level Telegram Bot API message dispatch using Python standard library.
        Dispatches HTTP POST to https://api.telegram.org/bot<TOKEN>/sendMessage.
        Guaranteed non-blocking, safe logging (no token/secrets exposed).
        """
        if not self.is_configured():
            logger.info("Telegram notification skipped: Credentials not configured in backend/.env")
            return {
                "status": "failed",
                "error": "Telegram credentials not configured in backend/.env",
                "message_id": None
            }

        token = self.bot_token
        url = f"https://api.telegram.org/bot{token}/sendMessage"

        payload = json.dumps({
            "chat_id": recipient_chat_id,
            "text": message_text
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"}
        )

        try:
            masked_chat = recipient_chat_id[:3] + "****" if len(recipient_chat_id) > 4 else "****"
            logger.info(f"Sending Telegram message to chat {masked_chat}...")

            with urllib.request.urlopen(req, timeout=10) as response:
                res_body = response.read().decode("utf-8")
                res_data = json.loads(res_body)
                if res_data.get("ok"):
                    msg_id = res_data.get("result", {}).get("message_id")
                    logger.info(f"Telegram notification dispatched successfully. Message ID: {msg_id}")
                    return {
                        "status": "sent",
                        "message_id": msg_id,
                        "error": None
                    }
                else:
                    err_desc = res_data.get("description", "Unknown Telegram API error")
                    logger.error(f"Telegram API returned error: {err_desc}")
                    return {
                        "status": "failed",
                        "error": err_desc,
                        "message_id": None
                    }
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else str(e)
            err_str = f"HTTP {e.code}: {err_body}"
            if token and token in err_str:
                err_str = err_str.replace(token, "[REDACTED_BOT_TOKEN]")
            logger.error(f"Telegram notification delivery failed: {err_str}")
            return {
                "status": "failed",
                "error": err_str,
                "message_id": None
            }
        except Exception as e:
            err_str = str(e)
            if token and token in err_str:
                err_str = err_str.replace(token, "[REDACTED_BOT_TOKEN]")
            logger.error(f"Telegram notification delivery error: {err_str}")
            return {
                "status": "failed",
                "error": err_str,
                "message_id": None
            }

    def send_telegram_message(self, message_text: str) -> Dict[str, Any]:
        """Convenience method to dispatch a Telegram message to default chat ID."""
        recipient = self.chat_id or ""
        return self.send_telegram_raw(recipient, message_text)

    def format_alert_telegram(self, alert: models.Alert, device_name: Optional[str] = None) -> str:
        """
        Format concise Telegram notification text matching Botanical Lab specifications.
        Timestamps are formatted in Asia/Kolkata (IST).
        """
        time_str = format_event_time_ist(alert.timestamp)
        dev_label = device_name or "Plant Unit 01"
        cat = (alert.category or "").lower()
        alert_type = (alert.alert_type or "THRESHOLD").upper()

        # 1. Soil Moisture Alert
        if cat == "soil" or alert.sensor == "soil_moisture":
            val_str = f"{alert.value:.1f}%" if alert.value is not None else "Low"
            thresh_str = f"{alert.threshold:.1f}%" if alert.threshold is not None else "30.0%"
            return (
                f"🌿 BOTANICAL LAB ALERT\n\n"
                f"⚠️ SOIL MOISTURE LOW\n\n"
                f"Device: {dev_label}\n\n"
                f"Value: {val_str}\n"
                f"Threshold: {thresh_str}\n\n"
                f"Time: {time_str}"
            )

        # 2. Water Tank Low Alert (Critical)
        elif cat == "tank" or alert.sensor == "tank_level":
            val_str = f"{alert.value:.1f}%" if alert.value is not None else "Low"
            min_str = f"{alert.threshold:.1f}%" if alert.threshold is not None else "20.0%"
            return (
                f"🌿 BOTANICAL LAB CRITICAL\n\n"
                f"🔴 WATER TANK LOW\n\n"
                f"Device: {dev_label}\n\n"
                f"Level: {val_str}\n"
                f"Minimum: {min_str}\n\n"
                f"Pump stopped.\n\n"
                f"Time: {time_str}"
            )

        # 3. High Temperature Alert
        elif cat == "temperature" or alert.sensor == "temperature":
            val_str = f"{alert.value:.1f}°C" if alert.value is not None else "High"
            thresh_str = f"{alert.threshold:.1f}°C" if alert.threshold is not None else "35.0°C"
            return (
                f"🌿 BOTANICAL LAB WARNING\n\n"
                f"⚠️ HIGH TEMPERATURE DETECTED\n\n"
                f"Device: {dev_label}\n\n"
                f"Value: {val_str}\n"
                f"Threshold: {thresh_str}\n\n"
                f"Time: {time_str}"
            )

        # 4. Type B - Frequent Irrigation Triggers Alert
        elif alert_type == "FREQUENCY" or cat == "irrigation":
            events_count = int(alert.value) if alert.value is not None else 6
            return (
                f"🌿 BOTANICAL LAB WARNING\n\n"
                f"⚠️ FREQUENT IRRIGATION TRIGGERS\n\n"
                f"Device: {dev_label}\n\n"
                f"Pump ON events: {events_count}\n"
                f"Window: 1 hour\n\n"
                f"Possible sensor, pump, or system issue."
            )

        # 5. Device Offline Alert
        elif cat == "connectivity" and "offline" in alert.message.lower():
            return (
                f"🌿 BOTANICAL LAB\n\n"
                f"⚠️ ESP32 DEVICE OFFLINE\n\n"
                f"Device: {dev_label}\n\n"
                f"No sensor data received for 5 minutes."
            )

        # 6. Device Recovery Alert
        elif cat == "connectivity" and "online" in alert.message.lower():
            return (
                f"🌿 BOTANICAL LAB\n\n"
                f"✅ ESP32 DEVICE ONLINE\n\n"
                f"Device: {dev_label}\n\n"
                f"Sensor readings have resumed."
            )

        # Fallback Generic Alert
        severity_label = alert.severity.upper() if alert.severity else "WARNING"
        return (
            f"🌿 BOTANICAL LAB {severity_label}\n\n"
            f"{alert.message}\n\n"
            f"Device: {dev_label}\n\n"
            f"Time: {time_str}"
        )

    def send_alert_notification(self, db: Session, alert: models.Alert) -> Optional[models.Notification]:
        """
        Process and send Telegram notification for an alert record.
        Only sends for WARNING and CRITICAL (alert) severities.
        Checks for duplicate sent Telegram messages.
        Records Notification row in database.
        """
        # 1. Severity check: Only send notification for warning and alert/critical
        sev = (alert.severity or "").lower()
        if sev not in ["warning", "alert"]:
            logger.debug(f"Skipping Telegram notification for informational/normal alert #{alert.id}")
            return None

        # 2. Check device system settings (sms_enabled / notification setting)
        settings = db.query(models.SystemSettings).filter(
            models.SystemSettings.device_id == alert.device_id
        ).first()
        if settings and hasattr(settings, "sms_enabled") and not settings.sms_enabled:
            logger.info(f"Notifications disabled in settings for device {alert.device_id}")
            return None

        # 3. Duplicate protection: Check if Telegram notification already sent for this alert
        existing_sent = db.query(models.Notification).filter(
            models.Notification.alert_id == alert.id,
            models.Notification.channel == "telegram",
            models.Notification.status == "sent"
        ).first()
        if existing_sent:
            logger.info(f"Telegram notification already sent for alert #{alert.id} (Notification #{existing_sent.id}), skipping duplicate.")
            return existing_sent

        # 4. Lookup device name if available
        device_name = None
        if alert.device_id:
            dev = db.query(models.Device).filter(models.Device.id == alert.device_id).first()
            if dev:
                device_name = dev.location or dev.device_name

        # 5. Format Telegram message text
        message_text = self.format_alert_telegram(alert, device_name)
        recipient = self.chat_id or "default_chat"

        # 6. Dispatch Telegram notification
        dispatch_result = self.send_telegram_raw(recipient, message_text)

        # 7. Record Notification in database
        notification = models.Notification(
            alert_id=alert.id,
            device_id=alert.device_id,
            channel="telegram",
            recipient=recipient,
            message=message_text,
            status=dispatch_result["status"],
            sent_at=utc_now() if dispatch_result["status"] == "sent" else None,
            error_message=dispatch_result["error"]
        )
        try:
            db.add(notification)
            db.commit()
            db.refresh(notification)
            logger.info(f"Recorded Telegram notification #{notification.id} (status: {notification.status}) for alert #{alert.id}")
        except Exception as e:
            logger.error(f"Failed to persist Notification record in DB: {e}")
            db.rollback()

        return notification

    def format_daily_summary_telegram(
        self,
        device_name: str,
        soil_min: Optional[float],
        soil_max: Optional[float],
        tank_min: Optional[float],
        temp_min: Optional[float],
        temp_max: Optional[float],
        pump_runs: int
    ) -> str:
        """
        Format Daily Health Summary for Telegram.
        IMPORTANT: NO flow sensor -> strictly NO litres used calculation.
        """
        soil_min_str = f"{soil_min:.0f}%" if soil_min is not None else "--%"
        soil_max_str = f"{soil_max:.0f}%" if soil_max is not None else "--%"
        tank_min_str = f"{tank_min:.0f}%" if tank_min is not None else "--%"
        temp_min_str = f"{temp_min:.0f}°C" if temp_min is not None else "--°C"
        temp_max_str = f"{temp_max:.0f}°C" if temp_max is not None else "--°C"

        return (
            f"🌿 BOTANICAL LAB DAILY SUMMARY\n\n"
            f"Device: {device_name}\n\n"
            f"Soil:\n"
            f"Min: {soil_min_str}\n"
            f"Max: {soil_max_str}\n\n"
            f"Pump:\n"
            f"Runs: {pump_runs}\n\n"
            f"Tank:\n"
            f"Min: {tank_min_str}\n\n"
            f"Temperature:\n"
            f"Min: {temp_min_str}\n"
            f"Max: {temp_max_str}"
        )

# Global singleton instance
notification_service = NotificationService()
