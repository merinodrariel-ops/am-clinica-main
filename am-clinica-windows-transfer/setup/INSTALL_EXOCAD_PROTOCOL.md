# Local Exocad Protocol Installer Instructions for AI Agents

This directory contains scripts to register the `am-clinica-exocad://` custom URL protocol in Windows, allowing the web app (both local and online production versions) to open Exocad projects directly.

## How the User Registers the Protocol (Interactive Setup)
The user can copy this folder to any PC, right-click `install-protocol.ps1` and select "Ejecutar con PowerShell" (does NOT require Admin rights).
The installer will:
1. Copy the opener script to a persistent folder: `C:\Users\<user>\.am-clinica-exocad\open-exocad.ps1`
2. Automatically create `exocad-config.json` inside that same folder.
3. Configure the protocol handler in Windows to point to the persistent script.

## How to Register the Protocol Programmatically (Non-Interactive Shells for Agents)
If you are an AI agent running in a terminal, **do not run `install-protocol.ps1` directly** as it calls UI Message Boxes which will hang your non-interactive shell.

Instead, execute the following PowerShell commands to install the files to the user profile and register the registry keys directly:

```powershell
# 1. Define paths (no Admin rights required)
$targetDir = Join-Path $env:USERPROFILE ".am-clinica-exocad"
$targetScript = Join-Path $targetDir "open-exocad.ps1"
$configFile = Join-Path $targetDir "exocad-config.json"

# 2. Create directory and copy opener script from the source directory
if (-not (Test-Path $targetDir)) { New-Item -Path $targetDir -ItemType Directory -Force | Out-Null }
# Replace $sourceScriptPath with the path to the source open-exocad.ps1
$sourceScriptPath = "path/to/source/open-exocad.ps1" 
Copy-Item -Path $sourceScriptPath -Destination $targetScript -Force | Out-Null

# 3. Create default exocad-config.json if not present
if (-not (Test-Path $configFile)) {
    $configJson = @{
        googleDrivePath = "G:\Mi unidad\PACIENTES"
        exocadAppPath = "C:\exocad-DentalCAD3.2-FR-2024-09-27\DentalCADApp\bin\DentalCADApp.exe"
    } | ConvertTo-Json
    $configJson | Out-File $configFile -Encoding utf8
}

# 4. Register protocol in User Hive (HKCU)
$regPath = "HKCU:\Software\Classes\am-clinica-exocad"
if (Test-Path $regPath) { Remove-Item -Path $regPath -Recurse -Force }
New-Item -Path $regPath -Force | Out-Null
New-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:AM Clinica Exocad Protocol" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

$cmdPath = New-Item -Path "$regPath\shell\open\command" -Force
$psPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$commandValue = "`"$psPath`" -NoProfile -ExecutionPolicy Bypass -File `"$targetScript`" `"%1`""
New-ItemProperty -Path $cmdPath.PsPath -Name "(Default)" -Value $commandValue -PropertyType String -Force | Out-Null
```

## How to Customize Paths (After Setup)
If the local Google Drive path or Exocad executable directory is different, edit the configuration file:
`C:\Users\<user>\.am-clinica-exocad\exocad-config.json`

