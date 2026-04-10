# Deployment Guide

Two deployment targets share the same codebase:

| Target | URL | Use case |
|---|---|---|
| VPS (Docker via Coolify) | `https://focus.workinglocal.be` | Productie — online sessies |
| Kiosk (lokaal apparaat) | `https://kiosk.workinglocal.be` | Fysieke kiosk via Cloudflare Tunnel |

---

## Operator authenticatie

Wanneer `OPERATOR_SECRET` is ingesteld, kunnen enkel requests met de juiste key de timer bedienen. Deelnemers (join pagina) zijn nooit beïnvloed.

```
https://focus.workinglocal.be/?key=<OPERATOR_SECRET>
```

---

## A. VPS — Docker via Coolify (productie)

### Vereisten
- Coolify geïnstalleerd op de VPS (zie [vps-workinglocal](https://github.com/WorkingLocal/vps-workinglocal))
- DNS A-record: `focus.workinglocal.be` → VPS IP (Cloudflare proxy OFF)

### Deployment in Coolify

1. **New Resource → Application**
2. Source: GitHub → `WorkingLocal/focus-workinglocal`
3. Branch: `master`
4. Build Pack: `Dockerfile`
5. Domain: `https://focus.workinglocal.be`
6. Port: `3000`
7. Deploy

Coolify bouwt de Docker image, regelt SSL via Caddy en herdeployt automatisch bij een push naar `master`.

### Updaten

```bash
git push origin master
# Coolify deploy automatisch via webhook
```

Of manueel: **Coolify → focus-app → Redeploy**

---

## B. Kiosk apparaat (Windows) — Cloudflare Tunnel

### Vereisten
- Cloudflare account met `workinglocal.be`
- Node.js 18+ op het kiosk apparaat

### Installatie

```cmd
# cloudflared installeren
# Download: https://github.com/cloudflare/cloudflared/releases
# Kies: cloudflared-windows-amd64.msi

cloudflared tunnel login
cloudflared tunnel create focus-kiosk
```

Kopieer `infra/cloudflare/config.yml` naar `C:\Users\<user>\.cloudflared\config.yml`
en vervang `<TUNNEL_ID>`.

```cmd
cloudflared tunnel route dns focus-kiosk kiosk.workinglocal.be
cloudflared service install
net start cloudflared
```

### App starten

```cmd
cd kiosk-server
npm install --omit=dev
npm start
```

Kiosk browser homepage: `http://localhost:3000/?key=<OPERATOR_SECRET>`

---

## Docker image lokaal testen

```bash
docker build -t focus-workinglocal .
docker run -p 3000:3000 focus-workinglocal
```
