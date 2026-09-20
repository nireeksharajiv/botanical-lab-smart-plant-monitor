import sys
import os
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import engine, Base, SessionLocal
from app import models

def seed_database():
    print("Initializing tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Create or get primary device
        device = db.query(models.Device).filter(models.Device.device_name == "Botanical Lab ESP32").first()
        if not device:
            device = models.Device(
                device_name="Botanical Lab ESP32",
                device_type="ESP32",
                location="Plant Monitoring Unit",
                is_active=True
            )
            db.add(device)
            db.commit()
            db.refresh(device)
            print(f"[OK] Created Device: {device.device_name} (ID: {device.id})")
        else:
            print(f"[INFO] Existing Device found: {device.device_name} (ID: {device.id})")

        # 2. Create sample readings for the 5 active sensors (rich time-series for signal analysis)
        now = datetime.now(timezone.utc)
        import random
        from datetime import timedelta

        # Ensure active devices (device 1 and device 2) both have historical data
        devices = db.query(models.Device).all()
        for dev in devices:
            # Generate 25 time-series points over the last 30 minutes
            for i in range(25, 0, -1):
                pt_time = now - timedelta(minutes=i*1.2)
                
                # 1. Soil moisture (around 27-32% with noise)
                soil_raw = round(28.0 + (i % 5) * 0.8 + (random.random() - 0.5) * 1.5, 2)
                soil_filt = round(soil_raw * 0.98 + 0.5, 2)
                db.add(models.SensorReading(
                    device_id=dev.id, timestamp=pt_time, sensor="soil_moisture",
                    raw_value=soil_raw, filtered_value=soil_filt, unit="%"
                ))

                # 2. Rain sensor (0.0 with occasional 0.0)
                db.add(models.SensorReading(
                    device_id=dev.id, timestamp=pt_time, sensor="rain",
                    raw_value=0.0, filtered_value=0.0, unit="DETECTED"
                ))

                # 3. Temperature (around 26-28°C with subtle fluctuations)
                temp_raw = round(27.0 + (i % 4) * 0.3 + (random.random() - 0.5) * 0.8, 2)
                temp_filt = round(temp_raw * 0.99, 2)
                db.add(models.SensorReading(
                    device_id=dev.id, timestamp=pt_time, sensor="temperature",
                    raw_value=temp_raw, filtered_value=temp_filt, unit="°C"
                ))

                # 4. Tank Level (around 70-75% with small fluctuations)
                tank_raw = round(72.0 + (i % 6) * 0.5 + (random.random() - 0.5) * 1.2, 2)
                tank_filt = round(tank_raw * 0.99 + 0.4, 2)
                db.add(models.SensorReading(
                    device_id=dev.id, timestamp=pt_time, sensor="tank_level",
                    raw_value=tank_raw, filtered_value=tank_filt, unit="%"
                ))

                # 5. Light Intensity (around 65-72% with ambient variance)
                light_raw = round(68.0 + (i % 7) * 0.9 + (random.random() - 0.5) * 2.0, 2)
                light_filt = round(light_raw * 0.99 + 0.3, 2)
                db.add(models.SensorReading(
                    device_id=dev.id, timestamp=pt_time, sensor="light",
                    raw_value=light_raw, filtered_value=light_filt, unit="%"
                ))

        db.commit()
        print(f"[OK] Seeded 25 time-series data points for all 5 sensors across {len(devices)} device(s)")

        # 3. Create sample alert
        sample_alert = models.Alert(
            device_id=device.id,
            timestamp=now,
            category="soil",
            message="Soil moisture has fallen below start threshold (27.5%)",
            severity="warning",
            is_resolved=False
        )
        db.add(sample_alert)
        db.commit()
        print("[OK] Seeded sample alert")

        # 4. Create sample irrigation event
        sample_event = models.IrrigationEvent(
            device_id=device.id,
            timestamp=now,
            action="ON",
            reason="soil_dry",
            soil_moisture=27.5,
            tank_level=71.5,
            mode="AUTO"
        )
        db.add(sample_event)
        db.commit()
        print("[OK] Seeded sample irrigation event")

        # 5. Create / update default system settings for device
        settings = db.query(models.SystemSettings).filter(models.SystemSettings.device_id == device.id).first()
        if not settings:
            settings = models.SystemSettings(
                device_id=device.id,
                auto_mode=True,
                soil_start_threshold=30.0,
                soil_stop_threshold=45.0,
                tank_minimum_threshold=20.0
            )
            db.add(settings)
            db.commit()
            print("[OK] Seeded default system settings (start=30%, stop=45%, min_tank=20%)")

        print("\nDatabase seeding completed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
