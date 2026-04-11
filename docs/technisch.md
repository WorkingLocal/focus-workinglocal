# Technische documentatie — Focus Kiosk App Working Local

## Concept

Focus is een coworking session management applicatie. Een centrale kiosk (touchscreen) beheert een gedeelde focus/pauze timer en toont de takenlijst van alle deelnemers. Deelnemers voegen zichzelf toe via hun eigen telefoon of laptop via `https://focus.workinglocal.be/join`.

## Architectuur

```
Internet
    │
    ├── Cloudflare Tunnel ──────────────────────┐
    │   (voor lokale kiosk)                     │
    │                                           ▼
    │                               Kiosk-apparaat (Windows)
    │                               kiosk.workinglocal.be
    │                               └── localhost:3000
    │
    └── Cloudflare DNS → Traefik ──────────────┐
        (VPS deployment)                        │
                                                ▼
                                  focus.workinglocal.be
                                  VPS → Node.js container
                                  └── poort 3000

Beide targets draaien dezelfde codebase:
kiosk-server/server.js (Node.js + Express + Socket.IO)
```

## Deployment targets

| Target | URL | Gebruik |
|---|---|---|
| VPS via Coolify | `https://focus.workinglocal.be` | Productie — online sessies |
| Lokale kiosk | `https://kiosk.workinglocal.be` | Fysieke kiosk via Cloudflare Tunnel |

## Tech stack

| Component | Technologie |
|---|---|
| Server runtime | Node.js 18+ |
| HTTP framework | Express 4 |
| Real-time communicatie | Socket.IO 4 (WebSocket) |
| State opslag | In-memory + `session-state.json` op disk |
| Server poort | `3000` (configureerbaar via `PORT`) |
| Build | Dockerfile (voor VPS) |

## REST endpoints

| Methode | Pad | Beschrijving |
|---|---|---|
| GET | `/` | Kiosk display UI (operator view) |
| GET | `/join` | Deelnemer join UI |
| GET | `/api/state` | Volledige sessie state (JSON) |
| GET | `/api/info` | Server IP, poort, join URL |
| POST | `/api/participants` | Deelnemer registreren of updaten |

## WebSocket events (namespace `/ws`)

**Server → Client:**
| Event | Payload | Beschrijving |
|---|---|---|
| `session:state` | volledig state object | Bij verbinding en na elke wijziging |
| `timer:start` | `{ type, remaining, duration }` | Timer gestart |
| `timer:tick` | `{ remaining, type }` | Elke seconde |
| `timer:end` | `{ type }` | Timer op nul |
| `timer:stopped` | `{}` | Timer manueel gestopt |
| `timer:paused` | `{}` | Timer gepauzeerd |
| `timer:resumed` | `{ remaining }` | Timer hervat |
| `participants:updated` | `{ participants }` | Deelnemerslijst gewijzigd |

**Client → Server (enkel operator):**
| Event | Beschrijving |
|---|---|
| `timer:startFocus` | Start 25-minuten focustimer |
| `timer:startBreak` | Start 10-minuten pauzetimer |
| `timer:stop` | Stop huidige timer |
| `timer:pause` | Pauzeer huidige timer |
| `timer:resume` | Hervat gepauzeerde timer |
| `session:nextBlock` | Volgende blok zonder timer |
| `session:reset` | Reset volledige sessie |

## Operator authenticatie

Wanneer `OPERATOR_SECRET` is ingesteld, zijn timer- en sessiecommands beveiligd:

```
https://focus.workinglocal.be/?key=<OPERATOR_SECRET>
```

De key wordt doorgegeven via `socket.handshake.auth.secret`. Deelnemers op `/join` worden nooit beïnvloed.

## Environment variables

| Variabele | Beschrijving | Standaard |
|---|---|---|
| `PUBLIC_URL` | Basis-URL voor de join link in `/api/info` | — |
| `OPERATOR_SECRET` | Beveiligt timer/sessie socket events | (geen beveiliging) |
| `PORT` | Server poort | `3000` |

## Persistentie

| Laag | Mechanisme | Scope |
|---|---|---|
| Server | `session-state.json` bij elke mutatie | Overleeft herstart |
| Kiosk browser | IndexedDB `focus-kiosk-v1` | Overleeft browser refresh |
| Deelnemer browser | `localStorage focus-participant` | Overleeft browser refresh |

## Cloudflare Tunnel (kiosk-apparaat)

Configuratiebestand: `infra/cloudflare/config.yml`

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<user>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: kiosk.workinglocal.be
    service: http://localhost:3000
  - service: http_status:404
```

Het kiosk-apparaat draait de Node.js server lokaal op poort 3000. Cloudflare Tunnel maakt dit bereikbaar via `kiosk.workinglocal.be` zonder een vast IP of open firewall.

## Data flow

```
[Deelnemer apparaat]
      │  POST /api/participants
      │  WS /ws  ← timer:tick, session:state, …
      ▼
[Kiosk Server (Node.js)]
      │  WS /ws  → timer:start, timer:tick, timer:end, session:state
      │  Write → session-state.json
      ▼
[Kiosk Browser (index.html)]
      IndexedDB cache
```
