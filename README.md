# 🌱 Botanical Lab — Smart Plant Monitor

An IoT-based smart plant monitoring and automated irrigation system built using **ESP32, sensors, FastAPI, PostgreSQL/Supabase, Next.js, and Telegram**.

## ✨ Features

- 🌱 Soil moisture monitoring
- 🌧️ Rain detection
- 🌡️ Temperature & humidity monitoring
- 💧 Water tank level monitoring
- ☀️ Light monitoring
- 🚰 Automatic irrigation using a relay-controlled pump
- 📊 Real-time sensor dashboard
- 📈 Sensor signal filtering and visualization
- 🚨 Automatic alerts
- 📱 Telegram notifications
- 🗄️ Supabase PostgreSQL database

## 🔧 Hardware

- ESP32
- FC-28 Soil Moisture Sensor
- Rain Sensor
- DHT11
- HC-SR04 Ultrasonic Sensor
- LDR
- Relay Module
- DC Water Pump
- 16×2 LCD

## 🏗️ Architecture

```text
Sensors
   ↓
ESP32
   ↓
FastAPI Backend
   ↓
┌──────────────┬──────────────┐
│   Supabase   │   Dashboard  │
│  PostgreSQL  │   Next.js    │
└──────────────┴──────────────┘
        ↓
     Telegram
💧 Irrigation Logic

The pump automatically turns ON when:

Soil is dry
+ No rain
+ Sufficient tank water

It turns OFF when:

Soil is sufficiently wet
OR Rain is detected
OR Tank level is too low

Soil moisture hysteresis:

Start watering: < 30%
Stop watering: ≥ 45%
💻 Tech Stack
Layer	Technology
Hardware	ESP32
Frontend	Next.js + TypeScript
Styling	Tailwind CSS
Backend	FastAPI + Python
Database	PostgreSQL / Supabase
Charts	Recharts
Notifications	Telegram Bot API
Testing	Pytest
🚀 Run Locally
Backend
.\backend\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir backend
Frontend
npm.cmd run dev

Open:

http://localhost:3000

API documentation:

http://127.0.0.1:8000/docs
🔐 Environment Variables

Create your local environment files using:

.env.example
backend/.env.example

Never commit .env files or API credentials.

📌 Future Improvements
Machine-learning-based irrigation prediction
Weather API integration
Multi-plant support
Mobile application
Cloud deployment
Low-power/battery operation
📜 License

MIT License

Botanical Lab — Sense → Process → Decide → Act → Notify 🌱
