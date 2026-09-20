# 🌱 Botanical Lab — Smart Plant Monitor

> An IoT-based smart plant monitoring and automated irrigation system built with ESP32, environmental sensors, FastAPI, PostgreSQL/Supabase, Next.js, and Telegram.

Botanical Lab is a full-stack IoT system designed to continuously monitor plant and environmental conditions and intelligently manage irrigation.

The system collects sensor data from an ESP32, sends it to a FastAPI backend, stores telemetry in PostgreSQL through Supabase, processes sensor conditions through an alert and irrigation engine, and presents the information through a real-time web dashboard.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Problem Statement](#-problem-statement)
- [Solution](#-solution)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Hardware](#-hardware)
- [Hardware Connections](#-hardware-connections)
- [Irrigation Logic](#-irrigation-logic)
- [Alert System](#-alert-system)
- [Signal Processing](#-signal-processing)
- [Software Architecture](#-software-architecture)
- [Database](#-database)
- [API](#-api)
- [Telegram Notifications](#-telegram-notifications)
- [Dashboard](#-dashboard)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the Project](#-running-the-project)
- [Testing](#-testing)
- [Security](#-security)
- [Design Decisions](#-design-decisions)
- [Limitations](#-limitations)
- [Future Improvements](#-future-improvements)
- [License](#-license)

---

# 🌿 Overview

Botanical Lab combines embedded hardware, backend services, database storage, signal processing, automation, and a web interface into a single plant monitoring platform.

The system monitors five primary environmental parameters:

| Parameter | Sensor | Purpose |
|---|---|---|
| Soil Moisture | FC-28 | Determines whether the soil is dry |
| Rain | Rain Sensor | Prevents unnecessary watering during rain |
| Temperature & Humidity | DHT11 | Environmental monitoring |
| Tank Level | HC-SR04 | Determines whether sufficient water is available |
| Light | LDR | Measures ambient light |

The irrigation system uses a relay-controlled DC water pump.

```text
                    ┌─────────────────────┐
                    │        ESP32        │
                    │                     │
                    │  Soil Moisture      │
                    │  Rain Sensor        │
                    │  DHT11              │
                    │  HC-SR04            │
                    │  LDR                │
                    └──────────┬──────────┘
                               │
                         Sensor Data
                               │
                               ▼
                    ┌─────────────────────┐
                    │       FastAPI       │
                    │      Backend        │
                    │                     │
                    │  Alert Engine       │
                    │  Irrigation Logic   │
                    │  SSE Events        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌─────────────┐  ┌─────────────┐  ┌────────────┐
       │  Supabase   │  │  Next.js    │  │  Telegram  │
       │ PostgreSQL  │  │  Dashboard  │  │    Bot     │
       └─────────────┘  └─────────────┘  └────────────┘
