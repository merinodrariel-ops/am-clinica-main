import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PRIMARY_CALENDAR_PATH = '/tmp/calendar_history_primary.json';
const EMILY_CALENDAR_PATH = '/tmp/calendar_history_emily.json';
const PATIENTS_DATA_PATH = '/Users/am/.gemini/antigravity/brain/b47c5800-f006-41d9-a6da-3a4fefcc28a7/.system_generated/steps/2717/output.txt';
const OUTPUT_REPORT_PATH = '/tmp/calendar_migration_report.json';
const CLEAN_APPOINTMENTS_PATH = '/tmp/calendar_clean_appointments.json';

interface CalendarEvent {
    id: string;
    summary?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    status: string;
    organizer?: { email: string };
    description?: string;
    location?: string;
}

interface Patient {
    id_paciente: string;
    nombre: string;
    apellido: string;
    documento: string;
    full_name: string;
    whatsapp?: string;
    whatsapp_numero?: string;
    email?: string;
}

const NOISE_PATTERNS = [
    /reuni/i, /curso/i, /staff/i, /vacaciones/i, /feriado/i, /almuerzo/i,
    /lunch/i, /personal/i, /bloqueo/i, /mantenimiento/i, /limpieza/i,
    /no viene/i, /no esta/i, /no está/i, /ausente/i, /aviso/i, /cancelado/i,
    /recordatorio/i, /aniversario/i, /cumpleaños/i, /feliz/i, /pago/i,
    /cuota/i, /alquiler/i, /residuos/i, /patol/i, /banco/i, /trámite/i,
    /tramite/i, /doctor/i, /dra\./i, /dr\./i, /odont/i, /asistente/i,
    /hasta las/i, /desde las/i, /libre/i, /zoom/i, /meet/i, /llamar/i,
    /notar/i, /aviso/i, /confirm/i, /mensaje/i, /wp/i, /wpp/i, /pagar/i, /pago/i,
    /vencimiento/i, /financiacion/i, /cuota/i, /seña/i, /debe/i, /cobrar/i
];

function normalize(text: string): string {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]/g, ' ') // Replace non-alphanum with space
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();
}

