import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.files.list({
            q: `name contains 'Molina' and mimeType='application/vnd.google-apps.presentation' and trashed=false`,
            fields: 'files(id, name, createdTime, parents)',
        });
        console.log(`Presentations matching 'Molina':`, JSON.stringify(res.data.files, null, 2));
    } catch (err) {
        console.error(err);
    }
}

main().catch(console.error);
