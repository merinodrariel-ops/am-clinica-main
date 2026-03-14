import { google } from 'googleapis';
import { getDriveClient as getDrive } from '../lib/google-drive.ts';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    const drive = getDrive();
    console.log('Searching for all Google Slides and Shortcuts in the entire Drive...');
    
    // Search for all presentations
    const res = await drive.files.list({
        // mimeType = 'application/vnd.google-apps.shortcut'
        q: "trashed = false and (mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.google-apps.shortcut')",
        fields: 'files(id, name, mimeType, parents, shortcutDetails)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000,
    });

    console.log(`Found ${res.data.files?.length} items.`);
    for (const f of res.data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.shortcut') {
            console.log(`- [SHORTCUT] ${f.name} | ID: ${f.id} | Target: ${f.shortcutDetails?.targetId} | Parents: ${f.parents?.join(', ')}`);
        } else {
             // Only log presentations that look like patient files or are recent
             // For now list all to grep
             console.log(`- [PRESENTATION] ${f.name} | ID: ${f.id} | Parents: ${f.parents?.join(', ')}`);
        }
    }
}

main().catch(console.error);