function levenshtein(a: string, b: string): number {
    const tmp = [];
    for (let i = 0; i <= a.length; i++) { tmp[i] = [i]; }
    for (let j = 0; j <= b.length; j++) { tmp[0][j] = j; }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            tmp[i][j] = Math.min(
                tmp[i - 1][j] + 1,
                tmp[i][j - 1] + 1,
                tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return tmp[a.length][b.length];
}

function isFuzzyMatch(s1: string, s2: string): boolean {
    if (s1.length < 5 || s2.length < 5) return false;
    const distance = levenshtein(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    const similarity = 1 - (distance / maxLength);
    return similarity > 0.85; // Allow for slight variations like Marianella vs Marianela
}

async function analyzeMigration() {
    console.log('--- Starting Migration Analysis ---');

    // 1. Load Patients
    console.log('Loading patient data...');
    if (!fs.existsSync(PATIENTS_DATA_PATH)) {
        throw new Error(`Patients data file not found at ${PATIENTS_DATA_PATH}`);
    }
    const patientsFileContent = fs.readFileSync(PATIENTS_DATA_PATH, 'utf8');
    const patientsRaw = JSON.parse(patientsFileContent);
    const resultString = patientsRaw.result;

    const firstBracket = resultString.indexOf('[');
    const lastBracket = resultString.lastIndexOf(']');

    if (firstBracket === -1 || lastBracket === -1) {
        throw new Error('No patient array found in the results file');
    }

    const jsonStr = resultString.substring(firstBracket, lastBracket + 1);
    const patients: Patient[] = JSON.parse(jsonStr);
    console.log(`Loaded ${patients.length} patients.`);

    // Prepare normalized patients for matching
    const patientsMap = patients.map(p => ({
        ...p,
        normFullName: normalize(p.full_name || ''),
        normLastName: normalize(p.apellido || ''),
        normFirstName: normalize(p.nombre || ''),
        normDoc: p.documento?.replace(/\D/g, '') || '',
        normPhone: (p.whatsapp_numero || p.whatsapp)?.replace(/\D/g, '') || ''
    }));

    // 2. Load Calendar Events
    console.log('Loading calendar data...');
    const loadEvents = (filePath: string) => {
        if (!fs.existsSync(filePath)) return [];
        try {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            // Try parsing as a single object first
            try {
                const data = JSON.parse(content);
                return data.items || [];
            } catch (e) {
                // If it fails, it might be multiple JSON objects (one per line)
                const lines = content.split('\n').filter(l => l.trim().startsWith('{'));
                const allItems: any[] = [];
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.items) allItems.push(...data.items);
                    } catch (lineError: any) {
                        // silent fail for individual lines
                    }
                }
                return allItems;
            }
        } catch (e) {
            console.error(`Error loading ${filePath}:`, e);
            return [];
        }
    };

    const DOCTOR_ARIEL = 'f160be8c-6014-4cba-bdde-b2d926eb8831'; // Ariel Merino
    const DOCTOR_EMILY = 'd5d96db1-b93f-4c54-ae3a-3044d64f52bd'; // Emily Lugo

    const primaryEvents = loadEvents(PRIMARY_CALENDAR_PATH).map(e => ({ ...e, doctor_id: DOCTOR_ARIEL }));
    const emilyEvents = loadEvents(EMILY_CALENDAR_PATH).map(e => ({ ...e, doctor_id: DOCTOR_EMILY }));
    const allEvents = [...primaryEvents, ...emilyEvents];

    console.log(`Loaded ${allEvents.length} events total.`);

    // 3. Process and Filter
    const report: any[] = [];
    const cleanAppointments: any[] = [];

    // Keywords to strip before matching
    const PREFIXES = [
        /hablar con /i, /turno /i, /seña /i, /consulta /i, /paciente /i,
        /chequear /i, /traer /i, /pedir /i, /llamar a /i, /ver /i
    ];

    for (const event of allEvents) {
        const summary = event.summary || '';
        let strippedSummary = summary;
        for (const prefix of PREFIXES) {
            strippedSummary = strippedSummary.replace(prefix, '');
        }
        const normSummary = normalize(strippedSummary);
        const originalNormSummary = normalize(summary);

        const IGNORED_PATIENT_NAMES = [
            'ariel merino', 'emily', 'dra emily', 'dr ariel merino', 'staff',
            'valentina merino', 'lourdes mendez', 'camila castro', 'merino ariel'
        ];

        // Matching Logic (Try before noise filter)
        let matchedPatient = null;

        // 1. Try finding by Document (DNI) in summary
        const dniMatch = summary.match(/\d{7,8}/);
        if (dniMatch) {
            matchedPatient = patientsMap.find(p => p.normDoc === dniMatch[0] && !IGNORED_PATIENT_NAMES.includes(p.normFullName));
        }

        // 2. Exact/Inclusion Match for High Confidence
        if (!matchedPatient) {
            matchedPatient = patientsMap.find(p =>
                !IGNORED_PATIENT_NAMES.includes(p.normFullName) &&
                (p.normFullName === normSummary || p.normFullName === originalNormSummary)
            );
        }

        // 3. Robust Word-based Matching
        if (!matchedPatient) {
            const summaryWords = Array.from(new Set([
                ...normSummary.split(' ').filter(w => w.length >= 2),
                ...originalNormSummary.split(' ').filter(w => w.length >= 2)
            ]));

            if (summaryWords.length >= 1) {
                // Find candidates that share at least 2 words or a unique 5+ char word
                matchedPatient = patientsMap.find(p => {
                    if (IGNORED_PATIENT_NAMES.includes(p.normFullName)) return false;

                    const pWords = p.normFullName.split(' ').filter(w => w.length >= 3);
                    if (pWords.length === 0) return false;

                    const matches = pWords.filter(pw =>
                        summaryWords.some(sw =>
                            sw === pw ||
                            (pw.length > 5 && sw.startsWith(pw.substring(0, 5))) ||
                            (sw.length > 5 && pw.startsWith(sw.substring(0, 5))) ||
                            (sw.length > 4 && isFuzzyMatch(sw, pw))
                        )
                    );

                    // For 2+ part names, require 2 matches. For 1 part names, require exact match of that part.
                    return matches.length >= Math.min(pWords.length, 2);
                });
            }
        }

        // 5. Try finding by phone number in summary
        if (!matchedPatient) {
            const phoneInSummary = summary.replace(/\D/g, '');
            if (phoneInSummary.length >= 8) {
                matchedPatient = patientsMap.find(p =>
                    p.normPhone &&
                    phoneInSummary.includes(p.normPhone) &&
                    !IGNORED_PATIENT_NAMES.includes(p.normFullName)
                );
            }
        }

        // Noise Filter (Only if NOT matched)
        const isNoise = NOISE_PATTERNS.some(pattern => pattern.test(summary));

        if (matchedPatient) {
            cleanAppointments.push({
                patient_id: matchedPatient.id_paciente,
                doctor_id: (event as any).doctor_id,
                summary: summary,
                start_time: event.start?.dateTime || event.start?.date,
                end_time: event.end?.dateTime || event.end?.date,
                original_event_id: event.id,
                source: 'google_calendar',
                status: 'completed',
                type: summary.toLowerCase().includes('control') ? 'control' : 'consulta',
                is_potential_noise: isNoise
            });
            report.push({
                event: summary,
                date: event.start?.dateTime || event.start?.date,
                status: isNoise ? 'matched_with_noise' : 'matched',
                match: matchedPatient.full_name
            });
        } else {
            if (isNoise) {
                report.push({ event: summary, date: event.start?.dateTime || event.start?.date, status: 'noise' });
            } else {
                report.push({
                    event: summary,
                    date: event.start?.dateTime || event.start?.date,
                    status: 'unmatched',
                    match: null
                });
            }
        }
    }

    // 4. Save Results
    fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));
    fs.writeFileSync(CLEAN_APPOINTMENTS_PATH, JSON.stringify(cleanAppointments, null, 2));

    console.log('\n--- Results ---');
    console.log(`Total Events: ${allEvents.length}`);
    console.log(`Noise Filtered: ${report.filter(r => r.status === 'noise').length}`);
    console.log(`Matched Patients: ${report.filter(r => r.status === 'matched').length}`);
    console.log(`Unmatched (Review needed): ${report.filter(r => r.status === 'unmatched').length}`);
    console.log(`\nReport saved to: ${OUTPUT_REPORT_PATH}`);
    console.log(`Clean Appointments saved to: ${CLEAN_APPOINTMENTS_PATH}`);
}

analyzeMigration().catch(console.error);
