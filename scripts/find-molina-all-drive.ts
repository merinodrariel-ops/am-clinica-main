import { google } from 'googleapis';
import { getDriveClient as getDrive } from '../lib/google-drive.ts';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    const drive = getDrive();
    console.log('Searching for all presentations with "Molina" in name...');
    
    // Search for presentations (Slides or Powerpoints) or Shortcuts pointing to them
    const res = await drive.files.list({
        // q: "name contains 'Molina' and (mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.google-apps.shortcut')",
        q: "name contains 'Molina' and trashed = false",
        fields: 'files(id, name, mimeType, parents, webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });

    for (const f of res.data.files || []) {
        console.log(`- ${f.name} | ${f.mimeType} | ID: ${f.id} | Parents: ${f.parents?.join(', ')}`);
        console.log(`  Link: ${f.webViewLink}`);
    }
}

main().catch(console.error);
