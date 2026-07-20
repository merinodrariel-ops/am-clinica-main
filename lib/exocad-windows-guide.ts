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
        'Esta integración abre los proyectos de Exocad en una copia local protegida y, al cerrar Exocad, respalda y verifica los archivos modificados antes de devolverlos a Google Drive.',
    windowsOnly: true,
    humanSteps: [
        'Asegúrate de que la PC corre Windows y que tienes instalado Google Drive para Escritorio y Exocad.',
        'Descarga nuevamente los scripts "install-protocol.ps1" y "open-exocad.ps1" con los botones de esta pantalla y guárdalos juntos en una carpeta temporal.',
        'Haz clic derecho sobre "install-protocol.ps1" y selecciona "Ejecutar con PowerShell" en cada PC que use Exocad. No se necesitan permisos de Administrador.',
        'El instalador actualizará el lanzador local en "%USERPROFILE%\\.am-clinica-exocad\\open-exocad.ps1" y registrará el protocolo personalizado "am-clinica-exocad://".',
        'Si la ruta de Google Drive o el ejecutable de Exocad es diferente a las predeterminadas, edita el archivo de configuración "%USERPROFILE%\\.am-clinica-exocad\\exocad-config.json" que se crea automáticamente.',
        'Cierra cualquier instancia de Exocad que ya esté abierta, entra a la pestaña de un paciente y haz clic en "Diseñar en Exocad".',
        'Al terminar, guarda y cierra Exocad. Espera el mensaje "Proyecto guardado correctamente" antes de apagar la PC o cerrar Google Drive.',
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
        '        localWorkspaceRoot = (Join-Path $env:LOCALAPPDATA "AMClinica\\ExocadWork")',
        '        backupRoot = (Join-Path $env:USERPROFILE ".am-clinica-exocad\\backups")',
        '        syncGraceSeconds = 10',
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
        'El lanzador 2.0 espera el cierre de Exocad, compara hashes SHA-256, respalda los originales, copia solamente los archivos modificados y vuelve a comprobarlos en la carpeta de Drive.',
        'No se usa CopyAndOpen.exe: el flujo controlado trabaja con una copia local completa del directorio del proyecto y evita editar directamente sobre la unidad virtual de Google Drive.',
        'Toda la configuración, los respaldos y los logs quedan en "%USERPROFILE%\\.am-clinica-exocad\\"; las copias de trabajo quedan en "%LOCALAPPDATA%\\AMClinica\\ExocadWork".',
    ],
};
