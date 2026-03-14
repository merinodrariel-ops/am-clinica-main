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

    console.log('--- DB DIAGNOSTIC ---');
    const { data: patients, error: pError } = await supabase
        .from('pacientes')
        .select('*')
        .ilike('apellido', '%Kobal%');

    if (pError) console.error('Error fetching patient:', pError);
    console.log('Patients Found:', JSON.stringify(patients, null, 2));

    const { data: submissions, error: sError } = await supabase
        .from('admission_submissions')
        .select('*')
        .ilike('personal_data->>apellido', '%Kobal%');

    if (sError) console.log('Submissions error or not found - checking admission_leads');
    
    const { data: leads } = await supabase
        .from('admission_leads')
        .select('*')
        .ilike('apellido', '%Kobal%');

    console.log('Admission Leads Found:', JSON.stringify(leads, null, 2));

    if (patients && patients.length > 0) {
        const patient = patients[0];
        const folderId = extractId(patient.link_historia_clinica);
        
        if (folderId) {
            console.log('\n--- DRIVE DIAGNOSTIC ---');
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
                    fields: 'files(id, name, mimeType, createdTime, size, version)',
                    orderBy: 'createdTime'
                });

                console.log('Files in Drive Folder:');
                console.log(JSON.stringify(res.data.files, null, 2));

                // Also list files in children folders (if any)
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
