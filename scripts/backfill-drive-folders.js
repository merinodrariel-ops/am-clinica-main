const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const ORTODONCIA_ROOT_FOLDER_ID = '13LCOTm1tyH8QWw_0N5qTADiDkCKUZFpF';

async function backfill() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('Fetching Orthodontics treatments...');

    const { data: treatments, error } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            metadata,
            patient:pacientes(id_paciente, nombre, apellido),
            workflow:clinical_workflows(name)
        `);

    if (error) {
        console.error('Error fetching treatments:', error);
        return;
    }

    const orthoTreatments = treatments.filter(t => {
        const name = (t.workflow?.name || '').toLowerCase();
        return name.includes('ortodoncia') || name.includes('alineador');
    });

    const pending = orthoTreatments.filter(t => !(t.metadata?.drive_folder_id));
    console.log(`Found ${pending.length} treatments needing folders.`);

    if (pending.length === 0) return;

    // Use GoogleAuth like in the main app
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    for (const t of pending) {
        const patientData = t.patient;
        const folderName = `${patientData.apellido || ''} ${patientData.nombre || ''}`.trim() || `Paciente ${patientData.id_paciente}`;

        console.log(`Processing: ${folderName}`);

        try {
            // Create folder
            const newFolder = await drive.files.create({
                requestBody: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [ORTODONCIA_ROOT_FOLDER_ID],
                },
                fields: 'id, webViewLink',
                supportsAllDrives: true,
            });
            const folderId = newFolder.data.id;
            const webViewLink = newFolder.data.webViewLink;

            // Update metadata
            const metadata = {
                ...(t.metadata || {}),
                drive_folder_id: folderId,
                drive_folder_url: webViewLink
            };

            await supabase
                .from('patient_treatments')
                .update({ metadata })
                .eq('id', t.id);

            console.log(`Done: ${folderName} -> ${folderId}`);
        } catch (e) {
            console.error(`Error processing ${folderName}:`, e.message);
        }
    }
    console.log('Backfill process completed.');
}

backfill().catch(console.error);
