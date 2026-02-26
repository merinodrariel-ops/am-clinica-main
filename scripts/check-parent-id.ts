
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

async function checkParent() {
    const parentId = '0AH7BDaBC7P-zUk9PVA';

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.files.get({
            fileId: parentId,
            fields: 'id, name, mimeType',
            supportsAllDrives: true
        });
        console.log(`Parent Name: ${res.data.name}`);
        console.log(`Parent MIME: ${res.data.mimeType}`);
    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }
}

checkParent();
