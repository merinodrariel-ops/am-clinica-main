$ErrorActionPreference = "Stop"

$handlerPath = Join-Path $PSScriptRoot "open-exocad.ps1"
if (-not (Test-Path -LiteralPath $handlerPath)) {
    throw "No se encontro open-exocad.ps1 en $PSScriptRoot"
}

$protocolRoot = "HKCU:\Software\Classes\am-clinica-exocad"
$commandKey = Join-Path $protocolRoot "shell\open\command"
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$handlerPath`" `"%1`""

New-Item -Path $protocolRoot -Force | Out-Null
New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
Set-Item -Path $protocolRoot -Value "URL:AM Clinica Exocad Protocol"

New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $commandKey -Value $command

Write-Host "Protocolo am-clinica-exocad registrado correctamente."
Write-Host "Handler: $handlerPath"
