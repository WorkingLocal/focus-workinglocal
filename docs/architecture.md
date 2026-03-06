# Focus Kiosk — Architecture

## Overview

The server runs on a local or public network. A Windows tablet/device runs the kiosk server and displays the kiosk UI. Participants on the same Wi-Fi network open `http://<kiosk-IP>:3000/join` on their phones or laptops, or join via the public URL when deployed to a VPS.

---

## Components

### 1. Kiosk Local Server (`/kiosk-server`)

| Attribute | Detail |
|-----------|--------|
| Runtime | Node.js 18+ |
| Framework | Express 4 (HTTP), Socket.IO 4 (WebSocket) |
| State storage | In-memory object + `session-state.json` on disk |
| Port | 3000 (configurable via `PORT` env var) |

**Responsibilities:**
- Serve static kiosk and join UI from `/kiosk-client`
- Manage all WebSocket connections via the `/ws` Socket.IO namespace
- Maintain authoritative session state (participants, timer, block number)
- Persist state to JSON on every mutation
- Run the timer on the server (prevents client drift)
- Broadcast events to all connected clients

**REST endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Kiosk display UI |
| GET | `/join` | Participant join UI |
| GET | `/api/state` | Full session state (JSON) |
| GET | `/api/info` | Server IP, port, join URL |
| POST | `/api/participants` | Register/update a participant |

**WebSocket events (namespace `/ws`):**

*Server → Client:*
| Event | Payload | Description |
|-------|---------|-------------|
| `session:state` | full state object | Sent on connect and after any state change |
| `timer:start` | `{ type, remaining, duration }` | Timer started |
| `timer:tick` | `{ remaining, type }` | Every second while running |
| `timer:end` | `{ type }` | Timer reached zero |
| `timer:stopped` | `{}` | Timer manually stopped |
| `timer:paused` | `{}` | Timer paused |
| `timer:resumed` | `{ remaining }` | Timer resumed |
| `participants:updated` | `{ participants }` | Participant list changed |

*Client → Server (kiosk operator):*
| Event | Description |
|-------|-------------|
| `timer:startFocus` | Start 25-minute focus timer |
| `timer:startBreak` | Start 10-minute break timer |
| `timer:stop` | Stop current timer |
| `timer:pause` | Pause current timer |
| `timer:resume` | Resume paused timer |
| `session:nextBlock` | Advance to next block without timer |
| `session:reset` | Reset entire session |

---

### 2. Kiosk UI (`/kiosk-client/index.html`)

Runs in the kiosk browser (full-screen, touchscreen-optimized).

- Vanilla JS + Socket.IO client
- IndexedDB cache for offline resilience (survives browser refresh)
- Displays: countdown timer, current phase, block number, date, participant list with current-block tasks, join URL
- Controls: Start Focus, Start Break, Stop, Next Block, Reset (with confirmation modal)

---

### 3. Participant Join UI (`/kiosk-client/join.html`)

Opened by participants on their own devices.

- Simple HTML form — no installation required
- Participants enter name, choose 6 or 12 blocks, fill task per block
- POSTs to `/api/participants`
- After joining, shows live session view (current block, phase, timer, own task)
- Persists join data in `localStorage` for page-refresh resilience

---

### 4. Local Persistence

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Server | `session-state.json` written on every mutation | Survives server reboot |
| Kiosk browser | IndexedDB `focus-kiosk-v1` store | Survives browser refresh |
| Participant browser | `localStorage` key `focus-participant` | Survives browser refresh |

---

## Data Flow

```
[Participant Device]
      |  POST /api/participants
      |  WS /ws  ← timer:tick, session:state, …
      ↓
[Kiosk Server (Node.js)]
      |  WS /ws  → timer:start, timer:tick, timer:end, session:state
      |  Write → session-state.json
      ↓
[Kiosk Browser (index.html)]
      IndexedDB cache
```

---

## Public Deployment (v1.2.0)

Two deployment targets share the same codebase:

| Target | URL | Setup |
|--------|-----|-------|
| Kiosk (local tablet) | `https://kiosk.workinglocal.be` | Cloudflare Tunnel → `localhost:3000` |
| VPS | `https://focus.workinglocal.be` | Caddy reverse proxy → PM2 Node.js |

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `PUBLIC_URL` | Base URL returned in `/api/info` join URL |
| `OPERATOR_SECRET` | Protects timer/session socket events via handshake auth |
| `PORT` | Server port (default: 3000) |

**Operator authentication:**
- Operator opens `https://focus.workinglocal.be/?key=<OPERATOR_SECRET>`
- The key is read from `location.search` and passed as `socket.handshake.auth.secret`
- All `timer:*` and `session:*` server handlers verify `isOperator(socket)` before acting
- Participants on `/join` are never affected

See [deployment.md](deployment.md) for full setup instructions.

---

## Extension Points

The following architectural decisions make future extensions straightforward without a core refactor:

1. **Event-driven state** — all mutations are events; a cloud relay can mirror them over a second Socket.IO connection.
2. **Namespaced WebSocket** — `/ws` can be re-mapped to a remote relay with a single config change.
3. **Abstracted persistence** — the `saveState` / `loadState` functions are isolated; swapping JSON for Redis is a one-file change.
4. **REST `/api/state`** — allows stateless clients to sync on connect without needing WebSocket history.
