from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Index, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_name = Column(String(100), nullable=False)
    device_type = Column(String(50), default="ESP32", nullable=False)
    location = Column(String(100), default="Plant Monitoring Unit", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    readings = relationship("SensorReading", back_populates="device", cascade="all, delete-orphan")
    irrigation_events = relationship("IrrigationEvent", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")
    settings = relationship("SystemSettings", back_populates="device", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="device", cascade="all, delete-orphan")


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    sensor = Column(String(50), index=True, nullable=False)  # soil_moisture, rain, temperature, tank_level, light
    raw_value = Column(Float, nullable=False)
    filtered_value = Column(Float, nullable=False)
    unit = Column(String(20), nullable=False)

    device = relationship("Device", back_populates="readings")

    __table_args__ = (
        Index("ix_sensor_readings_sensor_timestamp", "sensor", "timestamp"),
        Index("ix_sensor_readings_device_sensor", "device_id", "sensor"),
    )


class IrrigationEvent(Base):
    __tablename__ = "irrigation_events"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    action = Column(String(10), nullable=False)  # ON, OFF
    reason = Column(String(50), nullable=False)  # soil_dry, soil_wet, rain_detected, tank_low, manual_start, manual_stop
    soil_moisture = Column(Float, nullable=True)
    tank_level = Column(Float, nullable=True)
    mode = Column(String(10), nullable=False, default="AUTO")  # AUTO, MANUAL

    device = relationship("Device", back_populates="irrigation_events")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    category = Column(String(50), nullable=True)
    message = Column(String(255), nullable=False)
    severity = Column(String(20), index=True, nullable=False, default="normal")  # normal, warning, alert
    is_resolved = Column(Boolean, default=False, nullable=False, index=True)
    acknowledged = Column(Boolean, default=False, nullable=False, index=True)
    alert_type = Column(String(50), nullable=True, index=True)  # THRESHOLD, FREQUENCY
    sensor = Column(String(50), nullable=True, index=True)  # soil_moisture, rain, temperature, tank_level, light
    value = Column(Float, nullable=True)
    threshold = Column(Float, nullable=True)

    device = relationship("Device", back_populates="alerts")
    notifications = relationship("Notification", back_populates="alert", cascade="all, delete-orphan")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    channel = Column(String(20), default="telegram", nullable=False, index=True)  # telegram
    recipient = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="pending", nullable=False, index=True)  # pending, sent, failed
    sent_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    alert = relationship("Alert", back_populates="notifications")
    device = relationship("Device", back_populates="notifications")


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=True, unique=True, index=True)
    auto_mode = Column(Boolean, default=True, nullable=False)
    soil_start_threshold = Column(Float, default=30.0, nullable=False)
    soil_stop_threshold = Column(Float, default=45.0, nullable=False)
    tank_minimum_threshold = Column(Float, default=20.0, nullable=False)
    high_temp_threshold = Column(Float, default=35.0, nullable=False)
    debounce_samples = Column(Integer, default=3, nullable=False)
    cooldown_seconds = Column(Integer, default=300, nullable=False)
    sms_enabled = Column(Boolean, default=True, nullable=False)
    daily_summary_enabled = Column(Boolean, default=False, nullable=False)
    offline_alert_enabled = Column(Boolean, default=True, nullable=False)
    offline_timeout_seconds = Column(Integer, default=300, nullable=False)
    daily_summary_hour = Column(Integer, default=8, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    device = relationship("Device", back_populates="settings")
