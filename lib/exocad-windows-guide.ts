export interface ExocadWindowsGuide {
    title: string;
    summary: string;
    windowsOnly: boolean;
    humanSteps: string[];
    agentPrompt: string[];
    technicalNotes: string[];
}

export const EXOCAD_WINDOWS_GUIDE: ExocadWindowsGuide = {
    title: 'Apertura Directa de Exocad',
    summary:
        'Esta integración te permite abrir carpetas locales de pacientes y lanzar proyectos de Exocad (.project, .projects, .dentalproject) con un solo clic directamente desde la aplicación web online.',
    windowsOnly: true,
    humanSteps: [
        'Asegúrate de que la PC corre Windows y que tienes instalado Google Drive para Escritorio y Exocad.',
        'Copia los scripts "install-protocol.ps1" y "open-exocad.ps1" desde la wiki de tu Obsidian (carpeta "05 - Hermes-Agentes") a una ubicación temporal en tu computadora.',
        'Haz clic derecho sobre "install-protocol.ps1" y selecciona "Ejecutar con PowerShell". No se necesitan permisos de Administrador.',
        'El instalador copiará el script local en una ubicación fija del usuario ("%USERPROFILE%\\.am-clinica-exocad\\open-exocad.ps1") y registrará el protocolo personalizado "am-clinica-exocad://".',
        'Si la ruta de Google Drive o el ejecutable de Exocad es diferente a las predeterminadas, edita el archivo de configuración "%USERPROFILE%\\.am-clinica-exocad\\exocad-config.json" que se crea automáticamente.',
        'Prueba el funcionamiento abriendo la aplicación online, entrando a la pestaña de un paciente y haciendo clic en "Carpeta Local" o "Diseñar en Exocad".',
    ],
    agentPrompt: [
        'Objetivo: Instalar de forma no interactiva el protocolo personalizado "am-clinica-exocad://" en una PC Windows.',
        'Para registrar el protocolo de forma programática (sin diálogos de interfaz de usuario que dejen colgada la consola), ejecuta el siguiente comando en PowerShell:',
        '',
        '# 1. Definir rutas en el perfil de usuario local',
        '$targetDir = Join-Path $env:USERPROFILE ".am-clinica-exocad"',
        '$targetScript = Join-Path $targetDir "open-exocad.ps1"',
        '$configFile = Join-Path $targetDir "exocad-config.json"',
        '',
        '# 2. Crear el directorio de instalación si no existe',
        'if (-not (Test-Path $targetDir)) { New-Item -Path $targetDir -ItemType Directory -Force | Out-Null }',
        '',
        '# 3. Copiar el script open-exocad.ps1 desde el origen',
        '# (Asegúrate de tener el archivo open-exocad.ps1 y copiarlo a $targetScript)',
        '# Copy-Item -Path "ruta/a/open-exocad.ps1" -Destination $targetScript -Force',
        '',
        '# 4. Crear configuración por defecto',
        'if (-not (Test-Path $configFile)) {',
        '    $configJson = @{',
        '        googleDrivePath = "G:\\Mi unidad\\PACIENTES"',
        '        exocadAppPath = "C:\\exocad-DentalCAD3.2-FR-2024-09-27\\DentalCADApp\\bin\\DentalCADApp.exe"',
        '    } | ConvertTo-Json',
        '    $configJson | Out-File $configFile -Encoding utf8',
        '}',
        '',
        '# 5. Escribir las claves de registro del protocolo (HKCU - No requiere Admin)',
        '$regPath = "HKCU:\\Software\Classes\\am-clinica-exocad"',
        'if (Test-Path $regPath) { Remove-Item -Path $regPath -Recurse -Force }',
        'New-Item -Path $regPath -Force | Out-Null',
        'New-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:AM Clinica Exocad Protocol" -PropertyType String -Force | Out-Null',
        'New-ItemProperty -Path $regPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null',
        '$cmdPath = New-Item -Path "$regPath\\shell\\open\\command" -Force',
        '$psPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
        '$commandValue = "`"$psPath`" -NoProfile -ExecutionPolicy Bypass -File `"$targetScript`" `"%1`""',
        'New-ItemProperty -Path $cmdPath.PsPath -Name "(Default)" -Value $commandValue -PropertyType String -Force | Out-Null',
    ],
    technicalNotes: [
        'El protocolo invocado es "am-clinica-exocad://open?patientFolder=[nombre]&path=[ruta]".',
        'El script se ejecuta a través de powershell.exe bypasseando la política de ejecución local del proceso actual.',
        'Exocad requiere iniciarse en su directorio de trabajo "bin" correspondiente para poder cargar las DLLs del emulador de dongle; de lo contrario, pedirá dongle física. El script maneja esto iniciando con el parámetro -WorkingDirectory.',
        'Toda la configuración y los logs residen localmente en "%USERPROFILE%\\.am-clinica-exocad\\".',
    ],
};
