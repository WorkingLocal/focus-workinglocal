# Focus Kiosk — Working Local

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
├── infra/                 # Deployment configs (Cloudflare Tunnel, Caddy, PM2)
│   ├── cloudflare/
│   │   └── config.yml     # cloudflared tunnel config template (kiosk)
│   ├── vps/
│   │   ├── Caddyfile      # Caddy reverse proxy for focus.workinglocal.be
│   │   └── ecosystem.config.cjs  # PM2 process config
│   └── .env.example       # Environment variable template
├── docs/
│   ├── architecture.md    # Full technical architecture
│   └── deployment.md      # Step-by-step deployment guide
├── CHANGELOG.md
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
| `PUBLIC_URL` | _(auto)_ | Base URL returned in join URL (set when behind a tunnel or proxy) |
| `OPERATOR_SECRET` | _(none)_ | Protects timer/session controls; leave empty for local LAN use |

Copy `infra/.env.example` to `kiosk-server/.env` and fill in values. See [docs/deployment.md](docs/deployment.md) for full setup instructions.

## Session Controls (Kiosk)

| Button | Action |
|--------|--------|
| Start Focus | Start 25-minute Pomodoro timer |
| Start Break | Start 10-minute break timer |
| Stop | Stop current timer |
| Next Block | Advance to next block (skips timer) |
| Reset | Clear all participants, return to Block 1 |

## Architecture & Deployment

See [docs/architecture.md](docs/architecture.md) for full technical details and WebSocket event reference.
See [docs/deployment.md](docs/deployment.md) for kiosk (Cloudflare Tunnel) and VPS (Caddy + PM2) setup.
