# Focus Kiosk — Hardware Setup (MELE)

## Apparaat

- **Model:** Mele Quieter mini PC (touchscreen)
- **Naam:** KIOSK-TOUCH-MELE
- **IP:** 192.168.111.34 → te migreren naar .120
- **MAC:** 68-4E-05-84-94-95
- **OS:** Windows (pre-installed)

## Setup stappen

### Stap 1 — WinRM inschakelen (eenmalig via RDP)

RDP naar `192.168.111.34`, open PowerShell als Administrator:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "\\192.168.111.40\C$\Temp\xibo-surface\bootstrap_mele.ps1"
```

Het bootstrap script doet:
- Hardware specs ophalen
- WinRM inschakelen (poort 5985)
- ICMP/ping toelaten
- Hostname instellen op `kiosk-touch-mele`
- Specs doorsturen naar `homelab_finance.hardware_inventory` op Windows Server

### Stap 2 — Tailscale installeren (na WinRM)

```powershell
$s = New-PSSession -ComputerName 192.168.111.34 -Credential (Get-Credential)
Invoke-Command -Session $s -ScriptBlock {
    winget install tailscale.tailscale --silent
    # Daarna: tailscale up in de Tailscale GUI
}
```

### Stap 3 — Chromium kiosk mode

```powershell
Invoke-Command -Session $s -ScriptBlock {
    # Auto-login instellen
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
    Set-ItemProperty $regPath "AutoAdminLogon" "1"
    Set-ItemProperty $regPath "DefaultUserName" "kiosk"
    Set-ItemProperty $regPath "DefaultPassword" "<wachtwoord>"

    # Scheduled Task: Chromium kiosk bij login
    $action = New-ScheduledTaskAction -Execute "chrome.exe" `
        -Argument "--kiosk https://focus.workinglocal.be --no-first-run --disable-infobars"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Register-ScheduledTask -TaskName "FocusKiosk" -Action $action -Trigger $trigger -RunLevel Highest -Force
}
```

### Stap 4 — IP migreren in Unifi

Unifi Network → Fixed IP Assignments:
- `.34` toewijzing verwijderen
- `.120` toewijzen aan MAC `68:4E:05:84:94:95`

### Stap 5 — Vaultwarden

Credentials toevoegen in Vaultwarden → folder "Homelab - Kiosks":
- "KIOSK-TOUCH-MELE — Windows login"
- "KIOSK-TOUCH-MELE — Tailscale" (na installatie)

## Focus Kiosk server

De Focus Kiosk server draait op VPS-WORKINGLOCAL:
- URL: https://focus.workinglocal.be
- Operator URL (met key): `https://focus.workinglocal.be/?key=<OPERATOR_SECRET>`
- Server: PM2 process `focus-kiosk` op de VPS
- Repo: `focus-workinglocal/kiosk-server/`

## Status

| Stap | Status |
|------|--------|
| NetBox entry | ✅ Device 49, IP .34 + .120 reserved |
| homelab_finance DB | ✅ Mele Quieter in expenses |
| bootstrap_mele.ps1 | ✅ Klaar (C:\Temp\xibo-surface\) |
| WinRM inschakelen | ⏳ Via RDP |
| Tailscale | ⏳ Na WinRM |
| Chromium kiosk | ⏳ Na WinRM |
| IP migratie .120 | ⏳ Unifi handmatig |
| Vaultwarden credentials | ⏳ Handmatig |
