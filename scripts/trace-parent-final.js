const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function traceParent() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // AM ALINEADORES
    const fileId = '13LCOTm1tyH8QWw_0N5qTADiDkCKUZFpF';

    try {
        const res = await drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, parents',
            supportsAllDrives: true,
        });
        console.log('Current Folder:', res.data.name, 'Parents:', res.data.parents);

        if (res.data.parents) {
            for (const p of res.data.parents) {
                try {
                    const pRes = await drive.files.get({
                        fileId: p,
                        fields: 'id, name, mimeType',
                        supportsAllDrives: true,
                    });
                    console.log('Parent Found:', pRes.data.name, '(', pRes.data.id, ')');
                } catch (e) {
                    console.log('Parent', p, 'is NOT accessible.');
                }
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

traceParent();
