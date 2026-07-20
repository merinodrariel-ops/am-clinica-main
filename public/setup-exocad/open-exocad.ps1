param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$ProtocolUrlParts
)

$ErrorActionPreference = "Stop"
$LauncherVersion = "2.0.0"

Add-Type -AssemblyName PresentationFramework

$setupDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$configFile = Join-Path $setupDir "exocad-config.json"
$logFile = Join-Path $setupDir "exocad-opener.log"
$defaultWorkRoot = Join-Path $env:LOCALAPPDATA "AMClinica\ExocadWork"
$defaultBackupRoot = Join-Path $env:USERPROFILE ".am-clinica-exocad\backups"

function Write-LauncherLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] [v$LauncherVersion] $Message" | Out-File -LiteralPath $logFile -Append -Encoding utf8
}

function Show-LauncherMessage {
    param(
        [string]$Message,
        [string]$Title = "AM Clínica - Exocad",
        [System.Windows.MessageBoxImage]$Icon = [System.Windows.MessageBoxImage]::Information
    )
    [System.Windows.MessageBox]::Show($Message, $Title, [System.Windows.MessageBoxButton]::OK, $Icon) | Out-Null
}

function Get-DecodedQueryParam {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $pattern = "(?:[?&])$([regex]::Escape($Name))=([^&]*)"
    $match = [regex]::Match($Url, $pattern)
    if (-not $match.Success) {
        return $null
    }

    $encodedValue = $match.Groups[1].Value.Replace("+", " ")
    return [System.Uri]::UnescapeDataString($encodedValue)
}

function Assert-PathInsideRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    if (-not $candidateFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "La ruta solicitada está fuera de la carpeta configurada de Google Drive."
    }
    return $candidateFull
}

function Get-ProjectManifest {
    param([Parameter(Mandatory = $true)][string]$Root)

    $manifest = @{}
    if (-not (Test-Path -LiteralPath $Root)) {
        return $manifest
    }

    Get-ChildItem -LiteralPath $Root -File -Recurse -Force | ForEach-Object {
        $relativePath = $_.FullName.Substring($Root.Length).TrimStart('\')
        $manifest[$relativePath] = @{
            Length = $_.Length
            Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
    return $manifest
}

function Get-ChangedProjectFiles {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Before,
        [Parameter(Mandatory = $true)][hashtable]$After
    )

    $changed = New-Object System.Collections.Generic.List[string]
    foreach ($relativePath in $After.Keys) {
        if (-not $Before.ContainsKey($relativePath) -or $Before[$relativePath].Hash -ne $After[$relativePath].Hash) {
            $changed.Add($relativePath)
        }
    }
    return $changed
}

function Get-DeletedProjectFiles {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Before,
        [Parameter(Mandatory = $true)][hashtable]$After
    )

    $deleted = New-Object System.Collections.Generic.List[string]
    foreach ($relativePath in $Before.Keys) {
        if (-not $After.ContainsKey($relativePath)) {
            $deleted.Add($relativePath)
        }
    }
    return $deleted
}

function Copy-ProjectTree {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -Path $Destination -ItemType Directory -Force | Out-Null
    $robocopy = Get-Command robocopy.exe -ErrorAction SilentlyContinue
    if ($robocopy) {
        & $robocopy.Source $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) {
            throw "No se pudo preparar la copia local del proyecto (Robocopy: $LASTEXITCODE)."
        }
        return
    }

    Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
}

