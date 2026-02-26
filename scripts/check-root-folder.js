const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function checkFolder() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const fileId = '1X64CIs56K5o5fQ9F9YVzP187-j7gGk2W';

    try {
        console.log(`Checking folder: ${fileId}`);
        const res = await drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, capabilities, owners',
            supportsAllDrives: true,
        });
        console.log('Folder found:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response && e.response.data) {
            console.error('Details:', JSON.stringify(e.response.data, null, 2));
        }
    }
}

checkFolder();
