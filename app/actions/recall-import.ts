
'use server';

import { google } from 'googleapis';
import { createClient } from '@/utils/supabase/server';
import { RecallType } from '@/lib/recall-constants';
import { createRecallRule } from './recalls';

const KEYWORDS: Record<string, RecallType> = {
    'limpieza': 'limpieza',
    'profilaxis': 'limpieza',
    'botox': 'botox',
    'carilla': 'control_carillas',
    'veneer': 'control_carillas',
    'faceta': 'control_carillas',
    'control de carillas': 'control_carillas',
    'control carillas': 'control_carillas',
    'blanqueamiento': 'blanqueamiento',
    'ortodoncia': 'control_ortodoncia',
    'implante': 'mantenimiento_implantes',
};

// Words to ignore when searching for names
const IGNORE_WORDS = ['consultorio', 'agendado', 'turno', 'paciente', 'dr', 'dra', 'cancelado', 'control', 'de', 'con', 'para', 'y', 'en'];

function normalize(str: string) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");
}

export type ScannedEvent = {
    id: string;
    date: string;
    summary: string;
    recallType: RecallType;
    patient?: {
        id: string;
        name: string;
        matchConfidence: 'high' | 'medium';
    };
};

export async function scanCalendarForRecalls() {
    const supabase = await createClient();

    // 1. Fetch Patients
    console.log('Fetching patients from database...');
    const { data: patientsData } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, email, telefono, dni, direccion')
        .eq('is_deleted', false);

    const patients = (patientsData || []).map(p => {
        let score = 0;
        if (p.email) score += 2;
        if (p.telefono) score += 2;
        if (p.dni) score += 1;
        if (p.direccion) score += 1;
        return {
            ...p,
            normVal: normalize((p.nombre || '') + ' ' + (p.apellido || '')),
            normNombre: normalize(p.nombre || ''),
            normApellido: normalize(p.apellido || ''),
            data_score: score
        };
    });

    console.log(`Loaded ${patients.length} patients.`);

    // 2. Setup Google Auth
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        return { success: false, error: 'Credenciales de Google no configuradas.' };
    }

    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // 3. Scan Calendars
    const results: ScannedEvent[] = [];

    try {
        const calList = await calendar.calendarList.list();
        const calendarIds = (calList.data.items || []).map(c => c.id!).filter(id => id);

        // Limit range: Last 2 years to Future (or all time if feasible, but let's stick to 2015 to be safe)
        const startDate = new Date('2015-01-01');

        for (const calId of calendarIds) {
            let pageToken: string | undefined = undefined;

            do {
                const eventsResp: any = await calendar.events.list({
                    calendarId: calId,
                    timeMin: startDate.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 2500,
                    pageToken
                });

                const events = eventsResp.data.items || [];

                for (const event of events) {
                    const summary = event.summary || '';
                    const description = event.description || '';
                    const text = normalize(summary + ' ' + description);

                    // Identify Recall Type
                    let matchedType: RecallType = 'otro';
                    let foundKey = false;
                    for (const [key, type] of Object.entries(KEYWORDS)) {
                        if (text.includes(normalize(key))) {
                            matchedType = type;
                            foundKey = true;
                        }
                    }

                    if (!foundKey) continue; // Skip non-relevant events

                    // Find Patient Match
                    let bestMatch = null;
                    const potentialMatches = patients.filter(p => {
                        const nParts = p.normNombre.split(' ').filter(x => x.length > 2);
                        const aParts = p.normApellido.split(' ').filter(x => x.length > 2);

                        if (nParts.length === 0 || aParts.length === 0) return false;

                        const nameIn = nParts.every(part => text.includes(part));
                        const lastIn = aParts.every(part => text.includes(part));

                        return nameIn && lastIn;
                    });

                    if (potentialMatches.length > 0) {
                        potentialMatches.sort((a, b) => b.data_score - a.data_score);
                        bestMatch = potentialMatches[0];
                    }

                    if (bestMatch) {
                        results.push({
                            id: event.id || Math.random().toString(),
                            date: event.start?.dateTime || event.start?.date || '',
                            summary,
                            recallType: matchedType,
                            patient: {
                                id: bestMatch.id_paciente,
                                name: `${bestMatch.nombre} ${bestMatch.apellido}`,
                                matchConfidence: 'high'
                            }
                        });
                    }
                }

                pageToken = eventsResp.data.nextPageToken || undefined;
            } while (pageToken);
        }

        results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return { success: true, data: results };

    } catch (error: any) {
        console.error('Calendar Scan Error:', error);
        return { success: false, error: error.message };
    }
}

export async function importRecalls(items: ScannedEvent[]) {
    let imported = 0;
    let errors = 0;
    const supabase = await createClient();

    for (const item of items) {
        if (!item.patient) continue;

        // Calculate start date based on event date
        const lastCompletedAt = item.date.split('T')[0];

        // Check for duplicate
        const { data: existing } = await supabase
            .from('recall_rules')
            .select('id')
            .eq('patient_id', item.patient.id)
            .eq('recall_type', item.recallType)
            .eq('last_completed_at', lastCompletedAt)
            .maybeSingle();

        if (existing) continue;

        const res = await createRecallRule({
            patient_id: item.patient.id,
            recall_type: item.recallType,
            last_completed_at: lastCompletedAt,
            notes: `Importado desde Google Calendar. Evento: ${item.summary} (${lastCompletedAt})`,
            priority: 0
        });

        if (res.success) imported++;
        else errors++;
    }

    return { imported, errors };
}