function Save-ChangedFilesToDrive {
    param(
        [Parameter(Mandatory = $true)][string]$LocalRoot,
        [Parameter(Mandatory = $true)][string]$DriveRoot,
        [Parameter(Mandatory = $true)][hashtable]$OriginalDriveManifest,
        [Parameter(Mandatory = $true)][string[]]$ChangedFiles,
        [Parameter(Mandatory = $true)][string[]]$DeletedFiles,
        [Parameter(Mandatory = $true)][string]$BackupRoot
    )

    $conflicts = New-Object System.Collections.Generic.List[string]
    $verified = New-Object System.Collections.Generic.List[string]

    foreach ($relativePath in $ChangedFiles) {
        $localFile = Join-Path $LocalRoot $relativePath
        $driveFile = Join-Path $DriveRoot $relativePath
        $driveParent = Split-Path -Parent $driveFile
        $backupFile = Join-Path $BackupRoot $relativePath

        $driveChangedWhileEditing = $false
        if (Test-Path -LiteralPath $driveFile) {
            $currentDriveHash = (Get-FileHash -LiteralPath $driveFile -Algorithm SHA256).Hash
            if (-not $OriginalDriveManifest.ContainsKey($relativePath) -or $OriginalDriveManifest[$relativePath].Hash -ne $currentDriveHash) {
                $driveChangedWhileEditing = $true
            }
        } elseif ($OriginalDriveManifest.ContainsKey($relativePath)) {
            $driveChangedWhileEditing = $true
        }

        if ($driveChangedWhileEditing) {
            $conflicts.Add($relativePath)
            Write-LauncherLog "CONFLICT: Drive changed while Exocad was open: $relativePath"
            continue
        }

        if (Test-Path -LiteralPath $driveFile) {
            New-Item -Path (Split-Path -Parent $backupFile) -ItemType Directory -Force | Out-Null
            Copy-Item -LiteralPath $driveFile -Destination $backupFile -Force
        }

        New-Item -Path $driveParent -ItemType Directory -Force | Out-Null
        Copy-Item -LiteralPath $localFile -Destination $driveFile -Force

        $localHash = (Get-FileHash -LiteralPath $localFile -Algorithm SHA256).Hash
        $driveHash = (Get-FileHash -LiteralPath $driveFile -Algorithm SHA256).Hash
        if ($localHash -ne $driveHash) {
            throw "La verificación falló al copiar $relativePath a Google Drive."
        }
        $verified.Add($relativePath)
        Write-LauncherLog "VERIFIED: $relativePath"
    }

    foreach ($relativePath in $DeletedFiles) {
        $driveFile = Join-Path $DriveRoot $relativePath
        if (-not (Test-Path -LiteralPath $driveFile)) {
            continue
        }

        $currentDriveHash = (Get-FileHash -LiteralPath $driveFile -Algorithm SHA256).Hash
        if (-not $OriginalDriveManifest.ContainsKey($relativePath) -or $OriginalDriveManifest[$relativePath].Hash -ne $currentDriveHash) {
            $conflicts.Add($relativePath)
            Write-LauncherLog "CONFLICT: Drive changed before local deletion could be applied: $relativePath"
            continue
        }

        $backupFile = Join-Path $BackupRoot $relativePath
        New-Item -Path (Split-Path -Parent $backupFile) -ItemType Directory -Force | Out-Null
        Copy-Item -LiteralPath $driveFile -Destination $backupFile -Force
        Remove-Item -LiteralPath $driveFile -Force
        if (Test-Path -LiteralPath $driveFile) {
            throw "No se pudo verificar la eliminación de $relativePath en Google Drive."
        }
        Write-LauncherLog "VERIFIED DELETION: $relativePath"
    }

    return @{
        Conflicts = $conflicts
        Verified = $verified
    }
}

