# Custom protocol registration for current user (does NOT require Admin rights)
Add-Type -AssemblyName PresentationFramework

$setupDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$sourceScript = Join-Path $setupDir "open-exocad.ps1"

# Target persistent directory in user profile (doesn't need admin rights)
$targetDir = Join-Path $env:USERPROFILE ".am-clinica-exocad"
$targetScript = Join-Path $targetDir "open-exocad.ps1"
$configFile = Join-Path $targetDir "exocad-config.json"

# Check if open-exocad.ps1 exists in the same folder as this installer
if (-not (Test-Path $sourceScript)) {
    [System.Windows.MessageBox]::Show("No se encontró el archivo open-exocad.ps1 en $setupDir. Por favor, asegúrate de que ambos archivos estén en la misma carpeta.", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
    exit
}

# Create target directory if it doesn't exist
if (-not (Test-Path $targetDir)) {
    New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
}

# Copy script to target directory
Copy-Item -Path $sourceScript -Destination $targetScript -Force | Out-Null

# Create default configuration if it doesn't exist in target directory
if (-not (Test-Path $configFile)) {
    # Try to detect default paths
    $defaultDrive = "G:\Mi unidad"
    if (-not (Test-Path $defaultDrive)) {
        if (Test-Path "G:\My Drive") {
            $defaultDrive = "G:\My Drive"
        }
    }
    
    # Try to find a 'Pacientes' or 'PACIENTES' subfolder
    $detectedPath = $defaultDrive
    if (Test-Path (Join-Path $defaultDrive "PACIENTES")) {
        $detectedPath = Join-Path $defaultDrive "PACIENTES"
    } elseif (Test-Path (Join-Path $defaultDrive "Pacientes")) {
        $detectedPath = Join-Path $defaultDrive "Pacientes"
    }
    
    $configObj = @{
        googleDrivePath = $detectedPath
        exocadAppPath = "C:\exocad-DentalCAD3.2-FR-2024-09-27\DentalCADApp\bin\DentalCADApp.exe"
    }
    $configObj | ConvertTo-Json | Out-File $configFile
}

# Registry paths under HKEY_CURRENT_USER\Software\Classes
$protocolName = "am-clinica-exocad"
$registryPath = "HKCU:\Software\Classes\$protocolName"

try {
    # Remove existing key if any
    if (Test-Path $registryPath) {
        Remove-Item -Path $registryPath -Recurse -Force
    }

    # Create keys
    New-Item -Path $registryPath -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name "(Default)" -Value "URL:AM Clinica Exocad Protocol" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

    $shellPath = New-Item -Path (Join-Path $registryPath "shell") -Force
    $openPath = New-Item -Path (Join-Path $shellPath "open") -Force
    $commandPath = New-Item -Path (Join-Path $openPath "command") -Force

    # Format the command value pointing to the persistent copy of open-exocad.ps1
    $psPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    $commandValue = "`"$psPath`" -NoProfile -ExecutionPolicy Bypass -File `"$targetScript`" `"%1`""
    New-ItemProperty -Path $commandPath.PsPath -Name "(Default)" -Value $commandValue -PropertyType String -Force | Out-Null

    $msg = "¡Protocolo registrado con éxito!`n`nEl script se ha instalado en: $targetScript`n`nAhora la aplicación web de AM Clínica podrá abrir directamente archivos .project en Exocad.`n`nRuta configurada de Google Drive: $((Get-Content $configFile | ConvertFrom-Json).googleDrivePath)`n`nSi necesitas cambiar esta ruta, edita el archivo:`n$configFile"
    [System.Windows.MessageBox]::Show($msg, "Registro Exitoso", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
} catch {
    [System.Windows.MessageBox]::Show("Error al registrar el protocolo: $_", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
}
