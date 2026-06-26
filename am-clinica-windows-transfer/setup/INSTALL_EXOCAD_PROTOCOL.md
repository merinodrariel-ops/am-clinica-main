# Local Exocad Protocol Installer Instructions for AI Agents

This directory contains scripts to register the `am-clinica-exocad://` custom URL protocol in Windows, allowing the web app to open Exocad projects directly.

## How to Register the Protocol Programmatically (Non-Interactive Shells)
If you are an AI agent running in a terminal, **do not run `install-protocol.ps1` directly** as it calls `[System.Windows.MessageBox]::Show`, which will hang your non-interactive terminal session.

Instead, execute the following PowerShell command block to write the registry keys directly to the current user hive (which does not require Administrator rights):

```powershell
$regPath = "HKCU:\Software\Classes\am-clinica-exocad"
if (Test-Path $regPath) { Remove-Item -Path $regPath -Recurse -Force }
New-Item -Path $regPath -Force | Out-Null
New-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:AM Clinica Exocad Protocol" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

$cmdPath = New-Item -Path "$regPath\shell\open\command" -Force
$psPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
# Replace workspace root placeholder with the actual absolute path to open-exocad.ps1
$scriptPath = "C:\Users\drari\Documents\Proyectos IA\Main App\am-clinica-windows-transfer\setup\open-exocad.ps1"
$commandValue = "`"$psPath`" -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" `"%1`""
New-ItemProperty -Path $cmdPath.PsPath -Name "(Default)" -Value $commandValue -PropertyType String -Force | Out-Null
```

Additionally, make sure to create `exocad-config.json` in the same directory:
```json
{
  "googleDrivePath": "G:\\Mi unidad\\PACIENTES",
  "exocadAppPath": "C:\\exocad-DentalCAD3.2-FR-2024-09-27\\DentalCADApp\\bin\\DentalCADApp.exe"
}
```

## How the User Registers the Protocol (Interactive Shells)
The user can simply right-click `install-protocol.ps1` and select "Ejecutar con PowerShell". Since it uses `HKCU`, it does not require Administrator rights. It will automatically detect their Google Drive mount point, write the registry entries, write the default configuration, and show a confirmation popup.