try {
    $protocolUrl = ($ProtocolUrlParts -join " ").Trim('"')
    if ([string]::IsNullOrWhiteSpace($protocolUrl)) {
        throw "Falta la URL del protocolo am-clinica-exocad://open/."
    }
    Write-LauncherLog "Received URL: $protocolUrl"

    $driveRoot = "G:\Mi unidad"
    $exocadAppPath = "C:\exocad-DentalCAD3.2-FR-2024-09-27\DentalCADApp\bin\DentalCADApp.exe"
    $workRoot = $defaultWorkRoot
    $backupRoot = $defaultBackupRoot
    $syncGraceSeconds = 10

    if (Test-Path -LiteralPath $configFile) {
        $config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
        if ($config.googleDrivePath) { $driveRoot = [string]$config.googleDrivePath }
        if ($config.exocadAppPath) { $exocadAppPath = [string]$config.exocadAppPath }
        if ($config.localWorkspaceRoot) { $workRoot = [string]$config.localWorkspaceRoot }
        if ($config.backupRoot) { $backupRoot = [string]$config.backupRoot }
        if ($config.syncGraceSeconds -as [int]) { $syncGraceSeconds = [Math]::Max(0, [Math]::Min(120, [int]$config.syncGraceSeconds)) }
    }

    if (-not (Test-Path -LiteralPath $driveRoot)) {
        throw "No existe la ruta configurada de Google Drive: $driveRoot"
    }

    $patientFolder = Get-DecodedQueryParam -Url $protocolUrl -Name "patientFolder"
    $relativePath = Get-DecodedQueryParam -Url $protocolUrl -Name "path"
    if ($null -eq $patientFolder) {
        throw "Falta el parámetro obligatorio patientFolder."
    }

    $patientRoot = $null
    $patientCandidates = @(
        (Join-Path $driveRoot $patientFolder),
        (Join-Path $driveRoot (Join-Path "PACIENTES" $patientFolder)),
        (Join-Path $driveRoot (Join-Path "Pacientes" $patientFolder)),
        (Join-Path $driveRoot (Join-Path "Pacientes - AM Clinica" $patientFolder))
    )
    foreach ($candidate in $patientCandidates) {
        $safeCandidate = Assert-PathInsideRoot -Candidate $candidate -Root $driveRoot
        if (Test-Path -LiteralPath $safeCandidate) {
            $patientRoot = $safeCandidate
            break
        }
    }
    if (-not $patientRoot) {
        throw "No se encontró la carpeta local del paciente dentro de Google Drive: $patientFolder"
    }

    $normalizedDriveRoot = [System.IO.Path]::GetFullPath($driveRoot).TrimEnd('\') + '\'
    $normalizedWorkRoot = [System.IO.Path]::GetFullPath($workRoot).TrimEnd('\') + '\'
    if ($normalizedWorkRoot.StartsWith($normalizedDriveRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "La carpeta de trabajo local no puede estar dentro de Google Drive. Revisá localWorkspaceRoot en $configFile"
    }

    $targetPath = $patientRoot
    if (-not [string]::IsNullOrWhiteSpace($relativePath)) {
        $targetPath = Assert-PathInsideRoot -Candidate (Join-Path $patientRoot ($relativePath.Replace('/', '\'))) -Root $driveRoot
    }

    if (-not (Test-Path -LiteralPath $targetPath)) {
        throw "No se encontró el archivo o carpeta en Google Drive: $targetPath"
    }

    $targetItem = Get-Item -LiteralPath $targetPath
    $isExocadProject = -not $targetItem.PSIsContainer -and $targetItem.Extension -match '^\.(project|projects|dentalproject)$'
    if (-not $isExocadProject) {
        Start-Process -FilePath $targetItem.FullName
        Write-LauncherLog "Opened folder/file without save workflow: $($targetItem.FullName)"
        exit 0
    }

    if (-not (Test-Path -LiteralPath $exocadAppPath)) {
        throw "No se encontró Exocad en la ruta configurada: $exocadAppPath"
    }
    if (-not (Get-Process -Name "GoogleDriveFS" -ErrorAction SilentlyContinue)) {
        throw "Google Drive para Escritorio no está activo. Abrilo antes de editar para evitar cambios sin sincronizar."
    }

    $appItem = Get-Item -LiteralPath $exocadAppPath
    $existingExocad = Get-Process -Name $appItem.BaseName -ErrorAction SilentlyContinue
    if ($existingExocad) {
        throw "Exocad ya está abierto. Cerralo antes de iniciar el proyecto desde AM Clínica para poder verificar el guardado completo."
    }

    $sourceProjectRoot = $targetItem.Directory.FullName
    $sessionId = Get-Date -Format "yyyyMMdd-HHmmss"
    $safeProjectName = ($targetItem.BaseName -replace '[^a-zA-Z0-9._-]', '_')
    $localProjectRoot = Join-Path $workRoot "$sessionId-$safeProjectName"
    $sessionBackupRoot = Join-Path $backupRoot "$sessionId-$safeProjectName"

    Write-LauncherLog "Preparing local workspace: $localProjectRoot"
    $originalDriveManifest = Get-ProjectManifest -Root $sourceProjectRoot
    Copy-ProjectTree -Source $sourceProjectRoot -Destination $localProjectRoot
    $localBeforeManifest = Get-ProjectManifest -Root $localProjectRoot
    $copyDifferences = @(Get-ChangedProjectFiles -Before $originalDriveManifest -After $localBeforeManifest)
    $copyMissingFiles = @(Get-DeletedProjectFiles -Before $originalDriveManifest -After $localBeforeManifest)
    if ($copyDifferences.Count -gt 0 -or $copyMissingFiles.Count -gt 0) {
        throw "Google Drive cambió mientras se preparaba la copia local. Volvé a abrir el proyecto para trabajar sobre la última versión."
    }
    $localProjectPath = Join-Path $localProjectRoot $targetItem.Name
    if (-not (Test-Path -LiteralPath $localProjectPath)) {
        throw "La copia local no contiene el archivo principal del proyecto."
    }

    Write-LauncherLog "Launching Exocad with protected local copy: $localProjectPath"
    $process = Start-Process -FilePath $appItem.FullName -ArgumentList "`"$localProjectPath`"" -WorkingDirectory $appItem.DirectoryName -PassThru
    $process.WaitForExit()
    Write-LauncherLog "Exocad exited with code $($process.ExitCode)"

    $localAfterManifest = Get-ProjectManifest -Root $localProjectRoot
    $changedFiles = @(Get-ChangedProjectFiles -Before $localBeforeManifest -After $localAfterManifest)
    $deletedFiles = @(Get-DeletedProjectFiles -Before $localBeforeManifest -After $localAfterManifest)
    if ($changedFiles.Count -eq 0 -and $deletedFiles.Count -eq 0) {
        Show-LauncherMessage -Message "Exocad se cerró sin cambios detectados en el proyecto.`n`nLa copia local quedó en:`n$localProjectRoot" -Icon ([System.Windows.MessageBoxImage]::Warning)
        Write-LauncherLog "No changes detected. Recovery copy retained at $localProjectRoot"
        exit 0
    }

    $saveResult = Save-ChangedFilesToDrive -LocalRoot $localProjectRoot -DriveRoot $sourceProjectRoot -OriginalDriveManifest $originalDriveManifest -ChangedFiles $changedFiles -DeletedFiles $deletedFiles -BackupRoot $sessionBackupRoot
    if ($saveResult.Conflicts.Count -gt 0) {
        Show-LauncherMessage -Message "Se detectaron cambios simultáneos en Google Drive y no se sobrescribieron $($saveResult.Conflicts.Count) archivo(s).`n`nTu trabajo está protegido en:`n$localProjectRoot`n`nRevisá el registro:`n$logFile" -Icon ([System.Windows.MessageBoxImage]::Warning)
        exit 2
    }

    if ($syncGraceSeconds -gt 0) {
        Start-Sleep -Seconds $syncGraceSeconds
    }

    foreach ($relativeFile in $changedFiles) {
        $localFile = Join-Path $localProjectRoot $relativeFile
        $driveFile = Join-Path $sourceProjectRoot $relativeFile
        if (-not (Test-Path -LiteralPath $driveFile) -or (Get-FileHash -LiteralPath $localFile -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $driveFile -Algorithm SHA256).Hash) {
            throw "La comprobación final de guardado falló para $relativeFile. La copia local se conservó."
        }
    }
    foreach ($relativeFile in $deletedFiles) {
        if (Test-Path -LiteralPath (Join-Path $sourceProjectRoot $relativeFile)) {
            throw "La comprobación final de eliminación falló para $relativeFile. La copia local se conservó."
        }
    }

    $changeCount = $changedFiles.Count + $deletedFiles.Count
    Write-LauncherLog "Save completed: $($changedFiles.Count) changed file(s), $($deletedFiles.Count) deleted file(s), backup: $sessionBackupRoot, recovery: $localProjectRoot"
    Show-LauncherMessage -Message "Proyecto guardado correctamente.`n`nSe verificaron $changeCount cambio(s) en la carpeta sincronizada de Google Drive.`n`nCopia de recuperación:`n$localProjectRoot"
} catch {
    Write-LauncherLog "ERROR: $($_.Exception.Message)"
    Show-LauncherMessage -Message "No se pudo completar el guardado seguro de Exocad:`n`n$($_.Exception.Message)`n`nRevisá el registro:`n$logFile" -Title "AM Clínica - Error de Exocad" -Icon ([System.Windows.MessageBoxImage]::Error)
    exit 1
}
