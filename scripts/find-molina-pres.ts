import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const folderId = '14d4REXk0KpIwk3oSJiqj-1XH4Ovgug1J';
    
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.files.list({
            q: `'14d4REXk0KpIwk3oSJiqj-1XH4Ovgug1J' in parents and mimeType='application/vnd.google-apps.presentation' and trashed=false`,
            fields: 'files(id, name)',
        });
        console.log(`Presentations in main folder:`, res.data.files);

        // check all subfolders for presentations
        const allRes = await drive.files.list({
            q: `'14d4REXk0KpIwk3oSJiqj-1XH4Ovgug1J' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });
        
        for (const sub of allRes.data.files || []) {
            const subPres = await drive.files.list({
                q: `'${sub.id}' in parents and mimeType='application/vnd.google-apps.presentation' and trashed=false`,
                fields: 'files(id, name)',
            });
            console.log(`Presentations in ${sub.name}:`, subPres.data.files);
        }

    } catch (err) {
        console.error(err);
    }
}

main().catch(console.error);
