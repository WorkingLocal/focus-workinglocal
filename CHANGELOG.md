# Changelog

All notable changes to Focus Kiosk are documented here.

---

## [1.2.0] — 2026-03-06

### Added
- `PUBLIC_URL` environment variable: `/api/info` now returns the correct join URL when running behind a tunnel or reverse proxy
- `OPERATOR_SECRET` environment variable: timer and session controls are protected via socket handshake authentication
- Operator key is read from the `?key=` URL parameter and passed as socket auth — participants on `/join` are unaffected
- `app.set('trust proxy', 1)` for correct IP handling behind Cloudflare and Caddy
- `infra/cloudflare/config.yml` — cloudflared tunnel config template for kiosk
- `infra/vps/Caddyfile` — Caddy reverse proxy config for `focus.workinglocal.be`
- `infra/vps/ecosystem.config.cjs` — PM2 process config for VPS deployment
- `infra/.env.example` — environment variable template
- `docs/deployment.md` — step-by-step deployment guide for both kiosk (Cloudflare Tunnel) and VPS (Caddy + PM2)

---

## [1.1.3] — 2026-03-05 (hotfix 2026-03-06)

### Added
- Pause/Resume button (orange) — toggles between Pause and Resume label and icon
- Server-side `pauseTimer` and `resumeTimer` functions
- `timer:pause` and `timer:resume` socket events (client → server)
- `timer:paused` and `timer:resumed` socket events (server → client)
- NL translations: "Pauzeer", "Hervat", "Timer gepauzeerd"

### Fixed
- Stop button now correctly re-enables when a timer is paused (paused counts as active)
- Clock (24h) and join URL now display immediately on page load instead of waiting for socket events
- Null-safe guard on `btnPause` — if the pause button is absent from the HTML, the module-level `addEventListener` no longer crashes the script before `init()` runs (this crash was silently preventing the clock and join URL from displaying)

---

## [1.1.2] — 2026-03-05

### Added
- Block display moved from the header to a dedicated block bar below the header
- Audio cues: ticking sound during the first 15 seconds and last 30 seconds of a focus block; bell at 10 and 5 minutes remaining (focus only)
- Join URL now resolves immediately from `location.hostname` instead of waiting for the `/api/info` response

### Changed
- Progress ring stroke width increased from 5 to 25 for better visibility on touchscreen
- 5-minute ring tick markers removed

---

## [1.1.1] — 2026-03-05

### Added
- NL/EN language selector on kiosk and join pages; preference saved in `localStorage`; Dutch (NL) as default
- Full Dutch and English translations for all UI strings, including locale-aware date formatting (`nl-BE` / `en-US`)
- Digital 24-hour clock (HH:MM:SS) added below the date in the header

### Changed
- Logo enlarged to 44px and displayed in colour (grayscale filter removed) on both pages
- Date moved to the right of the logo inside the header (flex row layout)
- Progress ring idle colour made visible; 5-minute markers shown by default

---

## [1.1.0] — 2026-03-05

### Added
- SVG progress ring around the countdown timer
- Tick sound during the last seconds of a timer
- Alarm sound when the timer ends
- Working Local house style (colours, typography, logo)

---

## [1.0.0] — 2026-03-05

### Added
- Node.js + Express + Socket.IO server with `/ws` namespace
- Server-side timer logic (single source of truth); broadcasts `timer:start`, `timer:tick`, `timer:end`, `timer:stopped` events
- JSON file persistence for session state — survives server reboot
- Kiosk UI: full-screen touchscreen display with countdown, block/date header, participant list with per-block tasks, join URL
- IndexedDB cache in kiosk browser for refresh resilience
- Participant join UI: dynamic task fields for 6 or 12 blocks, live session view after joining
- `localStorage` persistence for participant data across page refresh
- `/api/info` endpoint serves local IP and join URL for display on kiosk
- REST endpoints: `GET /api/state`, `POST /api/participants`
