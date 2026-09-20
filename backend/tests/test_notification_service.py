import sys
import os
import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import Base
from app import models, schemas
from app.services import alert_engine
from app.services.notification_service import notification_service
from app.services import offline_checker

class TestNotificationService(unittest.TestCase):
    def setUp(self):
        """Set up an isolated in-memory SQLite database and mocked environment."""
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Clear alert engine and offline checker state
        alert_engine._debounce_state.clear()
        alert_engine._cooldown_state.clear()
        offline_checker._offline_devices.clear()
        offline_checker._last_summary_date = None

        # Create test device
        self.device = models.Device(
            device_name="Botanical Node 01",
            device_type="ESP32",
            location="Indoor Green Unit",
            is_active=True
        )
        self.db.add(self.device)
        self.db.commit()
        self.db.refresh(self.device)

        # Create test settings
        self.settings = models.SystemSettings(
            device_id=self.device.id,
            auto_mode=True,
            soil_start_threshold=30.0,
            soil_stop_threshold=45.0,
            tank_minimum_threshold=20.0,
            high_temp_threshold=35.0,
            debounce_samples=3,
            cooldown_seconds=300,
            sms_enabled=True,
            daily_summary_enabled=False,
            offline_alert_enabled=True,
            offline_timeout_seconds=300,
            daily_summary_hour=8
        )
        self.db.add(self.settings)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @patch.dict(os.environ, {
        "TELEGRAM_BOT_TOKEN": "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ_TEST",
        "TELEGRAM_CHAT_ID": "987654321"
    })
    def test_01_and_02_service_initialization(self):
        """1 & 2. Verify Telegram service initializes bot token and chat ID from environment variables."""
        self.assertEqual(notification_service.bot_token, "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ_TEST")
        self.assertEqual(notification_service.chat_id, "987654321")
        self.assertTrue(notification_service.is_configured())
        print("  [OK] Test 1 & 2: Telegram service initialization from environment passed.")

    @patch.dict(os.environ, {
        "TELEGRAM_BOT_TOKEN": "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ_TEST",
        "TELEGRAM_CHAT_ID": "987654321"
    })
    @patch.object(notification_service, "send_telegram_raw", return_value={"status": "sent", "message_id": 101, "error": None})
    def test_03_warning_alert_sends_telegram(self, mock_send):
        """3. Verify WARNING alert triggers Telegram notification dispatch."""
        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="soil",
            message="Soil moisture has fallen below start threshold (24.0% < 30.0%)",
            severity="warning",
            alert_type="THRESHOLD",
            sensor="soil_moisture",
            value=24.0,
            threshold=30.0
        )
        mock_send.assert_called_once()
        recipient, message = mock_send.call_args[0]
        self.assertEqual(recipient, "987654321")
        self.assertIn("🌿 BOTANICAL LAB ALERT", message)
        self.assertIn("⚠️ SOIL MOISTURE LOW", message)
        self.assertIn("24.0%", message)

        # Check notification persisted in DB
        notif = self.db.query(models.Notification).filter(models.Notification.alert_id == alert.id).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status, "sent")
        self.assertEqual(notif.channel, "telegram")
        print("  [OK] Test 3: WARNING alert triggers Telegram notification passed.")

    @patch.dict(os.environ, {
        "TELEGRAM_BOT_TOKEN": "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ_TEST",
        "TELEGRAM_CHAT_ID": "987654321"
    })
    @patch.object(notification_service, "send_telegram_raw", return_value={"status": "sent", "message_id": 102, "error": None})
    def test_04_critical_alert_sends_telegram(self, mock_send):
        """4. Verify CRITICAL (alert severity) triggers concise critical Telegram message."""
        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="tank",
            message="Water tank level is too low (15.0% < 20.0%)",
            severity="alert",
            alert_type="THRESHOLD",
            sensor="tank_level",
            value=15.0,
            threshold=20.0
        )
        mock_send.assert_called_once()
        _, message = mock_send.call_args[0]
        self.assertIn("🌿 BOTANICAL LAB CRITICAL", message)
        self.assertIn("🔴 WATER TANK LOW", message)
        self.assertIn("15.0%", message)
        print("  [OK] Test 4: CRITICAL alert triggers Telegram notification passed.")

    @patch.object(notification_service, "send_telegram_raw")
    def test_05_info_alert_does_not_send_telegram(self, mock_send):
        """5. Verify INFO/normal alerts do NOT send Telegram notification."""
        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="system",
            message="System nominal operating status",
            severity="normal",
            alert_type="THRESHOLD"
        )
        mock_send.assert_not_called()
        notifs = self.db.query(models.Notification).filter(models.Notification.alert_id == alert.id).all()
        self.assertEqual(len(notifs), 0)
        print("  [OK] Test 5: INFO alert does NOT send Telegram notification passed.")

    @patch.object(notification_service, "send_telegram_raw", return_value={"status": "sent", "message_id": 103, "error": None})
    def test_06_duplicate_notification_protection(self, mock_send):
        """6. Verify duplicate check prevents sending Telegram message multiple times for same alert_id."""
        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="temperature",
            message="High temperature detected (36.0°C)",
            severity="warning",
            alert_type="THRESHOLD",
            sensor="temperature",
            value=36.0,
            threshold=35.0
        )
        self.assertEqual(mock_send.call_count, 1)

        # Call send_alert_notification again explicitly for same alert
        res = notification_service.send_alert_notification(self.db, alert)
        self.assertEqual(mock_send.call_count, 1, "Should skip duplicate dispatch for same alert")
        self.assertEqual(res.status, "sent")
        print("  [OK] Test 6: Duplicate notification protection passed.")

    @patch.object(notification_service, "send_telegram_raw", return_value={"status": "failed", "message_id": None, "error": "Telegram API Timeout (408)"})
    def test_07_and_08_telegram_failure_non_blocking_and_recorded(self, mock_send):
        """7 & 8. Verify Telegram failure does not rollback alert and is recorded as status='failed'."""
        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="soil",
            message="Soil dry alert with mock Telegram failure",
            severity="warning",
            alert_type="THRESHOLD",
            sensor="soil_moisture",
            value=22.0,
            threshold=30.0
        )
        # Verify alert exists in DB
        db_alert = self.db.query(models.Alert).filter(models.Alert.id == alert.id).first()
        self.assertIsNotNone(db_alert, "Alert must NOT be rolled back if Telegram dispatch fails")

        # Verify notification recorded as failed with error message
        notif = self.db.query(models.Notification).filter(models.Notification.alert_id == alert.id).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.status, "failed")
        self.assertEqual(notif.channel, "telegram")
        self.assertIn("Telegram API Timeout", notif.error_message)
        print("  [OK] Test 7 & 8: Non-blocking error handling and failed notification record passed.")

    @patch.object(notification_service, "send_telegram_raw", return_value={"status": "sent", "message_id": 104, "error": None})
    def test_09_and_10_offline_timeout_and_anti_spam(self, mock_send):
        """9 & 10. Verify offline timeout creates ONE alert + Telegram msg, and does NOT spam while offline."""
        import asyncio

        # Add a reading from 10 minutes ago
        past_time = datetime.now(timezone.utc) - timedelta(minutes=10)
        r_old = models.SensorReading(
            device_id=self.device.id,
            timestamp=past_time,
            sensor="soil_moisture",
            raw_value=35.0,
            filtered_value=35.0,
            unit="%"
        )
        self.db.add(r_old)
        self.db.commit()

        # Run 1st offline check -> Device goes offline -> 1 Alert + 1 Telegram msg
        asyncio.run(offline_checker.check_device_offline_and_recovery(self.db))
        self.assertEqual(mock_send.call_count, 1)
        _, msg = mock_send.call_args[0]
        self.assertIn("ESP32 DEVICE OFFLINE", msg)

        # Run 2nd and 3rd offline checks while still offline -> NO duplicate alert or Telegram msg
        asyncio.run(offline_checker.check_device_offline_and_recovery(self.db))
        asyncio.run(offline_checker.check_device_offline_and_recovery(self.db))
        self.assertEqual(mock_send.call_count, 1, "Must NOT spam repeated messages while device remains offline")
        print("  [OK] Test 9 & 10: Offline detection and anti-spam passed.")

    @patch.object(notification_service, "send_telegram_raw", return_value={"status": "sent", "message_id": 105, "error": None})
    def test_11_recovery_notification(self, mock_send):
        """11. Verify telemetry resumption generates at most ONE recovery notification."""
        import asyncio

        # Put device in offline state
        offline_checker._offline_devices.add(self.device.id)

        # Add fresh reading (just now)
        r_now = models.SensorReading(
            device_id=self.device.id,
            timestamp=datetime.now(timezone.utc),
            sensor="soil_moisture",
            raw_value=35.0,
            filtered_value=35.0,
            unit="%"
        )
        self.db.add(r_now)
        self.db.commit()

        # Run check -> Recovery detected -> ONE recovery message
        asyncio.run(offline_checker.check_device_offline_and_recovery(self.db))
        self.assertEqual(mock_send.call_count, 1)
        _, msg = mock_send.call_args[0]
        self.assertIn("ESP32 DEVICE ONLINE", msg)

        # Subsequent check -> already online -> no extra message
        asyncio.run(offline_checker.check_device_offline_and_recovery(self.db))
        self.assertEqual(mock_send.call_count, 1)
        print("  [OK] Test 11: Single recovery notification passed.")

    @patch.object(notification_service, "send_telegram_raw")
    def test_12_daily_summary_disabled(self, mock_send):
        """12. Verify daily summary does not run when daily_summary_enabled = False."""
        import asyncio
        self.settings.daily_summary_enabled = False
        self.db.commit()

        asyncio.run(offline_checker.check_daily_summary(self.db))
        mock_send.assert_not_called()
        print("  [OK] Test 12: Daily summary disabled check passed.")

    def test_13_daily_summary_no_litres_used(self):
        """13. Verify daily summary message format strictly omits any litres used calculation."""
        summary = notification_service.format_daily_summary_telegram(
            device_name="Plant Unit 01",
            soil_min=25.0,
            soil_max=40.0,
            tank_min=70.0,
            temp_min=22.0,
            temp_max=30.0,
            pump_runs=4
        )
        self.assertIn("🌿 BOTANICAL LAB DAILY SUMMARY", summary)
        self.assertIn("Soil:\nMin: 25%\nMax: 40%", summary)
        self.assertIn("Pump:\nRuns: 4", summary)
        self.assertIn("Tank:\nMin: 70%", summary)
        self.assertNotIn("litre", summary.lower())
        self.assertNotIn("flow", summary.lower())
        self.assertNotIn("consumption", summary.lower())
        print("  [OK] Test 13: Daily summary zero flow sensor / no litres used passed.")

    def test_14_no_credentials_in_schema_output(self):
        """14. Verify NotificationResponse and SystemSettingsResponse never leak bot tokens or credentials."""
        notif = models.Notification(
            id=1,
            alert_id=10,
            device_id=self.device.id,
            channel="telegram",
            recipient="987654321",
            message="Test message",
            status="sent",
            sent_at=datetime.now(timezone.utc),
            error_message=None,
            created_at=datetime.now(timezone.utc)
        )
        resp = schemas.NotificationResponse.model_validate(notif)
        dump = resp.model_dump()
        self.assertNotIn("bot_token", dump)
        self.assertNotIn("token", dump)
        self.assertNotIn("password", dump)

        settings_resp = schemas.SystemSettingsResponse.model_validate(self.settings)
        s_dump = settings_resp.model_dump()
        self.assertNotIn("bot_token", s_dump)
        self.assertNotIn("token", s_dump)
        print("  [OK] Test 14: Zero credential exposure in schemas passed.")

    def test_15_timezone_ist_conversion_and_telegram_formatting(self):
        """15. Verify Telegram alert formatting converts UTC timestamps to Asia/Kolkata (IST)."""
        from app.services.notification_service import format_event_time_ist

        # 11:37:00 UTC corresponds to 17:07:00 IST (05:07 PM IST)
        utc_dt = datetime(2026, 9, 20, 11, 37, 0, tzinfo=timezone.utc)
        ist_str = format_event_time_ist(utc_dt)
        self.assertEqual(ist_str, "05:07 PM IST")

        # Test within Alert object
        alert = models.Alert(
            id=42,
            device_id=self.device.id,
            timestamp=utc_dt,
            category="tank",
            sensor="tank_level",
            message="Water tank level low (17%)",
            severity="alert",
            value=17.0,
            threshold=20.0
        )
        msg = notification_service.format_alert_telegram(alert, "Plant Monitoring Unit")
        self.assertIn("Time: 05:07 PM IST", msg)
        self.assertIn("🔴 WATER TANK LOW", msg)
        self.assertIn("Pump stopped.", msg)
        print("  [OK] Test 15: Timezone conversion to Asia/Kolkata (IST) in Telegram passed.")

    def test_16_backend_timestamps_timezone_aware(self):
        """16. Verify all generated alerts and database timestamps are timezone-aware."""
        from app.services.offline_checker import ensure_utc, utc_now

        now = utc_now()
        self.assertIsNotNone(now.tzinfo)
        self.assertEqual(now.tzinfo, timezone.utc)

        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="soil",
            message="Test soil dry alert",
            severity="warning"
        )
        self.assertIsNotNone(alert.timestamp)
        normalized = ensure_utc(alert.timestamp)
        self.assertIsNotNone(normalized.tzinfo)
        print("  [OK] Test 16: Timezone-aware timestamp validation passed.")

if __name__ == "__main__":
    print("\n==================================================")
    print("RUNNING BOTANICAL LAB TELEGRAM NOTIFICATION TEST SUITE")
    print("==================================================")
    unittest.main(verbosity=2)

