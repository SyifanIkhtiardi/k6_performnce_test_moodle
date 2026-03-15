# 🚀 k6 Performance Testing — Moodle Exam (1000 Students)

> Load & stress testing suite for Moodle-based online exam systems, simulating **1,000 concurrent students** performing a full exam flow: login → start attempt → answer questions → submit.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Test Scenarios](#test-scenarios)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Running Tests](#running-tests)
- [Monitoring](#monitoring)
- [Thresholds & SLOs](#thresholds--slos)
- [Results Interpretation](#results-interpretation)

---

## Overview

This project benchmarks two Moodle-compatible platforms under realistic exam conditions:

| Script | Target | Purpose |
|---|---|---|
| `moodle_exam_test.js` | `ujian.smkn7semarang.sch.id` | Full exam flow (login → answer → submit) |

Scripts simulate **1,000 virtual users (VUs)** ramping up over time to replicate a realistic school exam session.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  k6 Test Engine                  │
│   (1000 VUs — ramping-vus / stages executor)    │
└───────────┬─────────────────────────────────────┘
            │ HTTP requests
            ▼
┌─────────────────────────────────────────────────┐
│             Moodle / Custom LMS                  │
│  • Login  • Start Attempt  • Answer  • Submit   │
└─────────────────────────────────────────────────┘
            │ metrics output
            ▼
┌───────────────────┐     ┌───────────────────────┐
│    InfluxDB 1.8   │────▶│     Grafana Dashboard  │
│  (time-series DB) │     │  http://localhost:3000  │
└───────────────────┘     └───────────────────────┘
```

---

## Project Structure

```
k6-moodle-performance-test/
│
├── scripts/
│   ├── moodle_exam_test.js       # Full exam simulation (Moodle)
│
├── data/
│   ├── users.json                # Student credentials (1000 accounts)
│   └── answers.json              # Answer pool per question page
│
├── config/
│   └── grafana/
│       └── provisioning/         # Auto-provisioned Grafana datasource & dashboards
│
├── docs/
│   └── test-results/             # Test result screenshots & reports
│
├── docker-compose.yml            # Grafana + InfluxDB monitoring stack
└── README.md
```

---

## Test Scenarios

### Scenario A — Full Exam Flow (`moodle_exam_test.js`)

```
VUs
1000 ┤                  ████████████████
 200 ┤           ████████
   0 ┤     ██████                        ██████
     └──────────────────────────────────────────▶ time
      0m   2m    7m                    17m  20m
```

**Flow per VU:**
1. `GET /login/index.php` — scrape CSRF logintoken
2. `POST /login/index.php` — authenticate
3. `GET /mod/quiz/view.php` — load quiz page
4. `POST /mod/quiz/startattempt.php` — start exam attempt
5. For each page: `GET attempt.php` → `POST processattempt.php`
6. `POST processattempt.php?finishattempt=1` — submit

---

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) `v0.50+`
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (for monitoring)
- Node.js `v18+` (for `generate-users.js`)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/k6-moodle-performance-test.git
cd k6-moodle-performance-test

# 2. Start monitoring stack
docker compose up -d

# 3. Run a test
k6 run --out influxdb=http://localhost:8086/k6 scripts/moodle_exam_test.js
```

---

## Running Tests

### Moodle Exam Test (full flow)
```bash
k6 run --out influxdb=http://localhost:8086/k6 scripts/moodle_exam_test.js
```

### STEMBA Panel Load Test
```bash
k6 run --out influxdb=http://localhost:8086/k6 scripts/ujianv2_load_test.js
```

### Quick Smoke Test (1 VU, 1 iteration)
```bash
k6 run --vus 1 --iterations 1 scripts/moodle_exam_test.js
```

### Custom VU Count
```bash
k6 run --vus 100 --duration 5m scripts/moodle_exam_test.js
```

---

## Monitoring

Open Grafana at **http://localhost:3000** (login: `admin` / `admin`)

The k6 official dashboard (ID `2587`) can be imported to visualize:
- Active VUs over time
- Request rate (req/s)
- Response time percentiles (p50, p90, p95, p99)
- HTTP error rate
- Custom metrics: `login_success_rate`, `exam_load_time_ms`, `answer_save_time_ms`

---

## Thresholds & SLOs

| Metric | Threshold | Description |
|---|---|---|
| `http_req_failed` | `< 1%` | Overall HTTP error rate |
| `http_req_duration p(95)` | `< 4000ms` | 95th percentile response time |
| `login_success_rate` | `> 99%` | Login must succeed for 99% of VUs |
| `exam_load_time_ms p(90)` | `< 3000ms` | Exam page load at 90th percentile |
| `answer_save_time_ms p(95)` | `< 2000ms` | Answer save latency at 95th percentile |
| `detail_page_success_rate` | `> 95%` | Exam detail page accessibility |

---

## Results Interpretation

| Status | Meaning |
|---|---|
| ✅ All thresholds passed | System handles 1000 concurrent students |
| ⚠️ `p(95)` latency exceeded | Server struggling under load — check DB queries / caching |
| ❌ `http_req_failed > 1%` | Connection errors / server overload |
| ❌ Login rate drops | Session management / auth bottleneck |

---

## Tech Stack

![k6](https://img.shields.io/badge/k6-7D64FF?style=flat&logo=k6&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-F46800?style=flat&logo=grafana&logoColor=white)
![InfluxDB](https://img.shields.io/badge/InfluxDB-22ADF6?style=flat&logo=influxdb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Moodle](https://img.shields.io/badge/Moodle-F98012?style=flat&logo=moodle&logoColor=white)

---

*Built for SMKN 7 Semarang — Academic Year 2024/2025*
