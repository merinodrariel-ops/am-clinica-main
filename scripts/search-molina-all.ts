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
        console.log("Searching for ALL files inside Molina's mother folder, and listing them generically...");
        
        // Let's do a trick: query all files where parents contains any of the known folders
        // Or better yet, we can't easily recurse with 'q' in Drive API v3 without multiple calls, but let's list the mother folder contents and subfolders
        
        const motherId = '14d4REXk0KpIwk3oSJiqj-1XH4Ovgug1J';
        
        async function listAllInFolder(folderId: string, indent: string = '') {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, webViewLink)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
            });
            for (const f of res.data.files || []) {
                console.log(`${indent}- ${f.name} (${f.mimeType}) | ID: ${f.id}`);
                if (f.mimeType === 'application/vnd.google-apps.folder') {
                    await listAllInFolder(f.id!, indent + '  ');
                }
            }
        }
        
        await listAllInFolder(motherId);
    } catch (e) {
        console.error('Error:', e);
    }
}
search();
