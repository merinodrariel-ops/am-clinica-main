const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function listShared() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    try {
        console.log('Listing all files shared with the service account...');
        const res = await drive.files.list({
            pageSize: 20,
            fields: 'files(id, name, mimeType, parents)',
            q: "trashed = false",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        const files = res.data.files;
        if (files.length === 0) {
            console.log('No files found shared with this account.');
        } else {
            console.log('Shared files:');
            files.forEach(f => {
                console.log(`- ${f.name} (${f.id}) [${f.mimeType}] Parents: ${JSON.stringify(f.parents || [])}`);
            });
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

listShared();
