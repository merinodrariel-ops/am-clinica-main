# Run this script as Administrator to register the protocol handler
Add-Type -AssemblyName PresentationFramework

# Check for Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    [System.Windows.MessageBox]::Show("Por favor, ejecuta este instalador como Administrador (clic derecho -> 'Ejecutar con PowerShell' en modo Administrador).", "Permisos requeridos", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
    exit
}

$setupDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$batPath = Join-Path $setupDir "open-exocad.bat"
$configFile = Join-Path $setupDir "exocad-config.json"

# Check if bat exists
if (-not (Test-Path $batPath)) {
    [System.Windows.MessageBox]::Show("No se encontró el archivo open-exocad.bat en $setupDir", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
    exit
}

# Create default configuration if it doesn't exist
if (-not (Test-Path $configFile)) {
    # Try to detect default paths
    $defaultDrive = "G:\Mi unidad"
    if (-not (Test-Path $defaultDrive)) {
        if (Test-Path "G:\My Drive") {
            $defaultDrive = "G:\My Drive"
        }
    }
    
    # Try to find a 'Pacientes' subfolder
    $detectedPath = $defaultDrive
    if (Test-Path (Join-Path $defaultDrive "Pacientes")) {
        $detectedPath = Join-Path $defaultDrive "Pacientes"
    }
    
    $configObj = @{
        googleDrivePath = $detectedPath
    }
    $configObj | ConvertTo-Json | Out-File $configFile
}

# Registry paths
$protocolName = "am-clinica-exocad"
$registryPath = "HKCR:\$protocolName"

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

    # For Windows registry command values, we escape quotes properly
    $commandValue = "`"$batPath`" `"%1`" "
    New-ItemProperty -Path $commandPath.PsPath -Name "(Default)" -Value $commandValue -PropertyType String -Force | Out-Null

    $msg = "¡Protocolo registrado con éxito!`n`nAhora la aplicación web de AM Clínica podrá abrir directamente archivos .project en Exocad.`n`nRuta configurada de Google Drive: $((Get-Content $configFile | ConvertFrom-Json).googleDrivePath)`n`nSi necesitas cambiar esta ruta, edita el archivo:`n$configFile"
    [System.Windows.MessageBox]::Show($msg, "Registro Exitoso", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
} catch {
    [System.Windows.MessageBox]::Show("Error al registrar el protocolo: $_", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
}
