# 🌿 Botanical Lab — Smart Plant Monitoring & Watering System

An IoT-based plant monitoring and watering system that combines real-time environmental sensing, automated irrigation, and a web dashboard to help maintain healthier growing conditions.

**Botanical Lab** connects an ESP32-based hardware system to a Next.js web application and Supabase PostgreSQL database, enabling sensor data collection, historical monitoring, and remote visibility into plant conditions.

> **Project status:** Under active development. Core sensor telemetry and dashboard integration have been tested. Soil moisture calibration, watering validation, and further feature improvements remain in progress.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Problem Statement](#-problem-statement)
- [Objectives](#-objectives)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Hardware Components](#-hardware-components)
- [Technology Stack](#-technology-stack)
- [Getting Started](#-getting-started)
- [ESP32 Firmware Setup](#-esp32-firmware-setup)
- [Soil Moisture Calibration](#-soil-moisture-calibration)
- [API Overview](#-api-overview)
- [Safety Considerations](#-safety-considerations)
- [Current Limitations](#-current-limitations)
- [Future Enhancements](#-future-enhancements)
- [Contributing](#-contributing)
- [License](#-license)

## 🌱 Overview

Botanical Lab is designed to make plant care more informed and consistent by monitoring environmental conditions and automating watering based on configurable soil moisture thresholds.

An ESP32 collects sensor readings and controls the watering mechanism locally. The readings are transmitted over Wi-Fi to a Next.js API, stored in Supabase PostgreSQL, and presented through a web dashboard.

The system is designed to keep local watering logic independent of the web application, allowing sensor monitoring and automatic watering decisions to operate without requiring a continuous server connection.

## 🎯 Problem Statement

Manual plant care can be inconsistent, especially when soil moisture and surrounding environmental conditions are difficult to monitor continuously.

Overwatering and underwatering may affect plant health, while checking plants manually can be time-consuming.

Botanical Lab aims to address these challenges through:

- Continuous monitoring of soil moisture and environmental conditions.
- Automated watering based on configurable thresholds.
- Historical storage of sensor readings.
- A centralized dashboard for monitoring plant conditions.
- Time-limited watering and sensor-fault safeguards.

## 🎯 Objectives

- Build a low-cost IoT-based plant monitoring system.
- Measure soil moisture, temperature, humidity, and light conditions.
- Automate watering using an ESP32 and relay-controlled pump.
- Transmit telemetry to a web backend over Wi-Fi.
- Store readings for historical analysis.
- Provide a responsive dashboard for monitoring system activity.
- Implement basic safeguards against sensor faults and excessive watering.

## 🏗️ System Architecture

```text
┌─────────────────────────────────┐
│         Physical Layer          │
│                                 │
│  ESP32 + Soil Moisture Sensor   │
│  DHT11 + LDR + Relay + Pump     │
└────────────────┬────────────────┘
                 │
                 │ Sensor readings
                 │ Local watering logic
                 ▼
┌─────────────────────────────────┐
│           Wi-Fi Network         │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│        Next.js API Routes       │
│                                 │
│  Telemetry ingestion            │
│  Dashboard data                 │
│  Command handling               │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│       Supabase PostgreSQL       │
│                                 │
│  Sensor readings                │
│  Watering events                │
│  Device commands                │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│       Next.js Web Dashboard     │
│                                 │
│  Live system status             │
│  Environmental measurements     │
│  Soil moisture history          │
│  Watering activity               │
└─────────────────────────────────┘
```

**Data flow:** Sensors → ESP32 → Wi-Fi → Next.js API → Supabase → Dashboard.

The ESP32 handles local sensor processing and watering decisions. The web application provides remote monitoring, data storage, and supporting API functionality.

## ✨ Key Features

### Environmental Monitoring
- Soil moisture measurement using an FC-28 soil moisture sensor.
- Temperature and relative humidity monitoring using a DHT11.
- Light-condition detection using an LDR digital output.
- Periodic telemetry transmission to the backend.

### Automated Watering
- Configurable soil moisture start and stop thresholds.
- Relay-based control of an external water pump.
- Watering duration limits.
- A cooldown period between automatic watering cycles.
- A reduced-watering profile for configured low-demand environmental conditions.
- Local watering logic that does not depend on continuous cloud connectivity.

### Web Dashboard
- Soil moisture, temperature, humidity, and light-status cards.
- Pump and device-status indicators.
- Historical soil moisture visualization.
- Recent watering activity.
- Alerts for relevant sensor or system conditions.

### Backend and Data Management
- Next.js API routes for device telemetry and dashboard data.
- Supabase PostgreSQL for persistent storage.
- Device-key authentication for telemetry ingestion.
- Database tables for readings, watering events, and commands.

## 🔌 Hardware Components

| Component | Purpose |
|---|---|
| ESP32 DevKit | Main controller and Wi-Fi connectivity |
| FC-28 soil moisture sensor | Measures soil moisture |
| DHT11 sensor | Measures temperature and humidity |
| LDR module | Detects bright or dark conditions |
| Relay module | Switches the water pump |
| Water pump | Supplies water to the plant |
| Green, blue, and red LEDs | Visual system indicators |
| Passive buzzer | Available for future audible alerts |
| External power supply | Powers the pump independently of the ESP32 |

Additional sensors and modules may be integrated in future versions.

### Pin Configuration

| Component | ESP32 GPIO |
|---|---:|
| Soil moisture analog output | GPIO 34 |
| DHT11 data | GPIO 33 |
| LDR digital output | GPIO 35 |
| Relay input | GPIO 27 |
| Green LED | GPIO 2 |
| Blue LED | GPIO 4 |
| Red LED | GPIO 16 |
| Passive buzzer | GPIO 26 |

Verify the wiring and relay polarity against the firmware before powering the pump. GPIO assignments may change as the hardware evolves.

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| Embedded hardware | ESP32, Arduino framework |
| Firmware | C++ |
| Connectivity | Wi-Fi, HTTP |
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Backend | Next.js App Router API routes |
| Database | Supabase PostgreSQL |
| Database integration | Supabase JavaScript client |
| Development tools | Arduino IDE, Visual Studio Code, Git, GitHub |

## 🚀 Getting Started

### Prerequisites

Install the following before starting:

- [Node.js](https://nodejs.org/) — compatible with the project's Next.js dependencies.
- [Git](https://git-scm.com/).
- [Arduino IDE](https://www.arduino.cc/en/software/).
- An ESP32 board package configured in Arduino IDE.
- A Supabase project with the required database schema.
- A Wi-Fi network accessible to both the ESP32 and the development computer.

### 1. Clone the Repository

```bash
git clone https://github.com/nireeksharajiv/botanical-lab-smart-plant-monitor.git
cd botanical-lab-smart-plant-monitor
```

### 2. Set Up the Web Application

Navigate to the web application directory:

```bash
cd botanical-web
```

Install dependencies:

```bash
npm install
```

Create your local environment file by copying the example:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` and supply your own values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
DEVICE_KEY=your_random_device_key
```

Keep these values private. Never commit `.env.local`, service-role keys, or device secrets to GitHub.

### 3. Configure the Database

Open the Supabase SQL Editor and execute the schema in:

```text
botanical-web/supabase/schema.sql
```

Review the schema before executing it against an existing database.

Make sure the required tables, permissions, and database policies match the application's API implementation.

### 4. Start the Development Server

From the `botanical-web` directory, run:

```bash
npm run dev
```

Open the dashboard at:

```text
http://localhost:3000
```

The web application should be configured with valid Supabase credentials to retrieve and store project data.

## ⚙️ ESP32 Firmware Setup

### 1. Open the Firmware

Open the Arduino sketch located at:

```text
esp32-firmware/BotanicalLab.ino
```

Install or verify the ESP32 board support and required libraries, including the DHT sensor library and Adafruit Unified Sensor dependency if required by the sketch.

### 2. Configure Private Credentials

Create or maintain a local `secrets.h` file alongside the sketch. It should define the Wi-Fi credentials and device key expected by the firmware.

For example, adapt the definitions to match the names used by the sketch:

```cpp
#pragma once

#define WIFI_SSID "your_wifi_name"
#define WIFI_PASSWORD "your_wifi_password"
#define DEVICE_KEY "your_random_device_key"
```

This is an illustrative template. Use the exact constant names expected by the actual firmware.

Ensure `secrets.h` is excluded from Git tracking.

### 3. Configure the API Endpoint

The firmware must send telemetry to the computer or server running the Next.js application.

For local development, configure the server URL using the computer's reachable LAN IP address:

```text
http://YOUR_COMPUTER_LAN_IP:3000
```

The ESP32 and computer should be connected to a network that permits communication between them. Allow the development server through the computer's firewall if necessary.

Update the endpoint if the server's IP address or deployment environment changes.

### 4. Upload and Monitor

1. Connect the ESP32 using USB.
2. Select the appropriate ESP32 board and serial port.
3. Upload the firmware.
4. Open Serial Monitor at **115200 baud**.
5. Verify Wi-Fi connectivity and telemetry responses.
6. Confirm that readings reach the database and appear on the dashboard.

Keep the pump disconnected during initial relay and firmware testing.

## 🌾 Soil Moisture Calibration

Soil moisture sensors produce raw analog readings that depend on the sensor, soil composition, moisture level, and electrical conditions. These readings must be calibrated before percentage-based automatic watering can be trusted.

The firmware supports configurable dry and wet reference readings.

A basic calibration process is:

1. Record several stable readings with the sensor in air or the chosen dry reference condition.
2. Record readings with the sensor inserted into suitably moist soil.
3. Set the dry and wet calibration values in the firmware.
4. Verify that displayed moisture percentage increases as the soil becomes wetter.
5. Test the thresholds with the pump disconnected before enabling automatic watering.

**Important:** A raw sensor value is not a universal moisture percentage. Do not enable automatic watering until calibration and sensor-fault behavior have been validated.

## 🔗 API Overview

The Next.js application exposes API routes for telemetry, dashboard data, and command handling.

| Endpoint | Purpose |
|---|---|
| `POST /api/ingest` | Receives device telemetry and stores readings |
| `GET /api/dashboard` | Retrieves dashboard information |
| `/api/commands` | Supports application command operations |
| `/api/commands/pending` | Handles pending-command retrieval |
| `/api/commands/ack` | Handles command acknowledgements |

The command-related routes are part of the current application structure; their complete end-to-end integration should be validated before relying on them in production.

Telemetry ingestion uses a device key supplied through the configured authentication header. Requests must follow the payload format expected by the firmware and API implementation.

## 🛡️ Safety Considerations

- Use a suitable external power supply for the water pump.
- Do not power a pump directly from an ESP32 GPIO pin.
- Verify relay active-low or active-high behavior before connecting the pump.
- Keep water away from exposed electronics and USB connections.
- Use appropriate electrical isolation and enclosure protection.
- Set maximum watering durations and cooldown limits.
- Stop automatic watering when the moisture sensor reports invalid readings.
- Test relay behavior with the pump disconnected before live operation.
- Never commit credentials, API keys, or Wi-Fi passwords.
- Do not expose privileged Supabase credentials to browser-side code.

## ⚠️ Current Limitations

- Soil moisture percentage depends on sensor calibration and growing conditions.
- The LDR currently provides a digital bright/dark state rather than a calibrated lux measurement.
- Automatic watering must be validated under real soil and pump conditions.
- Device connectivity status depends on telemetry and the application's status logic.
- Command handling and complete remote-control behavior require end-to-end validation.
- The current setup is intended for development and experimentation, not safety-critical or commercial irrigation deployment.

## 🔮 Future Enhancements

- [ ] Complete soil moisture calibration and validate watering thresholds.
- [ ] Validate automated pump control with real plants and soil.
- [ ] Improve sensor-fault detection and recovery.
- [ ] Add more detailed watering history and analytics.
- [ ] Complete and validate remote command execution.
- [ ] Add configurable plant profiles and watering schedules.
- [ ] Introduce additional sensors such as tank-level or water-flow monitoring.
- [ ] Improve alerts and device connectivity diagnostics.
- [ ] Deploy the dashboard for secure remote access.
- [ ] Evaluate data-driven watering recommendations using historical readings.

## 🤝 Contributing

Contributions, suggestions, and bug reports are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes and test them.
4. Submit a pull request describing the changes.

Please avoid including personal credentials, device secrets, or private environment files in contributions.

## 📄 License

No license has been specified yet. Until a license is added to the repository, reuse and redistribution permissions should not be assumed.

---

**Built as an IoT learning project exploring embedded systems, sensor integration, automated irrigation, web development, and cloud-connected data monitoring.**
