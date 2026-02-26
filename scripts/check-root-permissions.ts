
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

async function checkRoot() {
    const rootId = '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti'; // PACIENTES

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.files.get({
            fileId: rootId,
            fields: 'id, name, capabilities, permissions',
            supportsAllDrives: true
        });
        console.log(`Root Folder: ${res.data.name}`);
        console.log(`Capabilities: ${JSON.stringify(res.data.capabilities, null, 2)}`);
    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }
}

checkRoot();
