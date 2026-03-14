import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
    'http://localhost'
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth });

async function search() {
    try {
        console.log("Searching for ALL presentations created in the last 15 days...");
        
        const date = new Date();
        date.setDate(date.getDate() - 15);
        const dateStr = date.toISOString();

        const res = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.presentation' and createdTime > '${dateStr}' and trashed=false`,
            fields: 'files(id, name, createdTime, webViewLink)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            orderBy: 'createdTime desc'
        });

        for (const file of res.data.files || []) {
            console.log(`- ${file.createdTime} | ${file.name} | ID: ${file.id}`);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
search();
