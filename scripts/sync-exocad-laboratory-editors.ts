import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
    const apply = process.argv.includes('--apply');
    const { PACIENTES_ROOT_FOLDER_ID, ensureDriveFolderWriterAccess, getDriveClient } = await import('../lib/google-drive');
    const { getActiveLaboratoryEditorEmails } = await import('../lib/laboratory-drive-access');

    const laboratoryEditors = await getActiveLaboratoryEditorEmails();
    if (laboratoryEditors.error) throw new Error(laboratoryEditors.error);

    const drive = getDriveClient();
    const patientFolders: Array<{ id: string; name: string }> = [];
    let pageToken: string | undefined;

    do {
        const response = await drive.files.list({
            q: `'${PACIENTES_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            pageSize: 1000,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            fields: 'nextPageToken,files(id,name)',
        });
        patientFolders.push(...(response.data.files || []).flatMap((folder) =>
            folder.id ? [{ id: folder.id, name: folder.name || '' }] : []
        ));
        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    const exocadFolders: Array<{ id: string; name: string }> = [];
    for (let index = 0; index < patientFolders.length; index += 50) {
        const batch = patientFolders.slice(index, index + 50);
        const batchResults = await Promise.all(batch.map(async (patientFolder) => {
            const response = await drive.files.list({
                q: `'${patientFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and name contains '[EXOCAD]' and trashed=false`,
                pageSize: 100,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                fields: 'files(id,name)',
            });
            return (response.data.files || []).flatMap((folder) =>
                folder.id && folder.name?.startsWith('[EXOCAD]') ? [{ id: folder.id, name: folder.name }] : []
            );
        }));
        exocadFolders.push(...batchResults.flat());
    }

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        laboratoryEditorCount: laboratoryEditors.emails.length,
        patientFolderCount: patientFolders.length,
        exocadFolderCount: exocadFolders.length,
    }, null, 2));

    if (!apply) return;

    let granted = 0;
    let alreadyWriter = 0;
    const failures: Array<{ folder: string; count: number }> = [];

    for (const folder of exocadFolders) {
        const result = await ensureDriveFolderWriterAccess(folder.id, laboratoryEditors.emails);
        granted += result.granted.length;
        alreadyWriter += result.alreadyWriter.length;
        if (result.failed.length > 0) failures.push({ folder: folder.name, count: result.failed.length });
    }

    console.log(JSON.stringify({ granted, alreadyWriter, failures }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
