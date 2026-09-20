# Botanical Lab Backend API & Database

This is the backend API layer for the **Botanical Lab — Smart Plant Water Management System**, powered by **FastAPI**, **SQLAlchemy**, and **Supabase PostgreSQL**.

The system is configured for **EXACTLY 5 sensors** (with **ZERO** water flow sensor):
1. **Soil Moisture** (`soil_moisture`) — Volumetric soil moisture percentage (%)
2. **Rain Sensor** (`rain`) — Rain / surface water presence detection (binary / analog)
3. **DHT11** (`temperature`) — Ambient temperature (°C) & relative humidity (%)
4. **HC-SR04 Ultrasonic** (`tank_level`) — Water tank volume level (%)
5. **LDR / Light Sensor** (`light`) — Ambient light intensity (%)

---

## Architecture & Data Flow

```text
Soil Sensor ───┐
Rain Sensor ───┤
DHT11 ─────────┤
HC-SR04 ───────┤
LDR ───────────┘
       ↓
     ESP32
       ↓
Signal Processing (Moving Avg / Median / EMA)
       ↓
     Wi-Fi
       ↓
FastAPI (Main Backend Layer)
       ↓
Supabase PostgreSQL (Cloud Database)
       ↓
Next.js Dashboard (Frontend Visualization)
```

**Irrigation Feedback & Actuation:**
```text
Sensor Data → ESP32 / FastAPI Logic → Hysteresis Decision → Relay Module → DC Water Pump
```
- **Watering Trigger (ON):** Soil moisture < 30% AND rain not detected AND tank level >= 20%.
- **Watering Stop (OFF):** Soil moisture >= 45% OR rain detected OR tank level < 20%.

---

## Database Architecture (PostgreSQL)

The database schema consists of 5 tables:

### 1. `devices`
Tracks ESP32 microcontroller edge nodes.
- `id` (SERIAL PRIMARY KEY)
- `device_name` (VARCHAR(100)) — e.g., `"Botanical Lab ESP32"`
- `device_type` (VARCHAR(50)) — default: `"ESP32"`
- `location` (VARCHAR(100)) — default: `"Plant Monitoring Unit"`
- `is_active` (BOOLEAN) — default: `true`
- `created_at` (TIMESTAMPTZ) — UTC timestamp

### 2. `sensor_readings`
Time-series storage for raw sensor acquisitions and filtered signals.
- `id` (SERIAL PRIMARY KEY)
- `device_id` (INTEGER, REFERENCES `devices.id`)
- `timestamp` (TIMESTAMPTZ, INDEXED)
- `sensor` (VARCHAR(50), INDEXED) — strictly one of: `soil_moisture`, `rain`, `temperature`, `tank_level`, `light`
- `raw_value` (FLOAT)
- `filtered_value` (FLOAT)
- `unit` (VARCHAR(20))
- *Indexes*: `ix_sensor_readings_sensor_timestamp`, `ix_sensor_readings_device_sensor`

### 3. `irrigation_events`
Audit log of pump activation events.
- `id` (SERIAL PRIMARY KEY)
- `device_id` (INTEGER, REFERENCES `devices.id`)
- `timestamp` (TIMESTAMPTZ, INDEXED)
- `action` (VARCHAR(10)) — `ON`, `OFF`
- `reason` (VARCHAR(50)) — `soil_dry`, `soil_wet`, `rain_detected`, `tank_low`, `manual_start`, `manual_stop`
- `soil_moisture` (FLOAT, NULLABLE)
- `tank_level` (FLOAT, NULLABLE)
- `mode` (VARCHAR(10)) — `AUTO`, `MANUAL`

### 4. `alerts`
System warning, fault, and telemetry notifications.
- `id` (SERIAL PRIMARY KEY)
- `device_id` (INTEGER, REFERENCES `devices.id`)
- `timestamp` (TIMESTAMPTZ, INDEXED)
- `category` (VARCHAR(50), NULLABLE) — e.g., `"tank"`, `"soil"`
- `message` (VARCHAR(255))
- `severity` (VARCHAR(20), INDEXED) — `normal`, `warning`, `alert`
- `is_resolved` (BOOLEAN, INDEXED) — default: `false`

### 5. `system_settings`
Configurable operational parameters and hysteresis control values per device.
- `id` (SERIAL PRIMARY KEY)
- `device_id` (INTEGER, REFERENCES `devices.id`, UNIQUE)
- `auto_mode` (BOOLEAN) — default: `true`
- `soil_start_threshold` (FLOAT) — default: `30.0` %
- `soil_stop_threshold` (FLOAT) — default: `45.0` %
- `tank_minimum_threshold` (FLOAT) — default: `20.0` %
- `high_temp_threshold` (FLOAT) — default: `35.0` °C
- `debounce_samples` (INTEGER) — default: `3`
- `cooldown_seconds` (INTEGER) — default: `300` seconds
- `sms_enabled` (BOOLEAN) — default: `true`
- `daily_summary_enabled` (BOOLEAN) — default: `false`
- `offline_alert_enabled` (BOOLEAN) — default: `true`
- `offline_timeout_seconds` (INTEGER) — default: `300` seconds (5 min)
- `daily_summary_hour` (INTEGER) — default: `8` (08:00 AM)
- `updated_at` (TIMESTAMPTZ) — auto-updated

