
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const ORTODONCIA_ROOT_FOLDER_ID = '13LCOTm1tyH8QWw_0N5qTADiDkCKUZFpF';
const PACIENTES_ROOT_FOLDER_ID = '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

async function diagnose() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

    console.log(`Analyzing ${orthoTreatments.length} Ortho treatments...`);

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    let inOldRoot = 0;
    let inNewHierarchy = 0;
    let missing = 0;

    for (const t of orthoTreatments) {
        const folderId = (t.metadata as any)?.drive_folder_id;
        if (!folderId) {
            missing++;
            continue;
        }

        try {
            const file = await drive.files.get({
                fileId: folderId,
                fields: 'id, name, parents',
            });

            const parents = file.data.parents || [];
            if (parents.includes(ORTODONCIA_ROOT_FOLDER_ID)) {
                inOldRoot++;
                console.log(`[OLD ROOT] ${file.data.name} (${folderId})`);
            } else {
                inNewHierarchy++;
                console.log(`[OTHER/NEW] ${file.data.name} (${folderId}) - Parents: ${parents.join(', ')}`);
            }
        } catch (e: any) {
            console.error(`Error checking ${folderId}:`, e.message);
        }
    }

    console.log(`\nSummary:`);
    console.log(`Total Ortho: ${orthoTreatments.length}`);
    console.log(`Missing Folder: ${missing}`);
    console.log(`In Old Flat Root: ${inOldRoot}`);
    console.log(`Already Organized / Other: ${inNewHierarchy}`);
}

diagnose().catch(console.error);
