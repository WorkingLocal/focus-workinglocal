# Focus Kiosk — Working Local (MVP)

A touchscreen kiosk web app for running guided Pomodoro focus sessions on a local network.

## What It Does

- A **kiosk device** (Windows tablet/laptop) runs the server and displays the session dashboard
- **Participants** on the same Wi-Fi join via their phone or laptop browser — no installation needed
- Each participant enters their name, chooses 6 or 12 focus blocks, and writes their task per block
- The kiosk operator starts 25-minute focus timers and 10-minute breaks via touchscreen
- All connected devices see the timer, block number, and participant tasks in real time

## Quick Start

### 1. Install dependencies

```bash
cd kiosk-server
npm install
```

### 2. Start the server

```bash
npm start
```

The server prints the kiosk URL and join URL, for example:

```
Kiosk UI : http://192.168.1.42:3000
Join URL : http://192.168.1.42:3000/join
```

### 3. Open the kiosk UI

Open `http://localhost:3000` in the kiosk browser (full-screen recommended).

### 4. Participants join

Participants open the **Join URL** on any device on the same network, enter their name, choose their block count, and fill in their tasks.

## Project Structure

```
focus-workinglocal/
├── kiosk-server/          # Node.js backend
│   ├── server.js          # Express + Socket.IO server
│   ├── package.json
│   └── session-state.json # Auto-created; persists session across reboots
├── kiosk-client/          # Static UI (served by kiosk-server)
│   ├── index.html         # Kiosk display (touchscreen)
│   ├── join.html          # Participant join form
│   ├── css/
│   │   ├── kiosk.css
│   │   └── join.css
│   └── js/
│       ├── kiosk.js
│       └── join.js
├── docs/
│   └── architecture.md    # Full technical architecture
├── infra/                 # Future deployment configs (Phase 2)
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express |
| Real-time | Socket.IO (namespace `/ws`) |
| Persistence | JSON file (server) + IndexedDB (kiosk browser) + localStorage (participant) |
| UI | Vanilla HTML/CSS/JS |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

Example: `PORT=8080 npm start`

## Session Controls (Kiosk)

| Button | Action |
|--------|--------|
| Start Focus | Start 25-minute Pomodoro timer |
| Start Break | Start 10-minute break timer |
| Stop | Stop current timer |
| Next Block | Advance to next block (skips timer) |
| Reset | Clear all participants, return to Block 1 |

## Architecture

See [docs/architecture.md](docs/architecture.md) for full technical details including WebSocket event reference and Phase 2 extension points.