### 6. `notifications`
Audit log of all outbound notifications (Telegram Bot API).
- `id` (SERIAL PRIMARY KEY)
- `alert_id` (INTEGER, REFERENCES `alerts.id`, NULLABLE)
- `device_id` (INTEGER, REFERENCES `devices.id`, NULLABLE)
- `channel` (VARCHAR(20)) — default: `"telegram"`
- `recipient` (VARCHAR(50))
- `message` (TEXT)
- `status` (VARCHAR(20)) — `"pending"`, `"sent"`, `"failed"`
- `sent_at` (TIMESTAMPTZ, NULLABLE)
- `error_message` (TEXT, NULLABLE)
- `created_at` (TIMESTAMPTZ) — default: `NOW()`

---

## Telegram Bot Setup & Configuration

### 1. Architectural Role of Telegram Notifications
- **Primary Notification Channel**: Telegram Bot delivers critical and warning telemetry alerts directly to the user's Telegram app.
- **Edge Decoupling**: The ESP32 edge microcontroller **NEVER** communicates directly with Telegram. Telemetry flows from ESP32 → FastAPI → Alert Engine → Supabase → Telegram Bot API.
- **Resilience**: Outbound notification failures are logged safely without rolling back database alerts or interrupting backend APIs.

### 2. Required Environment Variables
Create or edit `backend/.env` (which is gitignored):
```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres

# Telegram Bot Configuration (Primary Notification Channel)
TELEGRAM_BOT_TOKEN=123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ
TELEGRAM_CHAT_ID=987654321
```

### 3. How to Obtain Telegram Bot Credentials
1. Open Telegram and start a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose a display name and username for your bot, and copy the generated **HTTP API Token** (`TELEGRAM_BOT_TOKEN`).
3. Press **Start** in the chat with your new bot to initialize communication.
4. To find your **Telegram Chat ID** (`TELEGRAM_CHAT_ID`), start a chat with [@userinfobot](https://t.me/userinfobot) or [@raw_data_bot](https://t.me/raw_data_bot) and copy your `Id`.

### 4. How to Test Telegram Notification Dispatch
1. **Interactive API (Swagger UI)**:
   Navigate to [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) and execute `POST /api/notifications/test`.
2. **cURL / PowerShell**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/notifications/test" -Method POST
   ```
3. **Automated Unit Tests (Offline / Mocked)**:
   ```powershell
   cd backend
   .\venv\Scripts\python -m unittest discover -s tests -v
   ```
   *Automated tests mock the Telegram HTTP endpoint and never send real network requests.*

### 5. Security Instructions
- Never commit real bot tokens or chat IDs to Git. `backend/.env` is tracked in `.gitignore`.
- Placeholder values are stored in `backend/.env.example`.
- Telegram Bot Token is never stored in Supabase PostgreSQL tables or exposed via API responses.
- Next.js frontend connects strictly to FastAPI endpoints and never has access to Telegram credentials.

---

## Setup & Running

### 1. Install Dependencies
```powershell
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Seed Sample Data
```powershell
python seed.py
```

### 3. Run the FastAPI Server
```powershell
uvicorn app.main:app --reload --port 8000
```
Interactive API docs (Swagger UI): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health check |
| `GET` | `/api/devices` | List registered devices |
| `POST` | `/api/devices` | Register a new device |
| `POST` | `/api/readings` | Ingest sensor reading (`soil_moisture`, `rain`, `temperature`, `tank_level`, `light`) |
| `GET` | `/api/readings` | Query historical sensor readings with optional `device_id`, `sensor`, and `limit` |
| `GET` | `/api/readings/latest` | Get latest readings snapshot for all 5 sensors |
| `GET` | `/api/alerts` | Query alerts (`severity`, `is_resolved`, `limit`) |
| `POST` | `/api/alerts` | Log a new alert |
| `GET` | `/api/irrigation-events` | Query pump history |
| `POST` | `/api/irrigation-events` | Log an irrigation event |
| `GET` | `/api/settings/{device_id}` | Retrieve device irrigation & hysteresis settings |
| `PUT` | `/api/settings/{device_id}` | Update device irrigation & hysteresis settings |
| `GET` | `/api/settings` | Retrieve global system settings |
| `PUT` | `/api/settings` | Update global system settings |
| `GET` | `/api/notifications` | Query Telegram notification history with filters (`device_id`, `alert_id`, `status`) |
| `GET` | `/api/notifications/{id}` | Retrieve a single notification record |
| `POST` | `/api/notifications/test` | Trigger a manual test Telegram dispatch |

