
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const PACIENTES_ROOT_FOLDER_ID = '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

function getPatientFolderName(apellido: string, nombre: string): string {
    const cleanApellido = (apellido || '').toUpperCase().trim();
    const cleanNombre = (nombre || '').trim();
    const formattedNombre = cleanNombre ? cleanNombre.charAt(0).toUpperCase() + cleanNombre.slice(1).toLowerCase() : '';
    return `${cleanApellido}, ${formattedNombre}`.trim();
}

function extractFolderIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (idMatch && idMatch[1]) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;
    return null;
}

async function findOrCreateFolder(drive: any, parentId: string, name: string): Promise<{ id: string, webViewLink?: string }> {
    const res = await drive.files.list({
        q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, webViewLink)',
    });

    if (res.data.files && res.data.files.length > 0) {
        return { id: res.data.files[0].id!, webViewLink: res.data.files[0].webViewLink };
    }

    const newFolder = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id, webViewLink',
    });

    return { id: newFolder.data.id!, webViewLink: newFolder.data.webViewLink };
}

async function migrate() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('--- Drive Hierarchy RELOCATION Starting ---');

    // Auth Drive
    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    const { data: treatments, error } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            metadata,
            patient:pacientes(id_paciente, nombre, apellido, link_historia_clinica),
            workflow:clinical_workflows(name)
        `);

    if (error) {
        console.error('Error fetching treatments:', error);
        return;
    }

    const orthoTreatments = treatments.filter(t => {
        const name = (t.workflow as any)?.name?.toLowerCase() || '';
        return name.includes('ortodoncia') || name.includes('alineador');
    });

    console.log(`Analyzing ${orthoTreatments.length} Ortho records...`);

    for (const t of orthoTreatments) {
        const folderId = (t.metadata as any)?.drive_folder_id;
        if (!folderId) continue;

        const p = t.patient as any;
        const patientRootName = getPatientFolderName(p.apellido, p.nombre);
        const treatmentFolderName = `${patientRootName} - AM ALINEADORES`;

        console.log(`\nChecking: ${patientRootName} (${folderId})`);

        try {
            // Get current folder info
            const file = await drive.files.get({
                fileId: folderId,
                fields: 'id, name, parents',
            });

            const currentParents = file.data.parents || [];

            // 1. Ensure/Find Mother Folder
            let motherFolderId = extractFolderIdFromUrl(p.link_historia_clinica);
            let motherLink = p.link_historia_clinica;

            if (!motherFolderId) {
                console.log(`  - No mother folder link in DB. Finding/Creating: ${patientRootName}`);
                const mother = await findOrCreateFolder(drive, PACIENTES_ROOT_FOLDER_ID, patientRootName);
                motherFolderId = mother.id;
                motherLink = mother.webViewLink;

                await supabase
                    .from('pacientes')
                    .update({ link_historia_clinica: motherLink })
                    .eq('id_paciente', p.id_paciente);
            }

            // 2. Check if current folder is already in mother
            if (currentParents.includes(motherFolderId)) {
                console.log(`  - Already in correct mother folder.`);
                // Update name if needed
                if (file.data.name !== treatmentFolderName) {
                    console.log(`  - Standardizing name: ${file.data.name} -> ${treatmentFolderName}`);
                    await drive.files.update({
                        fileId: folderId,
                        requestBody: { name: treatmentFolderName }
                    });
                }
            } else {
                console.log(`  - Misplaced (Parent: ${currentParents.join(', ')}). Moving to ${motherFolderId}...`);

                // Move folder
                const previousParents = currentParents.join(',');
                await drive.files.update({
                    fileId: folderId,
                    addParents: motherFolderId,
                    removeParents: previousParents,
                    fields: 'id, parents',
                    requestBody: { name: treatmentFolderName } // Also update name while moving
                });

                console.log(`  - Moved and renamed.`);
            }

            // Final Metadata Sync
            const updatedFile = await drive.files.get({
                fileId: folderId,
                fields: 'webViewLink'
            });

            const metadata = {
                ...(t.metadata as any || {}),
                drive_folder_id: folderId,
                drive_folder_url: updatedFile.data.webViewLink
            };

            await supabase
                .from('patient_treatments')
                .update({ metadata })
                .eq('id', t.id);

            console.log(`  [OK] Metadata synced.`);

        } catch (e: any) {
            console.error(`  [ERROR] Processing ${patientRootName}:`, e.message);
        }
    }
    console.log('\n--- Migration Finished ---');
}

migrate().catch(console.error);
