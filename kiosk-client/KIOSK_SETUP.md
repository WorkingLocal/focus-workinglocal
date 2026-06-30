# Focus Kiosk — Hardware Setup (KIOSK-TOUCH)

## Apparaat

| | |
|---|---|
| **Model** | Mele Quieter 3 |
| **Hostname** | KIOSK-TOUCH |
| **IP lokaal** | 192.168.111.34 → te migreren naar .120 |
| **Tailscale IP** | 100.72.174.92 |
| **MAC** | 68:4E:05:84:94:95 |
| **OS** | Windows 10 IoT Enterprise LTSC 21H2 (Build 19044.7417) |
| **Serial** | 8ICC4F315P290349 |
| **CPU** | Intel Celeron N5105 @ 2.00GHz |
| **RAM** | 8GB |
| **Storage** | 477GB NVMe WDC + 115GB Generic |
| **NetBox** | Device ID 49 |

## Credentials

Vaultwarden → **Homelab - Infrastructure → KIOSK-TOUCH**

- Username: `Working Local Kiosk` / `Administrator`
- Password: in Vaultwarden
- RDP: `rdp://192.168.111.34` (poort 3389)
- SSH: `ssh Administrator@100.72.174.92` (poort 22)
- WinRM: poort 5985

## Geïnstalleerde services

| Service | Poort | Status |
|---------|-------|--------|
| RDP (TermService) | 3389 | ✅ |
| WinRM | 5985 | ✅ |
| OpenSSH Server (sshd) | 22 | ✅ |
| Tailscale | — | ✅ 100.72.174.92 |
| windows_exporter | 9182 | ✅ Prometheus scrapet |

## Setup stappen (uitgevoerd 2026-06-13)

### Stap 1 — WinRM + firewall (via RDP)

```powershell
Enable-PSRemoting -Force -SkipNetworkProfileCheck
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
New-NetFirewallRule -Name "WinRM-HTTP-5985" -DisplayName "WinRM HTTP" -Protocol TCP -LocalPort 5985 -Action Allow
Enable-NetFirewallRule -Name "FPS-ICMP4-ERQ-In" -ErrorAction SilentlyContinue
```

### Stap 2 — Tailscale

```powershell
# Download + installeer
$installer = "$env:TEMP\tailscale-setup.exe"
Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe" -OutFile $installer -UseBasicParsing
Start-Process $installer -ArgumentList "/S" -Wait
# Delayed start instellen
sc.exe config Tailscale start= delayed-auto
# Inloggen
& "C:\Program Files\Tailscale\tailscale.exe" up
```

### Stap 3 — OpenSSH Server

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
New-NetFirewallRule -Name "OpenSSH-Server" -DisplayName "OpenSSH Server" -Protocol TCP -LocalPort 22 -Action Allow
# PasswordAuthentication inschakelen
$config = "C:\ProgramData\ssh\sshd_config"
(Get-Content $config) -replace '#PasswordAuthentication yes', 'PasswordAuthentication yes' | Set-Content $config
Restart-Service sshd
```

### Stap 4 — windows_exporter (Prometheus monitoring)

```powershell
$msi = "$env:TEMP\windows_exporter.msi"
Invoke-WebRequest -Uri "https://github.com/prometheus-community/windows_exporter/releases/download/v0.30.4/windows_exporter-0.30.4-amd64.msi" -OutFile $msi -UseBasicParsing
Start-Process msiexec -ArgumentList "/i `"$msi`" ENABLED_COLLECTORS=cpu,cs,logical_disk,memory,net,os,service,thermalzone /quiet" -Wait
New-NetFirewallRule -Name "windows-exporter-9182" -DisplayName "Prometheus windows_exporter" -Protocol TCP -LocalPort 9182 -Action Allow -Direction Inbound
```

Thermalzone output: `windows_thermalzone_temperature_celsius{name="\\_TZ.TZ00"}` ✅

### Stap 5 — Chromium kiosk (✅ voltooid 2026-06-30)

⚠️ **Belangrijk:** het ingebouwde `Administrator`-account is **disabled** op deze machine. Alle auto-login/beheer gebeurt via het lokale account `Working Local Kiosk` (zie Credentials hierboven — dit is ook de oorzaak van een eerdere SSH "connection reset": authenticeren tegen een disabled account laat Windows OpenSSH de verbinding resetten i.p.v. netjes "Permission denied" geven).

```powershell
# Chrome pad detecteren
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"  # of (x86) variant

# Auto-login instellen
$regPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty $regPath "AutoAdminLogon" "1"
Set-ItemProperty $regPath "DefaultUserName" "Working Local Kiosk"
Set-ItemProperty $regPath "DefaultPassword" "<wachtwoord uit Vaultwarden>"
Set-ItemProperty $regPath "DefaultDomainName" $env:COMPUTERNAME

# Scheduled Task: Chromium kiosk bij login
$action = New-ScheduledTaskAction -Execute $chrome `
    -Argument "--kiosk https://focus.workinglocal.be --no-first-run --disable-infobars --noerrdialogs"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "Working Local Kiosk"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName "FocusKiosk" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
```

**Uitgevoerd headless via WMI + SMB** (SSH/WinRM bleken niet bruikbaar vanaf een niet-elevated client zonder TrustedHosts-wijziging):
- `Invoke-WmiMethod -Class Win32_Process -Name Create` voor remote scriptexecutie
- `New-PSDrive` naar `\\100.72.174.92\C$` voor file transfer + log uitlezen

**Geverifieerd:**
| Setting | Waarde |
|---|---|
| AutoAdminLogon | 1 |
| DefaultUserName | Working Local Kiosk |
| FocusKiosk task state | Ready |
| Task args | `--kiosk https://focus.workinglocal.be --no-first-run --disable-infobars --noerrdialogs` |

Test bij volgende herstart: machine moet automatisch inloggen en Chrome in kiosk-mode openen op focus.workinglocal.be.

### Stap 6 — IP migreren in Unifi (⏳ nog te doen)

Unifi Network → Fixed IP Assignments:
- MAC `68:4E:05:84:94:95` → `.34` wijzigen naar `.120`
- Mele herstarten → krijgt 192.168.111.120

Na migratie: `prometheus.hostinglocal.yml` en `prometheus.yml` aanpassen:
```yaml
targets: ['192.168.111.120:9182']
```

## Monitoring (metrics-hostinglocal)

- **Prometheus job:** `kiosk-touch` → `192.168.111.34:9182` (tijdelijk, wordt .120)
- **Alert rules:** KioskTemperatureWarning/Critical, KioskHighCpu, KioskHighMemory, KioskDiskUsage
- **Grafana:** Host Temperatures dashboard → "KIOSK-TOUCH — CPU Temp" panel

## Focus Kiosk server

- URL: https://focus.workinglocal.be
- Server: PM2 process `focus-kiosk` op VPS-WORKINGLOCAL
- Repo: `focus-workinglocal/kiosk-server/`

## Status

| Stap | Status |
|------|--------|
| NetBox entry | ✅ Device 49 |
| Vaultwarden credentials | ✅ KIOSK-TOUCH |
| WinRM + firewall | ✅ |
| OpenSSH poort 22 | ✅ |
| Tailscale | ✅ 100.72.174.92 |
| windows_exporter + Prometheus | ✅ UP |
| Alert rules Grafana | ✅ |
| Chromium kiosk Scheduled Task | ✅ |
| IP migratie .34 → .120 | ⏳ |
| Grafana overview panel | ⏳ |
