import sys
import os
import unittest
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
from app.services.event_broadcaster import broadcaster

class TestAlertEngine(unittest.TestCase):
    def setUp(self):
        """Set up an isolated in-memory SQLite database for each test."""
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Clear alert engine in-memory state
        alert_engine._debounce_state.clear()
        alert_engine._cooldown_state.clear()

        # Create a test device
        self.device = models.Device(
            device_name="Test Botanical ESP32",
            device_type="ESP32",
            location="Lab Test Station",
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
            cooldown_seconds=300
        )
        self.db.add(self.settings)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_01_soil_dry_debounce_and_trigger(self):
        """Test that soil dry alert requires 3 consecutive readings before triggering."""
        # 1st reading below 30% -> debouncing, no alert yet
        r1 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=28.5, filtered_value=28.5, unit="%")
        alert1 = alert_engine.evaluate_sensor_reading(self.db, r1)
        self.assertIsNone(alert1, "1st low reading should not trigger alert (debounce N=3)")

        # 2nd reading below 30% -> debouncing, no alert yet
        r2 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=28.0, filtered_value=28.0, unit="%")
        alert2 = alert_engine.evaluate_sensor_reading(self.db, r2)
        self.assertIsNone(alert2, "2nd low reading should not trigger alert (debounce N=3)")

        # 3rd reading below 30% -> DEBOUNCE MET -> Alert triggered!
        r3 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=27.5, filtered_value=27.5, unit="%")
        alert3 = alert_engine.evaluate_sensor_reading(self.db, r3)
        self.assertIsNotNone(alert3, "3rd consecutive low reading should trigger soil dry alert")
        self.assertEqual(alert3.category, "soil")
        self.assertEqual(alert3.severity, "warning")
        self.assertEqual(alert3.alert_type, "THRESHOLD")
        self.assertEqual(alert3.sensor, "soil_moisture")
        self.assertFalse(alert3.is_resolved)
        self.assertFalse(alert3.acknowledged)
        print("  [OK] Test 1: Soil dry debounce (N=3) and trigger passed.")

    def test_02_soil_dry_debounce_reset_on_nominal_reading(self):
        """Test that a non-qualifying reading resets the debounce counter."""
        # Reading 1 low (count=1)
        r1 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=28.0, filtered_value=28.0, unit="%")
        alert_engine.evaluate_sensor_reading(self.db, r1)

        # Reading 2 nominal 32.0% (resets count to 0)
        r2 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=32.0, filtered_value=32.0, unit="%")
        alert_engine.evaluate_sensor_reading(self.db, r2)

        # Reading 3 low (count=1)
        r3 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=28.0, filtered_value=28.0, unit="%")
        alert3 = alert_engine.evaluate_sensor_reading(self.db, r3)
        self.assertIsNone(alert3, "Interrupted sequence should not trigger alert")
        print("  [OK] Test 2: Soil dry debounce reset passed.")

    def test_03_soil_dry_cooldown_prevention(self):
        """Test that cooldown prevents spamming alerts while condition persists."""
        # Trigger first alert
        for val in [28.0, 27.5, 27.0]:
            r = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=val, filtered_value=val, unit="%")
            alert = alert_engine.evaluate_sensor_reading(self.db, r)
        self.assertIsNotNone(alert)

        # Next low reading within 5-min cooldown -> NO new alert created
        r4 = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=26.5, filtered_value=26.5, unit="%")
        alert4 = alert_engine.evaluate_sensor_reading(self.db, r4)
        self.assertIsNone(alert4, "Cooldown should prevent immediate duplicate alert creation")

        # Total alerts in DB should be exactly 1
        alerts_count = self.db.query(models.Alert).filter(models.Alert.category == "soil").count()
        self.assertEqual(alerts_count, 1)
        print("  [OK] Test 3: Soil dry cooldown prevention passed.")

    def test_04_soil_dry_hysteresis_and_resolution(self):
        """Test that soil dry alert only clears when reaching stop threshold (>= 45%)."""
        # Trigger alert (3 consecutive readings < 30%)
        for val in [28.0, 27.5, 27.0]:
            r = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=val, filtered_value=val, unit="%")
            alert = alert_engine.evaluate_sensor_reading(self.db, r)
        self.assertIsNotNone(alert)
        alert_id = alert.id

        # Reading at 35% (above 30% start, but below 45% stop) -> should NOT clear
        r_mid = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=35.0, filtered_value=35.0, unit="%")
        alert_engine.evaluate_sensor_reading(self.db, r_mid)
        alert_db = self.db.query(models.Alert).filter(models.Alert.id == alert_id).first()
        self.assertFalse(alert_db.is_resolved, "Alert should remain unresolved between 30% and 45% (hysteresis)")

        # Reading at 46% (>= 45% stop threshold) -> AUTO-RESOLVES alert!
        r_clear = models.SensorReading(device_id=self.device.id, sensor="soil_moisture", raw_value=46.0, filtered_value=46.0, unit="%")
        alert_engine.evaluate_sensor_reading(self.db, r_clear)
        self.db.refresh(alert_db)
        self.assertTrue(alert_db.is_resolved, "Alert should be marked is_resolved=True when reaching stop threshold (46% >= 45%)")
        print("  [OK] Test 4 & 5: Soil dry hysteresis and auto-resolution passed.")

    def test_06_tank_low_trigger_and_resolution(self):
        """Test tank level low (< 20%) trigger and hysteresis clear (>= 25%)."""
        # 3 readings below 20%
        for val in [19.0, 18.5, 17.0]:
            r = models.SensorReading(device_id=self.device.id, sensor="tank_level", raw_value=val, filtered_value=val, unit="%")
            alert = alert_engine.evaluate_sensor_reading(self.db, r)
        self.assertIsNotNone(alert, "Tank low alert should trigger after 3 consecutive samples < 20%")
        self.assertEqual(alert.category, "tank")
        tank_alert_id = alert.id

        # Reading at 22% (below 25% clear threshold) -> remains unresolved
        r_mid = models.SensorReading(device_id=self.device.id, sensor="tank_level", raw_value=22.0, filtered_value=22.0, unit="%")
        alert_engine.evaluate_sensor_reading(self.db, r_mid)
        alert_db = self.db.query(models.Alert).filter(models.Alert.id == tank_alert_id).first()
        self.assertFalse(alert_db.is_resolved)

        # Reading at 26% (>= 25% clear threshold) -> auto-resolves
        r_clear = models.SensorReading(device_id=self.device.id, sensor="tank_level", raw_value=26.0, filtered_value=26.0, unit="%")
        alert_engine.evaluate_sensor_reading(self.db, r_clear)
        self.db.refresh(alert_db)
        self.assertTrue(alert_db.is_resolved)
        print("  [OK] Test 6 & 7: Tank low trigger and auto-resolution passed.")

    def test_08_high_temperature_trigger_and_resolution(self):
        """Test high temperature trigger (> 35°C) and hysteresis clear (<= 33°C)."""
        # 3 readings above 35°C
        for val in [35.5, 36.0, 36.5]:
            r = models.SensorReading(device_id=self.device.id, sensor="temperature", raw_value=val, filtered_value=val, unit="°C")
            alert = alert_engine.evaluate_sensor_reading(self.db, r)
        self.assertIsNotNone(alert, "High temperature alert should trigger after 3 samples > 35°C")
        self.assertEqual(alert.category, "temperature")
        temp_alert_id = alert.id

        # Reading at 34°C (above 33°C clear threshold) -> remains unresolved
        r_mid = models.SensorReading(device_id=self.device.id, sensor="temperature", raw_value=34.0, filtered_value=34.0, unit="°C")
        alert_engine.evaluate_sensor_reading(self.db, r_mid)
        alert_db = self.db.query(models.Alert).filter(models.Alert.id == temp_alert_id).first()
        self.assertFalse(alert_db.is_resolved)

        # Reading at 32°C (<= 33°C clear threshold) -> auto-resolves
        r_clear = models.SensorReading(device_id=self.device.id, sensor="temperature", raw_value=32.0, filtered_value=32.0, unit="°C")
        alert_engine.evaluate_sensor_reading(self.db, r_clear)
        self.db.refresh(alert_db)
        self.assertTrue(alert_db.is_resolved)
        print("  [OK] Test 8: High temperature trigger and auto-resolution passed.")

    def test_09_type_b_frequent_pump_triggering(self):
        """Test Type B frequency alert when > 5 pump ON events occur in 1 hour."""
        now = datetime.now(timezone.utc)

        # Add 5 pump ON events within the last 30 minutes
        for i in range(5):
            ev = models.IrrigationEvent(
                device_id=self.device.id,
                timestamp=now - timedelta(minutes=i * 5),
                action="ON",
                reason="soil_dry",
                mode="AUTO"
            )
            self.db.add(ev)
        self.db.commit()

        # 5 events -> not exceeding > 5
        alert = alert_engine.check_pump_frequency(self.db, self.device.id)
        self.assertIsNone(alert, "5 events in 1 hour should not trigger (threshold is > 5)")

        # Add 6th pump ON event
        ev6 = models.IrrigationEvent(
            device_id=self.device.id,
            timestamp=now,
            action="ON",
            reason="soil_dry",
            mode="AUTO"
        )
        self.db.add(ev6)
        self.db.commit()

        # 6 events -> EXCEEDS threshold -> Type B Alert generated!
        alert = alert_engine.check_pump_frequency(self.db, self.device.id)
        self.assertIsNotNone(alert, "6th pump ON event within 1 hour should trigger Type B warning")
        self.assertEqual(alert.alert_type, "FREQUENCY")
        self.assertEqual(alert.category, "irrigation")
        self.assertIn("Frequent pump triggering detected", alert.message)
        self.assertIn("possible leak", alert.message)
        print("  [OK] Test 9: Type B frequent pump trigger detection passed.")

    def test_10_alert_acknowledgement_and_resolution(self):
        """Test acknowledge_alert and resolve_alert lifecycle."""
        # Create alert
        alert = alert_engine.create_alert(
            db=self.db,
            device_id=self.device.id,
            category="soil",
            message="Test soil dry alert",
            severity="warning",
            alert_type="THRESHOLD",
            sensor="soil_moisture",
            value=25.0,
            threshold=30.0
        )
        self.assertFalse(alert.acknowledged)
        self.assertFalse(alert.is_resolved)

        # Acknowledge alert
        acked = alert_engine.acknowledge_alert(self.db, alert.id)
        self.assertTrue(acked.acknowledged)
        self.assertFalse(acked.is_resolved, "Acknowledging does not mark as resolved")

        # Resolve alert
        resolved = alert_engine.resolve_alert(self.db, alert.id)
        self.assertTrue(resolved.is_resolved)
        print("  [OK] Test 10, 11 & 12: Alert acknowledgement and resolution lifecycle passed.")

    def test_13_event_broadcaster_subscribers(self):
        """Test SSE EventBroadcaster subscribe, broadcast, and unsubscribe."""
        q = broadcaster.subscribe()
        self.assertGreater(broadcaster.subscriber_count, 0)

        # Broadcast test event
        broadcaster.broadcast("test_event", {"message": "hello botanical lab"})
        
        # Verify message queued
        self.assertFalse(q.empty())
        msg = q.get_nowait()
        self.assertIn("event: test_event", msg)
        self.assertIn("hello botanical lab", msg)

        # Clean up
        broadcaster.unsubscribe(q)
        print("  [OK] Test 13 & 14: SSE EventBroadcaster subscription and message dispatch passed.")

if __name__ == "__main__":
    print("\n==================================================")
    print("RUNNING BOTANICAL LAB ALERT ENGINE TEST SUITE")
    print("==================================================")
    unittest.main(verbosity=2)
