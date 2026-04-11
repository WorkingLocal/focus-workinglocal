# Hoe gebruik ik Focus? — Working Local

## Wat is dit?

Focus is de coworking sessie-app van Working Local. Een centrale kiosk (touchscreen) beheert een gedeelde focus/pauze timer. Deelnemers voegen zichzelf toe via hun eigen telefoon of laptop en zien hun eigen takenoverzicht naast de gedeelde timer.

---

## Hoe deploy ik Focus op de VPS?

### Vereisten

- Coolify draait op de VPS
- DNS A-record: `focus.workinglocal.be` → VPS-IP (Cloudflare proxy UIT)

### Stap 1 — Deployen via Coolify

1. Ga naar **https://coolify.workinglocal.be**
2. Klik **New Resource → Application**
3. Bron: GitHub → `WorkingLocal/focus-workinglocal`
4. Branch: `master`
5. Build Pack: `Dockerfile`
6. Domain: `https://focus.workinglocal.be`
7. Poort: `3000`
8. Voeg environment variables toe:

   | Variabele | Waarde |
   |---|---|
   | `PUBLIC_URL` | `https://focus.workinglocal.be` |
   | `OPERATOR_SECRET` | kies een sterk geheim wachtwoord |

9. Klik **Deploy**

### Stap 2 — Controleren

Ga naar **https://focus.workinglocal.be/?key=<OPERATOR_SECRET>**

Je ziet de kiosk operator interface. Als de pagina laadt, werkt alles correct.

---

## Hoe gebruik ik de kiosk (operator)?

De operator opent de kiosk URL met de geheime key:

```
https://focus.workinglocal.be/?key=<OPERATOR_SECRET>
```

Of lokaal op het kiosk-apparaat:

```
http://localhost:3000/?key=<OPERATOR_SECRET>
```

### Beschikbare acties

| Knop | Wat het doet |
|---|---|
| **Start Focus** | Start een 25-minuten focustimer |
| **Start Break** | Start een 10-minuten pauzetimer |
| **Stop** | Stop de huidige timer |
| **Pause / Resume** | Pauzeer of hervat de timer |
| **Next Block** | Ga naar het volgende blok zonder timer |
| **Reset** | Reset de volledige sessie (vraagt bevestiging) |

---

## Hoe nemen deelnemers deel?

1. Deelnemer opent op zijn/haar telefoon of laptop:
   ```
   https://focus.workinglocal.be/join
   ```
2. Vult naam in
3. Kiest 6 of 12 blokken
4. Voert een taak in per blok
5. Klikt **Deelnemen**

Na het deelnemen ziet de deelnemer:
- De huidige fase (Focus of Pauze)
- De resterende tijd
- Zijn/haar eigen taak voor het huidige blok

---

## Hoe installeer ik Focus op een lokaal kiosk-apparaat?

### Vereisten

- Windows apparaat met Node.js 18+ geïnstalleerd
- Cloudflare account met `workinglocal.be`
- `cloudflared` geïnstalleerd ([download hier](https://github.com/cloudflare/cloudflared/releases))

### Stap 1 — Cloudflare Tunnel aanmaken

```cmd
cloudflared tunnel login
cloudflared tunnel create focus-kiosk
```

Noteer de Tunnel ID.

### Stap 2 — Configuratie instellen

Kopieer `infra/cloudflare/config.yml` naar `C:\Users\<user>\.cloudflared\config.yml` en vervang `<TUNNEL_ID>` en `<user>`.

```cmd
cloudflared tunnel route dns focus-kiosk kiosk.workinglocal.be
cloudflared service install
net start cloudflared
```

### Stap 3 — App starten

```cmd
cd kiosk-server
npm install --omit=dev
npm start
```

De kiosk is nu bereikbaar via `http://localhost:3000` op het apparaat zelf en via `https://kiosk.workinglocal.be` van buitenaf.

Kiosk operator URL: `http://localhost:3000/?key=<OPERATOR_SECRET>`

---

## Hoe update ik de app?

### VPS (automatisch via Coolify)

```bash
git push origin master
# Coolify herdeployt automatisch via webhook
```

Of manueel in Coolify: **focus-app → Redeploy**

### Lokaal kiosk-apparaat

```cmd
git pull origin master
cd kiosk-server
npm install --omit=dev
# Herstart de app
```

---

## Problemen oplossen

| Probleem | Oplossing |
|---|---|
| Operator knoppen werken niet | Controleer of `?key=<OPERATOR_SECRET>` in de URL staat |
| Deelnemers zien timer niet bewegen | Socket.IO verbinding verbroken — refresh de pagina |
| `/join` toont lege pagina | Controleer of de server draait: `https://focus.workinglocal.be/api/state` |
| Kiosk-tunnel niet bereikbaar | `net start cloudflared` op het kiosk-apparaat |
| State verloren na herstart | `session-state.json` ontbreekt of is beschadigd — reset de sessie |
| VPS deploy mislukt | Controleer de Docker build logs in Coolify |
