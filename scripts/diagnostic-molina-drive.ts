import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function extractId(urlOrId?: string | null): string | null {
    if (!urlOrId) return null;
    if (!urlOrId.includes('drive.google.com')) return urlOrId;
    const match = urlOrId.match(/[-\w]{25,}/);
    return match ? match[0] : urlOrId;
}

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: patients, error: pError } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id_paciente', '2d298146-745c-4069-902e-5025d1b6536e');

    if (patients && patients.length > 0) {
        const patient = patients[0];
        const folderId = extractId(patient.link_historia_clinica);
        
        if (folderId) {
            console.log('\n--- DRIVE DIAGNOSTIC MOLINA ---');
            const auth = new google.auth.OAuth2(
                process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
                process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
            );
            auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
            const drive = google.drive({ version: 'v3', auth });

            try {
                console.log('Listing files in folder:', folderId);
                const res = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'files(id, name, mimeType, createdTime)',
                });

                console.log('Files in Drive Folder:');
                console.log(JSON.stringify(res.data.files, null, 2));

                for (const file of res.data.files || []) {
                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        console.log(`\nContents of subfolder: ${file.name} (${file.id})`);
                        const subRes = await drive.files.list({
                            q: `'${file.id}' in parents and trashed = false`,
                            fields: 'files(id, name, mimeType, createdTime)',
                        });
                        console.log(JSON.stringify(subRes.data.files, null, 2));
                    }
                }
            } catch (err) {
                console.error('Error listing Drive files:', err);
            }
        }
    }
}

main().catch(console.error);
