
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars
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

// --- Configuration ---
const KEYWORDS = [
    'cementado de carillas', 'control de carillas', 'diseño de sonrisa', 'diseno de sonrisa',
    'carilla', 'veneer', 'faceta', 'botox', 'limpieza', 'profilaxis', 'ortodoncia',
    'control', 'implante', 'blanqueamiento'
];

const IGNORE_WORDS = ['consultorio', 'agendado', 'turno', 'paciente', 'dr', 'dra', 'cancelado'];

// Normalize text for matching
function normalize(str: string) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");
}

type Patient = {
    id_paciente: string;
    nombre: string;
    apellido: string;
    data_score: number; // Score based on filled fields
};

type MatchedEvent = {
    date: string;
    summary: string;
    description?: string;
    found_keyword: string;
    matched_patient?: Patient;
    confidence: 'high' | 'medium' | 'low' | 'none';
};

async function main() {
    // 1. Setup Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase env vars');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch Patients
    console.log('Fetching patients from database...');
    const { data: patientsData, error: patientsError } = await supabase
        .from('pacientes')
        .select('*'); // Select all to calculate score

    if (patientsError) {
        console.error('Error fetching patients:', patientsError);
        return;
    }

    const patients: Patient[] = (patientsData || []).map((p: any) => {
        let score = 0;
        if (p.email) score += 2;
        if (p.telefono) score += 2;
        if (p.dni) score += 1;
        if (p.direccion) score += 1;
        return {
            id_paciente: p.id_paciente,
            nombre: normalize(p.nombre || ''),
            apellido: normalize(p.apellido || ''),
            data_score: score
        };
    });

    console.log(`Loaded ${patients.length} patients.`);

    // 3. Setup Google Calendar
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        console.error('Missing Google Service Account credentials');
        return;
    }

    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // 4. List Calendars
    let calendarIds: string[] = [];
    try {
        const calList = await calendar.calendarList.list();
        calendarIds = (calList.data.items || []).map(c => c.id!).filter(id => id);
        console.log(`Found ${calendarIds.length} calendars.`);
    } catch (e: any) {
        console.error('Error listing calendars (Check API enabled):', e.message);
        return;
    }

    // 5. Scan Events
    const allMatches: MatchedEvent[] = [];

    for (const calId of calendarIds) {
        console.log(`Scanning calendar: ${calId}...`);
        try {
            let pageToken: string | undefined = undefined;
            do {
                const eventsResp: any = await calendar.events.list({
                    calendarId: calId,
                    timeMin: '2010-01-01T00:00:00Z', // "Toda la vida" usually implies reasonable past
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 2500, // Max per page
                    pageToken
                });

                const events = eventsResp.data.items || [];

                for (const event of events) {
                    const summary = event.summary || '';
                    const description = event.description || '';
                    const text = normalize(summary + ' ' + description);

                    // Check keywords
                    const foundKeyword = KEYWORDS.find(k => text.includes(normalize(k)));

                    if (foundKeyword) {
                        // Attempt Match
                        let bestMatch: Patient | undefined;
                        let maxNameMatch = 0;

                        // Simple matching strategy: Check if both First and Last name appear in text
                        // Only if both are present (high confidence)
                        // Or if First name is unique? Too risky.

                        // Let's filter patients whose full name parts are in the text
                        const potentialPatients = patients.filter(p => {
                            if (!p.nombre || !p.apellido) return false;

                            const nameParts = p.nombre.split(' ').filter(s => s.length > 2);
                            const lastNameParts = p.apellido.split(' ').filter(s => s.length > 2);

                            // Check if ALL significant name parts are in the text
                            const nameMatch = nameParts.every(part => text.includes(part));
                            const lastNameMatch = lastNameParts.every(part => text.includes(part));

                            return nameMatch && lastNameMatch;
                        });

                        if (potentialPatients.length > 0) {
                            // Sort by data score desc
                            potentialPatients.sort((a, b) => b.data_score - a.data_score);
                            bestMatch = potentialPatients[0];
                        }

                        allMatches.push({
                            date: event.start?.dateTime || event.start?.date || 'Unknown',
                            summary: summary,
                            description: event.description || undefined,
                            found_keyword: foundKeyword,
                            matched_patient: bestMatch,
                            confidence: bestMatch ? 'high' : 'none'
                        });
                    }
                }

                pageToken = eventsResp.data.nextPageToken || undefined;
            } while (pageToken);

        } catch (e: any) {
            console.error(`Error scanning calendar ${calId}:`, e.message);
        }
    }

    console.log(`\nScan Complete. Found ${allMatches.length} relevant events.`);

    // Sort by date desc
    allMatches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Output JSON
    fs.writeFileSync('found_recalls.json', JSON.stringify(allMatches, null, 2));
    console.log('Results saved to found_recalls.json');

    // Summary Log
    const validMatches = allMatches.filter(m => m.confidence === 'high');
    console.log(`Matched ${validMatches.length} events to existing patients.`);

    if (validMatches.length > 0) {
        console.log('--- Sample Matches ---');
        validMatches.slice(0, 10).forEach(m => {
            console.log(`[${m.date}] ${m.summary} -> ${m.matched_patient?.nombre} ${m.matched_patient?.apellido} (${m.found_keyword})`);
        });
    }
}

main();
