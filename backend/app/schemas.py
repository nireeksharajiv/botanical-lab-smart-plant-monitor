from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, Literal

# Allowed sensor types (strictly 5 sensors, NO flow sensor)
AllowedSensorType = Literal[
    "soil_moisture",
    "rain",
    "temperature",
    "tank_level",
    "light"
]

# ----------------------------------------------------
# Device Schemas
# ----------------------------------------------------
class DeviceBase(BaseModel):
    device_name: str = Field(..., max_length=100, example="Botanical Lab ESP32")
    device_type: str = Field(default="ESP32", max_length=50)
    location: str = Field(default="Plant Monitoring Unit", max_length=100)
    is_active: bool = True

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    device_name: Optional[str] = Field(None, max_length=100)
    device_type: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None

class DeviceResponse(DeviceBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ----------------------------------------------------
# Sensor Reading Schemas (5 Sensors ONLY)
# ----------------------------------------------------
class SensorReadingBase(BaseModel):
    device_id: Optional[int] = Field(default=None, example=1)
    sensor: AllowedSensorType = Field(..., description="Must be one of: soil_moisture, rain, temperature, tank_level, light")
    raw_value: float = Field(..., example=27.5)
    filtered_value: float = Field(..., example=28.1)
    unit: str = Field(..., max_length=20, example="%")

    @field_validator("sensor")
    @classmethod
    def validate_sensor_type(cls, v: str) -> str:
        valid_sensors = {"soil_moisture", "rain", "temperature", "tank_level", "light"}
        if v.lower() not in valid_sensors:
            raise ValueError(f"Invalid sensor '{v}'. Supported sensors are: {sorted(list(valid_sensors))}")
        return v.lower()

class SensorReadingCreate(SensorReadingBase):
    pass

class SensorReadingResponse(SensorReadingBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


# ----------------------------------------------------
# Irrigation Event Schemas
# ----------------------------------------------------
class IrrigationEventBase(BaseModel):
    device_id: Optional[int] = None
    action: Literal["ON", "OFF"] = Field(..., example="ON")
    reason: str = Field(..., max_length=50, example="soil_dry")  # soil_dry, soil_wet, rain_detected, tank_low, manual_start, manual_stop
    soil_moisture: Optional[float] = None
    tank_level: Optional[float] = None
    mode: Literal["AUTO", "MANUAL"] = Field(default="AUTO")

class IrrigationEventCreate(IrrigationEventBase):
    pass

class IrrigationEventResponse(IrrigationEventBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


# ----------------------------------------------------
# Alert Schemas
# ----------------------------------------------------
class AlertBase(BaseModel):
    device_id: Optional[int] = None
    category: Optional[str] = Field(None, max_length=50, example="soil")
    message: str = Field(..., max_length=255, example="Soil moisture has fallen below start threshold (27.5%)")
    severity: Literal["normal", "warning", "alert"] = Field(default="normal")
    is_resolved: bool = False
    acknowledged: bool = False
    alert_type: Optional[str] = Field(default="THRESHOLD", example="THRESHOLD")  # THRESHOLD, FREQUENCY
    sensor: Optional[str] = Field(None, example="soil_moisture")
    value: Optional[float] = None
    threshold: Optional[float] = None

class AlertCreate(AlertBase):
    pass

class AlertUpdate(BaseModel):
    is_resolved: Optional[bool] = None
    acknowledged: Optional[bool] = None

class AlertResponse(AlertBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


# ----------------------------------------------------
# Notification Schemas
# ----------------------------------------------------
class NotificationBase(BaseModel):
    alert_id: Optional[int] = None
    device_id: Optional[int] = None
    channel: str = Field(default="telegram", example="telegram")
    recipient: str = Field(..., example="123456789")
    message: str = Field(..., example="🌿 BOTANICAL LAB ALERT\n⚠️ SOIL MOISTURE LOW")
    status: Literal["pending", "sent", "failed"] = Field(default="pending")
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ----------------------------------------------------
# System Settings Schemas
# ----------------------------------------------------
class SystemSettingsBase(BaseModel):
    device_id: Optional[int] = None
    auto_mode: bool = True
    soil_start_threshold: float = Field(default=30.0, ge=0.0, le=100.0)
    soil_stop_threshold: float = Field(default=45.0, ge=0.0, le=100.0)
    tank_minimum_threshold: float = Field(default=20.0, ge=0.0, le=100.0)
    high_temp_threshold: float = Field(default=35.0, ge=0.0, le=100.0)
    debounce_samples: int = Field(default=3, ge=1, le=20)
    cooldown_seconds: int = Field(default=300, ge=10, le=86400)
    sms_enabled: bool = True
    daily_summary_enabled: bool = False
    offline_alert_enabled: bool = True
    offline_timeout_seconds: int = Field(default=300, ge=30, le=86400)
    daily_summary_hour: int = Field(default=8, ge=0, le=23)

class SystemSettingsCreate(SystemSettingsBase):
    pass

class SystemSettingsUpdate(BaseModel):
    auto_mode: Optional[bool] = None
    soil_start_threshold: Optional[float] = Field(None, ge=0.0, le=100.0)
    soil_stop_threshold: Optional[float] = Field(None, ge=0.0, le=100.0)
    tank_minimum_threshold: Optional[float] = Field(None, ge=0.0, le=100.0)
    high_temp_threshold: Optional[float] = Field(None, ge=0.0, le=100.0)
    debounce_samples: Optional[int] = Field(None, ge=1, le=20)
    cooldown_seconds: Optional[int] = Field(None, ge=10, le=86400)
    sms_enabled: Optional[bool] = None
    daily_summary_enabled: Optional[bool] = None
    offline_alert_enabled: Optional[bool] = None
    offline_timeout_seconds: Optional[int] = Field(None, ge=30, le=86400)
    daily_summary_hour: Optional[int] = Field(None, ge=0, le=23)

class SystemSettingsResponse(SystemSettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True
