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
    $exocadAppPath = "C:\exocad-DentalCAD3.2-FR-2024-09-27\DentalCADApp\bin\DentalCADApp.exe" # Default correct version
    
    if (Test-Path -LiteralPath $configFile) {
        $config = Get-Content $configFile | ConvertFrom-Json
        if ($config.googleDrivePath) {
            $driveRoot = $config.googleDrivePath
        }
        if ($config.exocadAppPath) {
            $exocadAppPath = $config.exocadAppPath
        }
    }
    "[$timestamp] Using Google Drive path: $driveRoot" | Out-File $logFile -Append

    # Parse URL
    # Format: am-clinica-exocad://open?patientFolder=APELLIDO%2C%20Nombre&path=relative/path/file.project
    # Note: Browsers normalize custom protocols by adding a trailing slash after host: am-clinica-exocad://open/?...
    if ($Url -match "am-clinica-exocad://open/?\?(.*)") {
        $queryString = $Matches[1]
        
        # Parse query parameters
        $params = @{}
        $queryString.Split('&') | ForEach-Object {
            $kv = $_.Split('=')
            if ($kv.Length -eq 2) {
                $key = [uri]::UnescapeDataString($kv[0].Replace("+", "%20"))
                $value = [uri]::UnescapeDataString($kv[1].Replace("+", "%20"))
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
        
        if (Test-Path -LiteralPath $fullPath) {
            "[$timestamp] Opening: $fullPath" | Out-File $logFile -Append
            
            # Check if we are opening an Exocad file
            $isExocadFile = ($fullPath.EndsWith(".project") -or $fullPath.EndsWith(".dentalProject") -or $fullPath.EndsWith(".dentalproject"))
            
            if ($isExocadFile) {
                if (Test-Path -LiteralPath $exocadAppPath) {
                    $exocadBinDir = Split-Path $exocadAppPath
                    "[$timestamp] Launching Exocad directly: $exocadAppPath with project: $fullPath" | Out-File $logFile -Append
                    Start-Process -FilePath $exocadAppPath -ArgumentList "`"$fullPath`"" -WorkingDirectory $exocadBinDir
                } else {
                    # Fallback to default association
                    "[$timestamp] Exocad executable not found at $exocadAppPath. Falling back to default Windows association." | Out-File $logFile -Append
                    Start-Process $fullPath
                }
            } else {
                # Standard folder/file opening
                Start-Process $fullPath
            }
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
                if (Test-Path -LiteralPath $alt) {
                    "[$timestamp] Opening alternative path..." | Out-File $logFile -Append
                    
                    # Check if we are opening an Exocad file for alternatives
                    $isExocadFile = ($alt.EndsWith(".project") -or $alt.EndsWith(".dentalProject") -or $alt.EndsWith(".dentalproject"))
                    
                    if ($isExocadFile -and (Test-Path -LiteralPath $exocadAppPath)) {
                        $exocadBinDir = Split-Path $exocadAppPath
                        Start-Process -FilePath $exocadAppPath -ArgumentList "`"$alt`"" -WorkingDirectory $exocadBinDir
                    } else {
                        Start-Process $alt
                    }
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
