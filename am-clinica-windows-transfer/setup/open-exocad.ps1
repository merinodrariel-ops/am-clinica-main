param(
    [string]$Url
)

# Load PresentationFramework for MessageBox
Add-Type -AssemblyName PresentationFramework

$setupDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$configFile = Join-Path $setupDir "exocad-config.json"
$logFile = Join-Path $setupDir "exocad-opener.log"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Received URL: $Url" | Out-File $logFile -Append

try {
    # Load configuration
    $driveRoot = "G:\Mi unidad" # Default fallback
    if (Test-Path $configFile) {
        $config = Get-Content $configFile | ConvertFrom-Json
        if ($config.googleDrivePath) {
            $driveRoot = $config.googleDrivePath
        }
    }
    "[$timestamp] Using Google Drive path: $driveRoot" | Out-File $logFile -Append

    # Parse URL
    # Format: am-clinica-exocad://open?patientFolder=APELLIDO%2C%20Nombre&path=relative/path/file.project
    if ($Url -match "am-clinica-exocad://open\?(.*)") {
        $queryString = $Matches[1]
        
        # Parse query parameters
        $params = @{}
        $queryString.Split('&') | ForEach-Object {
            $kv = $_.Split('=')
            if ($kv.Length -eq 2) {
                $key = [uri]::UnescapeDataString($kv[0])
                $value = [uri]::UnescapeDataString($kv[1])
                $params[$key] = $value
            }
        }
        
        $patientFolder = $params["patientFolder"]
        $relativePath = $params["path"]
        
        if ($null -eq $patientFolder) {
            throw "Falta el parámetro obligatorio 'patientFolder' en la URL."
        }
        
        # Replace forward slashes with backslashes
        if ($null -ne $relativePath) {
            $relativePath = $relativePath.Replace("/", "\")
        }
        
        # Construct absolute path
        # If relativePath is empty, we just open the patient folder!
        $fullPath = Join-Path $driveRoot $patientFolder
        if ($null -ne $relativePath -and $relativePath -ne "") {
            $fullPath = Join-Path $fullPath $relativePath
        }
        
        "[$timestamp] Target file/folder path: $fullPath" | Out-File $logFile -Append
        
        if (Test-Path $fullPath) {
            "[$timestamp] Opening: $fullPath" | Out-File $logFile -Append
            # Start-Process will launch the default associated application
            Start-Process $fullPath
        } else {
            # Let's try some path variations just in case
            # e.g., if driveRoot is just "G:\" or doesn't have "Pacientes" but config has it, etc.
            $alternatives = @()
            if ($null -ne $relativePath -and $relativePath -ne "") {
                # If they didn't include the 'Pacientes' folder in configuration
                $alternatives += Join-Path $driveRoot (Join-Path "Pacientes" (Join-Path $patientFolder $relativePath))
                $alternatives += Join-Path $driveRoot (Join-Path "Pacientes - AM Clinica" (Join-Path $patientFolder $relativePath))
            } else {
                $alternatives += Join-Path $driveRoot (Join-Path "Pacientes" $patientFolder)
                $alternatives += Join-Path $driveRoot (Join-Path "Pacientes - AM Clinica" $patientFolder)
            }
            
            $found = $false
            foreach ($alt in $alternatives) {
                "[$timestamp] Checking alternative path: $alt" | Out-File $logFile -Append
                if (Test-Path $alt) {
                    "[$timestamp] Opening alternative path..." | Out-File $logFile -Append
                    Start-Process $alt
                    $found = $true
                    break
                }
            }
            
            if (-not $found) {
                $msg = "No se pudo encontrar el archivo o carpeta en la ruta local de Google Drive:`n`n$fullPath`n`nAsegúrate de que Google Drive para Escritorio esté activo y sincronizado. Puedes editar la ruta local en:`n$configFile"
                [System.Windows.MessageBox]::Show($msg, "AM Clínica - Enlace Local", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
            }
        }
    } else {
        throw "Formato de URL no válido: $Url"
    }
} catch {
    $msg = "Error al intentar abrir el archivo local:`n`n$_"
    "[$timestamp] Error: $_" | Out-File $logFile -Append
    [System.Windows.MessageBox]::Show($msg, "AM Clínica - Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
}
