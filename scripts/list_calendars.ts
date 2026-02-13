
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Load env vars manually
function loadEnv() {
    try {
        const envLocalPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envLocalPath)) {
            const envConfig = fs.readFileSync(envLocalPath, 'utf8');
            envConfig.split('\n').forEach((line) => {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                    process.env[key] = value;
                }
            });
        }
    } catch (e) {
        console.error('Error loading .env.local', e);
    }
}

loadEnv();

async function listCalendars() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        console.error('Missing Google Service Account credentials');
        process.exit(1);
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    try {
        const response = await calendar.calendarList.list();
        const calendars = response.data.items || [];

        console.log(`Found ${calendars.length} calendars connected to service account.`);
        calendars.forEach(cal => {
            console.log(`- ${cal.summary} (ID: ${cal.id})`);
        });

    } catch (error: any) {
        console.error('Error listing calendars:', error.message);
    }
}

listCalendars();
