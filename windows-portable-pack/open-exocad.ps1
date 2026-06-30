param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ProtocolUrlParts
)

$ErrorActionPreference = "Stop"

function Get-DecodedQueryParam {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $pattern = "(?:[?&])$([regex]::Escape($Name))=([^&]+)"
    $match = [regex]::Match($Url, $pattern)
    if (-not $match.Success) {
        return $null
    }

    $encodedValue = $match.Groups[1].Value.Replace("+", " ")
    return [System.Uri]::UnescapeDataString($encodedValue)
}

$protocolUrl = ($ProtocolUrlParts -join " ").Trim('"')
if ([string]::IsNullOrWhiteSpace($protocolUrl)) {
    throw "Falta la URL del protocolo am-clinica-exocad://open/."
}

$configPath = Join-Path $PSScriptRoot "exocad-config.json"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "No existe exocad-config.json. Copiar exocad-config.example.json y completar las rutas."
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$googleDrivePath = [string]$config.googleDrivePath
$exocadAppPath = [string]$config.exocadAppPath

if ([string]::IsNullOrWhiteSpace($googleDrivePath)) {
    throw "Falta googleDrivePath en exocad-config.json."
}

if ([string]::IsNullOrWhiteSpace($exocadAppPath)) {
    throw "Falta exocadAppPath en exocad-config.json."
}

if (-not (Test-Path -LiteralPath $googleDrivePath)) {
    throw "No existe googleDrivePath: $googleDrivePath"
}

if (-not (Test-Path -LiteralPath $exocadAppPath)) {
    throw "No existe exocadAppPath: $exocadAppPath"
}

$patientFolder = Get-DecodedQueryParam -Url $protocolUrl -Name "patientFolder"
$projectPath = Get-DecodedQueryParam -Url $protocolUrl -Name "path"

if ([string]::IsNullOrWhiteSpace($projectPath)) {
    throw "La URL del protocolo no incluye el parametro path."
}

$projectPath = $projectPath -replace '^[\\/]+', ''
$sourceRoot = $googleDrivePath

if (-not [string]::IsNullOrWhiteSpace($patientFolder)) {
    $sourceRoot = Join-Path $sourceRoot $patientFolder
}

$projectFullPath = Join-Path $sourceRoot $projectPath

if (-not (Test-Path -LiteralPath $projectFullPath)) {
    throw "No se encontro el proyecto Exocad: $projectFullPath"
}

$projectItem = Get-Item -LiteralPath $projectFullPath
$appItem = Get-Item -LiteralPath $exocadAppPath
$workingDirectory = $appItem.DirectoryName

Start-Process `
    -FilePath $appItem.FullName `
    -ArgumentList @($projectItem.FullName) `
    -WorkingDirectory $workingDirectory
