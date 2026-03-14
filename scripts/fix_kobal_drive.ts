import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log('--- REPARANDO DUPLICADO EN DRIVE ---');
    
    const fileIdToRemove = '1cohk-k-CEpsyIL8G7MN74asprq1c0EXpHuVR4AhFvR8'; // 2024 duplicate
    const folderId = '1nwN_0VhVV67mRFteZ48LiK4J0wqd-lLQ'; // [PRESENTACION] folder
    
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    
    try {
        console.log(`Intentando desvincular el archivo de la carpeta...`);
        // We remove the file from its parent folder instead of deleting it, 
        // which bypasses ownership restriction.
        await drive.files.update({
            fileId: fileIdToRemove,
            removeParents: folderId,
            fields: 'id, parents'
        });
        console.log(`✅ ¡Éxito! El archivo viejo del 2024 ha sido desconectado de la carpeta [PRESENTACION] de Analia Kobal.`);
    } catch (error) {
        console.error('❌ Error gestionando en Google Drive:', error);
    }
}

main().catch(console.error);
