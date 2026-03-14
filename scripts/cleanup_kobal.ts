import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log('--- STARTING CLEANUP: KOBAL ---');
    
    // 1. Delete the old "Analia Kobal" test record from Supabase
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const duplicatePatientId = 'b4cecd2b-9138-46e3-8525-84a608decf4b';
    const { data: dbData, error: dbError } = await supabase
        .from('pacientes')
        .delete()
        .eq('id_paciente', duplicatePatientId)
        .select();
        
    if (dbError) {
        console.error('❌ Error trashing patient record from Supabase:', dbError);
    } else {
        console.log(`✅ Permanently deleted duplicate patient record from Supabase (ID: ${duplicatePatientId})`);
    }

    // 2. Trash the 2024 duplicate presentation in Google Drive
    const oldPresentationId = '1cohk-k-CEpsyIL8G7MN74asprq1c0EXpHuVR4AhFvR8';
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    
    try {
        await drive.files.update({
            fileId: oldPresentationId,
            requestBody: { trashed: true },
        });
        console.log(`✅ Moved duplicate 2024 presentation to Drive trash (ID: ${oldPresentationId})`);
    } catch (driveError) {
        console.error('❌ Error trashing the file in Google Drive:', driveError);
    }
    
    console.log('--- CLEANUP COMPLETE ---');
}

main().catch(console.error);
