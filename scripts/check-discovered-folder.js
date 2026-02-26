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

    // The ID I found in list-shared
    const fileId = '17jNo5oqz_JcWFkPYcwMtAJppbtxQMHGe';

    try {
        console.log(`Checking folder: ${fileId}`);
        const res = await drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, parents',
            supportsAllDrives: true,
        });
        console.log('Folder info:', JSON.stringify(res.data, null, 2));

        if (res.data.parents && res.data.parents.length > 0) {
            const parentId = res.data.parents[0];
            console.log(`Checking parent: ${parentId}`);
            const parentRes = await drive.files.get({
                fileId: parentId,
                fields: 'id, name, mimeType',
                supportsAllDrives: true,
            });
            console.log('Parent info:', JSON.stringify(parentRes.data, null, 2));
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkFolder();
