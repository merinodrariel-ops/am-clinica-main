
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

async function checkPermissions() {
    const folderId = '1FKrzov9cJ7OTeTm1bOQ-gpm-9SJZhTFQ'; // Lopez Camila

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.permissions.list({
            fileId: folderId,
            fields: 'permissions(id, emailAddress, role, type)',
            supportsAllDrives: true
        });
        console.log(`Permissions for ${folderId}:`);
        console.log(JSON.stringify(res.data.permissions, null, 2));
        console.log(`\nService Account Email: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }
}

checkPermissions();
