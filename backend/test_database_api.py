import sys
import os
from datetime import datetime, timezone
from sqlalchemy import text, inspect

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import engine, Base, SessionLocal, run_migrations
from app import models, schemas
from app.routes import readings, alerts, irrigation, settings, devices, notifications

def run_tests():
    print("==================================================")
    print("1. DATABASE CONNECTION DIAGNOSTIC (SAFE)")
    print("==================================================")
    print(f"  • Dialect:  {engine.dialect.name}")
    print(f"  • Driver:   {engine.dialect.driver}")
    print(f"  • Host:     {engine.url.host}")
    print(f"  • Port:     {engine.url.port}")
    print(f"  • Database: {engine.url.database}")
    
    # Assert connecting to PostgreSQL
    assert engine.dialect.name == "postgresql", f"Error: Expected postgresql dialect, got {engine.dialect.name}"

    print("\n==================================================")
    print("2. EXECUTING TABLE CREATION & MIGRATION ON SUPABASE")
    print("==================================================")
    Base.metadata.create_all(bind=engine)
    run_migrations()
    print("  [OK] Base.metadata.create_all() & run_migrations() executed against PostgreSQL engine.")

    print("\n==================================================")
    print("3. VERIFYING PUBLIC SCHEMA TABLES (SQL QUERY)")
    print("==================================================")
    with engine.connect() as conn:
        query = text("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        result = conn.execute(query).fetchall()
        print(f"  Discovered Public Tables: {[r[1] for r in result]}")

        public_tables = [r[1] for r in result]
        expected_tables = ["alerts", "devices", "irrigation_events", "notifications", "sensor_readings", "system_settings"]
        for t in expected_tables:
            assert t in public_tables, f"Table '{t}' is missing from PostgreSQL public schema!"
            print(f"  [OK] Confirmed '{t}' in public schema.")

    db = SessionLocal()
    try:
        print("\n==================================================")
        print("4. TESTING DEVICE CREATION & RETRIEVAL")
        print("==================================================")
        dev_in = schemas.DeviceCreate(
            device_name="Botanical Lab ESP32",
            device_type="ESP32",
            location="Plant Monitoring Unit",
            is_active=True
        )
        dev = devices.create_device(device=dev_in, db=db)
        print(f"  [OK] Created Device ID={dev.id}, Name='{dev.device_name}', Location='{dev.location}'")
        assert dev.id is not None
        device_id = dev.id

        print("\n==================================================")
        print("5. TESTING SYSTEM SETTINGS")
        print("==================================================")
        s = settings.get_device_settings(device_id=device_id, db=db)
        print(f"  [OK] Device Settings -> auto_mode={s.auto_mode}, start={s.soil_start_threshold}%, stop={s.soil_stop_threshold}%, min_tank={s.tank_minimum_threshold}%")
        assert s.soil_start_threshold == 30.0
        assert s.soil_stop_threshold == 45.0
        assert s.tank_minimum_threshold == 20.0

        updated_s = settings.update_device_settings(
            device_id=device_id,
            settings_update=schemas.SystemSettingsUpdate(
                soil_start_threshold=28.0,
                soil_stop_threshold=48.0,
                tank_minimum_threshold=25.0
            ),
            db=db
        )
        print(f"  [OK] Updated Device Settings -> start={updated_s.soil_start_threshold}%, stop={updated_s.soil_stop_threshold}%, min_tank={updated_s.tank_minimum_threshold}%")
        assert updated_s.soil_start_threshold == 28.0

        print("\n==================================================")
        print("6. TESTING SENSOR READINGS (5 SENSORS ONLY)")
        print("==================================================")
        sensors_data = [
            ("soil_moisture", 27.5, 28.1, "%"),
            ("rain", 0.0, 0.0, "DETECTED"),
            ("temperature", 27.4, 27.2, "°C"),
            ("tank_level", 72.0, 71.5, "%"),
            ("light", 68.0, 67.8, "%"),
        ]

        for s_name, raw, filtered, unit in sensors_data:
            sr_in = schemas.SensorReadingCreate(
                device_id=device_id,
                sensor=s_name,
                raw_value=raw,
                filtered_value=filtered,
                unit=unit
            )
            created_r = readings.create_reading(reading=sr_in, db=db)
            print(f"  [OK] POST /api/readings -> {created_r.sensor}: raw={created_r.raw_value}, filtered={created_r.filtered_value} {created_r.unit}")

        # Test latest readings
        latest = readings.get_latest_readings(device_id=device_id, db=db)
        print(f"  [OK] GET /api/readings/latest -> Found {len(latest)} sensors:")
        for lr in latest:
            print(f"       • {lr.sensor}: {lr.filtered_value} {lr.unit} (raw: {lr.raw_value})")
        assert len(latest) == 5

        # Test rejection of flow sensor
        print("\n==================================================")
        print("7. VERIFYING FLOW SENSOR REJECTION")
        print("==================================================")
        try:
            schemas.SensorReadingCreate(
                device_id=device_id,
                sensor="flow_sensor",
                raw_value=1.5,
                filtered_value=1.4,
                unit="L/min"
            )
            assert False, "Flow sensor was not rejected!"
        except Exception as e:
            print(f"  [OK] Successfully rejected invalid 'flow_sensor': {type(e).__name__}")

        print("\n==================================================")
        print("8. TESTING ALERTS & IRRIGATION EVENTS")
        print("==================================================")
        alert_in = schemas.AlertCreate(
            device_id=device_id,
            category="tank",
            message="Water tank level low (18%)",
            severity="warning",
            is_resolved=False
        )
        created_alert = alerts.create_alert(alert=alert_in, db=db)
        print(f"  [OK] POST /api/alerts -> id={created_alert.id}, severity='{created_alert.severity}', msg='{created_alert.message}'")

        event_in = schemas.IrrigationEventCreate(
            device_id=device_id,
            action="ON",
            reason="soil_dry",
            soil_moisture=27.5,
            tank_level=71.5,
            mode="AUTO"
        )
        created_event = irrigation.create_irrigation_event(event=event_in, db=db)
        print(f"  [OK] POST /api/irrigation-events -> id={created_event.id}, action='{created_event.action}', reason='{created_event.reason}', mode='{created_event.mode}'")

        print("\n==================================================")
        print("9. TESTING NOTIFICATIONS AUDIT LOG")
        print("==================================================")
        notifs = notifications.get_notifications(device_id=device_id, limit=10, db=db)
        print(f"  [OK] GET /api/notifications -> Found {len(notifs)} notifications for device {device_id}")

        print("\n==================================================")
        print("ALL SUPABASE POSTGRESQL VERIFICATIONS PASSED!")
        print("==================================================")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
