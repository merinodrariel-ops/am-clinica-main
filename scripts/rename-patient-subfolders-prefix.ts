import { google, drive_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const PACIENTES_ROOT = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';
const DRY_RUN = process.argv.includes('--run') ? false : true;

function getAuth() {
    const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
    const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;

    if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
        const oauth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
        oauth2Client.setCredentials({ refresh_token: oauthRefreshToken });
        return oauth2Client;
    }

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        throw new Error('Google Drive auth not configured in env.');
    }

    return new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
}

function getDrive() {
    return google.drive({ version: 'v3', auth: getAuth() });
}

async function run() {
    console.log(`Starting rename script. DRY_RUN: ${DRY_RUN}`);
    const drive = getDrive();

    try {
        let pageToken: string | undefined = undefined;
        let count = 0;
        let renamed = 0;

        do {
            const res: any = await drive.files.list({
                q: `'${PACIENTES_ROOT}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                fields: 'nextPageToken, files(id, name)',
                pageToken: pageToken,
                pageSize: 100,
            });

            const patients = res.data.files || [];

            for (const patientFolder of patients) {
                if (!patientFolder.id || !patientFolder.name) continue;

                // Get all subfolders of this patient folder
                const subRes: any = await drive.files.list({
                    q: `'${patientFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    includeItemsFromAllDrives: true,
                    supportsAllDrives: true,
                    fields: 'files(id, name)',
                });

                const subfolders = subRes.data.files || [];
                for (const sub of subfolders) {
                    if (!sub.id || !sub.name) continue;

                    // Specific matching logic: look for strings ending with a known suffix
                    // Or more generally, if it contains " - " and doesn't already start with [
                    if (sub.name.includes(' - ') && !sub.name.startsWith('[')) {
                        const parts = sub.name.split(' - ');
                        if (parts.length >= 2) {
                            const suffix = parts.pop()?.trim(); // get the last part as suffix
                            const prefix = parts.join(' - ').trim(); // the rest is the patient name

                            const newName = `[${suffix}] ${prefix}`;

                            console.log(`Renaming: "${sub.name}" -> "${newName}"`);
                            count++;

                            if (!DRY_RUN) {
                                try {
                                    await drive.files.update({
                                        fileId: sub.id,
                                        supportsAllDrives: true,
                                        requestBody: { name: newName }
                                    });
                                    renamed++;
                                } catch (e: unknown) {
                                    const msg = e instanceof Error ? e.message : String(e);
                                    console.error(`Failed to rename ${sub.name}:`, msg);
                                }
                            }
                        }
                    }
                }
            }

            pageToken = res.data.nextPageToken || undefined;
        } while (pageToken);

        console.log(`Found ${count} candidates.`);
        if (!DRY_RUN) {
            console.log(`Successfully renamed ${renamed} folders.`);
        } else {
            console.log("Run with --run to actually apply the renames.");
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
