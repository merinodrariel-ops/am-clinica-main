import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log('--- RESTAURANDO LA PRESENTACIÓN ORIGINAL ---');

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const oldPresentationId = '1cohk-k-CEpsyIL8G7MN74asprq1c0EXpHuVR4AhFvR8'; // The one from 2024
    const newPresentationId = '1VV6HcKdogj2NDFktQMXP9o-MRMgkdKuQGlZ4ME6ZVj8'; // The one from 2026 (probably empty)
    const folderId = '1nwN_0VhVV67mRFteZ48LiK4J0wqd-lLQ'; // [PRESENTACION] folder
    
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    
    try {
        console.log(`1. Vinculando la presentación vieja (2024) de vuelta a la carpeta...`);
        // We add it back to the folder
        await drive.files.update({
            fileId: oldPresentationId,
            addParents: folderId,
            fields: 'id, parents'
        });
        console.log(`✅ Presentación del 2024 restaurada a la carpeta.`);

        console.log(`2. Desvinculando la presentación vacía del 2026...`);
        try {
            await drive.files.update({
                fileId: newPresentationId,
                removeParents: folderId,
                fields: 'id, parents'
            });
            console.log(`✅ Presentación de 2026 quitada.`);
        } catch (e) {
            console.error('Error quitando la de 2026:', e);
        }

        console.log(`3. Actualizando el link en la base de datos de Supabase...`);
        const { error } = await supabase
            .from('pacientes')
            .update({
                link_google_slides: `https://docs.google.com/presentation/d/${oldPresentationId}/edit?usp=drivesdk`
            })
            .eq('id_paciente', '3453ef3c-0f7b-405c-a025-70178404d91f'); // Ana Lia active record

        if (error) {
            console.error('❌ Error actualizando Supabase:', error);
        } else {
            console.log(`✅ Link en base de datos apuntando a la presentación de 2024.`);
        }

    } catch (error) {
        console.error('❌ Error general con Drive:', error);
    }
}

main().catch(console.error);
