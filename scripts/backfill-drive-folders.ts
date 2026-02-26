
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const PACIENTES_ROOT_FOLDER_ID = '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

/**
 * Standardizes patient folder names: APELLIDO, Nombre
 */
function getPatientFolderName(apellido: string, nombre: string): string {
    const cleanApellido = (apellido || '').toUpperCase().trim();
    const cleanNombre = (nombre || '').trim();
    const formattedNombre = cleanNombre ? cleanNombre.charAt(0).toUpperCase() + cleanNombre.slice(1).toLowerCase() : '';
    return `${cleanApellido}, ${formattedNombre}`.trim();
}

/**
 * Extracts a Google Drive folder ID from various URL formats
 */
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

async function backfill() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('--- Drive Hierarchy Backfill Starting ---');
    console.log('Fetching Orthodontics treatments...');

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

    // Filter for Orthodontics/Alineadores
    const orthoTreatments = treatments.filter(t => {
        const name = (t.workflow as any)?.name?.toLowerCase() || '';
        return name.includes('ortodoncia') || name.includes('alineador');
    });

    // Pending are those without drive_folder_id
    const pending = orthoTreatments.filter(t => !((t.metadata as any)?.drive_folder_id));
    console.log(`Found ${pending.length} treatments needing migration/folders.`);

    if (pending.length === 0) {
        console.log('No pending treatments found.');
        return;
    }

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    for (const t of pending) {
        const p = t.patient as any;
        const patientRootName = getPatientFolderName(p.apellido, p.nombre);
        const treatmentFolderName = `${patientRootName} - AM ALINEADORES`;

        console.log(`\nProcessing: ${patientRootName}`);

        try {
            // 1. Ensure Patient Mother Folder exists
            let parentFolderId = extractFolderIdFromUrl(p.link_historia_clinica);
            let parentLink = p.link_historia_clinica;

            if (!parentFolderId) {
                console.log(`  - Creating/Finding Mother Folder: ${patientRootName}`);
                const parent = await findOrCreateFolder(drive, PACIENTES_ROOT_FOLDER_ID, patientRootName);
                parentFolderId = parent.id;
                parentLink = parent.webViewLink;

                // Update patient record
                await supabase
                    .from('pacientes')
                    .update({ link_historia_clinica: parentLink })
                    .eq('id_paciente', p.id_paciente);
            }

            // 2. Create the treatment subfolder inside mother
            console.log(`  - Creating Treatment Folder: ${treatmentFolderName}`);
            const result = await findOrCreateFolder(drive, parentFolderId, treatmentFolderName);

            // 3. Update treatment metadata
            let webViewLink = result.webViewLink;
            if (!webViewLink) {
                const file = await drive.files.get({
                    fileId: result.id,
                    fields: 'webViewLink',
                });
                webViewLink = file.data.webViewLink || undefined;
            }

            const metadata = {
                ...(t.metadata as any || {}),
                drive_folder_id: result.id,
                drive_folder_url: webViewLink
            };

            await supabase
                .from('patient_treatments')
                .update({ metadata })
                .eq('id', t.id);

            console.log(`  [OK] Successfully linked to folder.`);
        } catch (e) {
            console.error(`  [ERROR] Processing ${patientRootName}:`, e);
        }
    }
    console.log('\n--- Backfill Process Finished ---');
}

backfill().catch(console.error);

