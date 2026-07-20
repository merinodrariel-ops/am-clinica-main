import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const scriptPath = path.join(process.cwd(), 'public', 'setup-exocad', 'open-exocad.ps1');
const installerPath = path.join(process.cwd(), 'public', 'setup-exocad', 'install-protocol.ps1');

test('Exocad launcher waits for the process and verifies changed files before reporting success', async () => {
    const script = await readFile(scriptPath, 'utf8');

    assert.match(script, /Start-Process[^\n]+.*-PassThru/s);
    assert.match(script, /\.WaitForExit\(\)/);
    assert.match(script, /Get-ProjectManifest/);
    assert.match(script, /Get-ChangedProjectFiles/);
    assert.match(script, /Get-DeletedProjectFiles/);
    assert.match(script, /Get-FileHash[^\n]+SHA256/);
    assert.match(script, /Save-ChangedFilesToDrive/);
    assert.match(script, /CONFLICT: Drive changed while Exocad was open/);
    assert.match(script, /VERIFIED DELETION/);
    assert.match(script, /Proyecto guardado correctamente/);
});

test('Exocad launcher keeps backups and rejects unsafe or unverifiable sessions', async () => {
    const script = await readFile(scriptPath, 'utf8');

    assert.match(script, /Assert-PathInsideRoot/);
    assert.match(script, /localWorkspaceRoot[\s\S]+no puede estar dentro de Google Drive/);
    assert.match(script, /Google Drive cambió mientras se preparaba la copia local/);
    assert.match(script, /GoogleDriveFS/);
    assert.match(script, /Exocad ya está abierto/);
    assert.match(script, /\.am-clinica-exocad\\backups/);
    assert.match(script, /AMClinica\\ExocadWork/);
});

test('installer ships the matching safe-save launcher version and configuration defaults', async () => {
    const installer = await readFile(installerPath, 'utf8');

    assert.match(installer, /launcherVersion = "2\.0\.0"/);
    assert.match(installer, /localWorkspaceRoot/);
    assert.match(installer, /backupRoot/);
    assert.match(installer, /syncGraceSeconds/);
    assert.match(installer, /Copy-Item -Path \$sourceScript -Destination \$targetScript -Force/);
});
