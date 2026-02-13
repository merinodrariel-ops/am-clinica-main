
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Load env vars manually since we are running a script
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

const CALENDAR_ID = '51baf8adafc7d1e2e6508a1dea9f9dbc8ec238852a6d1639039c388cdbcbdb6a@group.calendar.google.com';

const KEYWORDS = [
    'cementado de carillas',
    'control de carillas',
    'diseño de sonrisa',
    'diseno de sonrisa',
    'carillas',
    'veneers',
    'facetas'
];

async function main() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        console.error('Missing Google Service Account credentials in .env.local');
        process.exit(1);
    }

    console.log(`Using Service Account: ${clientEmail}`);
    console.log(`Fetching events from calendar: ${CALENDAR_ID}`);

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    try {
        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: '2024-01-01T00:00:00Z',
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 2500,
        });

        const events = response.data.items || [];
        console.log(`Found ${events.length} total events since 2024-01-01.`);

        const matchedEvents = events.filter(event => {
            const summary = (event.summary || '').toLowerCase();
            const description = (event.description || '').toLowerCase();
            return KEYWORDS.some(keyword => summary.includes(keyword) || description.includes(keyword));
        });

        console.log(`Found ${matchedEvents.length} matching events.`);
        console.log('--- Matches ---');
        matchedEvents.forEach(event => {
            const date = event.start?.dateTime || event.start?.date;
            console.log(`[${date}] ${event.summary}`);
        });

    } catch (error: any) {
        if (error.code === 404) {
            console.error('Calendar not found. detailed error:', error.message);
        } else if (error.code === 403) {
            console.error('Permission denied. Please share the calendar with the service account email above.');
        } else {
            console.error('Error fetching calendar events:', error.message);
        }
    }
}

main();
