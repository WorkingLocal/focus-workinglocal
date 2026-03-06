# Deployment Guide

Two deployment targets share the same codebase:

| Target | URL | Use case |
|--------|-----|----------|
| Kiosk (local tablet) | `https://kiosk.workinglocal.be` | Physical kiosk + Cloudflare Tunnel |
| VPS (Racknerd) | `https://focus.workinglocal.be` | Online-only sessions |

---

## Operator authentication

When `OPERATOR_SECRET` is set, only requests that include the correct key can
control the timer. Participants (join page) are never affected.

**Operator URL pattern:**
```
https://kiosk.workinglocal.be/?key=<OPERATOR_SECRET>
https://focus.workinglocal.be/?key=<OPERATOR_SECRET>
```

Set this URL as the homepage in the kiosk browser. Participants only need
`/join` — no key required.

---

## A. Kiosk device (Windows) — Cloudflare Tunnel

### Prerequisites
- Cloudflare account with `workinglocal.be` as an active zone
- Node.js 18+ installed on the kiosk

### 1. Install cloudflared

Download from https://github.com/cloudflare/cloudflared/releases
Choose `cloudflared-windows-amd64.msi` and install.

### 2. Authenticate

```cmd
cloudflared tunnel login
```

A browser window opens. Authorize the domain.

### 3. Create the tunnel

```cmd
cloudflared tunnel create focus-kiosk
```

Note the tunnel ID printed (e.g. `a1b2c3d4-...`).

### 4. Configure the tunnel

Copy `infra/cloudflare/config.yml` to `C:\Users\<user>\.cloudflared\config.yml`
Replace `<TUNNEL_ID>` and `<user>` with the correct values.

### 5. Add DNS record

```cmd
cloudflared tunnel route dns focus-kiosk kiosk.workinglocal.be
```

### 6. Configure the server

Create `kiosk-server\.env`:
```
PORT=3000
PUBLIC_URL=https://kiosk.workinglocal.be
OPERATOR_SECRET=your-secret-here
```

Install the `dotenv` package or set variables in the Windows startup script.

### 7. Run tunnel as Windows service

```cmd
cloudflared service install
net start cloudflared
```

### 8. Start the kiosk server

```cmd
cd kiosk-server
npm start
```

Set the kiosk browser homepage to:
```
http://localhost:3000/?key=your-secret-here
```

---

## B. VPS (Racknerd) — Caddy + PM2

### Prerequisites
- Ubuntu 22.04 (or similar)
- DNS A record: `focus.workinglocal.be` → VPS IP (set in Cloudflare DNS, **proxy OFF** — grey cloud — so Caddy handles TLS)

### 1. Install Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Install PM2

```bash
sudo npm install -g pm2
```

### 3. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 4. Deploy the app

```bash
sudo mkdir -p /opt/focus-workinglocal
cd /opt/focus-workinglocal
git clone https://github.com/WorkingLocal/focus-workinglocal.git .
cd kiosk-server && npm install --omit=dev && cd ..
```

### 5. Configure Caddy

```bash
sudo cp infra/vps/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 6. Configure PM2

Edit `infra/vps/ecosystem.config.cjs` — set `OPERATOR_SECRET` to a strong random value.

```bash
pm2 start infra/vps/ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command to enable auto-start
```

### 7. Verify

```
https://focus.workinglocal.be/join        → participant join page
https://focus.workinglocal.be/?key=<secret> → operator kiosk UI
```

---

## Updating

### Kiosk (Windows)
```cmd
cd focus-workinglocal
git pull
```
Restart the server.

### VPS
```bash
cd /opt/focus-workinglocal
git pull
pm2 restart focus-kiosk
```
