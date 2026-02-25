/**
 * deep_calendar_analysis.ts
 *
 * Análisis profundo de todos los calendarios de Google Calendar.
 * Extrae estadísticas, patrones, pacientes potenciales y oportunidades.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/deep_calendar_analysis.ts
 *
 * Output:
 *   scripts/output/calendar_report.json  — datos crudos completos
 *   scripts/output/calendar_summary.txt  — resumen legible en consola
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// ── Env ────────────────────────────────────────────────────────────────────────
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
                const match = line.match(/^([^#=][^=]*)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const val = match[2].trim().replace(/^["']|["']$/g, '');
                    process.env[key] = val;
                }
            });
        }
    } catch { /* ignore */ }
}
loadEnv();

// ── Clasificación de tratamientos ─────────────────────────────────────────────
const TREATMENT_MAP: Record<string, string> = {
    'limpieza': 'Limpieza Dental',
    'profilaxis': 'Limpieza Dental',
    'destartrazacion': 'Limpieza Dental',
    'botox': 'Botox / Estética Facial',
    'relleno': 'Botox / Estética Facial',
    'acido hialuronico': 'Botox / Estética Facial',
    'carilla': 'Carillas / Diseño de Sonrisa',
    'veneer': 'Carillas / Diseño de Sonrisa',
    'faceta': 'Carillas / Diseño de Sonrisa',
    'diseño de sonrisa': 'Carillas / Diseño de Sonrisa',
    'diseno de sonrisa': 'Carillas / Diseño de Sonrisa',
    'cementado': 'Carillas / Diseño de Sonrisa',
    'blanqueamiento': 'Blanqueamiento',
    'whitening': 'Blanqueamiento',
    'ortodoncia': 'Ortodoncia',
    'alineador': 'Ortodoncia',
    'invisalign': 'Ortodoncia',
    'brackets': 'Ortodoncia',
    'implante': 'Implantes',
    'cirugia': 'Cirugía',
    'extraccion': 'Cirugía',
    'perio': 'Periodoncia',
    'conducto': 'Endodoncia',
    'endodoncia': 'Endodoncia',
    'corona': 'Prótesis',
    'protesis': 'Prótesis',
    'puente': 'Prótesis',
    'consulta': 'Consulta',
    'primera vez': 'Consulta',
    'control': 'Control',
    'seguimiento': 'Control',
    'rx': 'Diagnóstico',
    'radiografia': 'Diagnóstico',
    'cbct': 'Diagnóstico',
    'tomografia': 'Diagnóstico',
};

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function norm(s: string) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'');
}

function classify(summary: string, desc: string): string {
    const t = norm(summary + ' ' + desc);
    for (const [kw, label] of Object.entries(TREATMENT_MAP)) {
        if (t.includes(norm(kw))) return label;
    }
    return 'Otros';
}

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface EventRecord {
    calendarName: string;
    date: string;
    yearMonth: string;
    year: number;
    month: number;
    dayOfWeek: number;
    hour: number;
    summary: string;
    description: string;
    organizer: string;
    attendees: string[];
    treatment: string;
    isAllDay: boolean;
    status: string;
    duration_min: number;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey  = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        console.error('❌  Faltan credenciales de Google Service Account en .env.local');
        process.exit(1);
    }

    console.log('🔐  Autenticando con service account:', clientEmail);

    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // IDs de calendarios conocidos y compartidos con el service account
    const KNOWN_CALENDAR_IDS = [
        '51baf8adafc7d1e2e6508a1dea9f9dbc8ec238852a6d1639039c388cdbcbdb6a@group.calendar.google.com',
        'drarielmerino@gmail.com',
    ];

    // 1. Asegurar que los calendarios estén en la lista del service account
    console.log('\n📅  Verificando acceso a calendarios...');
    for (const id of KNOWN_CALENDAR_IDS) {
        try {
            await calendar.calendarList.insert({ requestBody: { id } });
        } catch { /* ya existe o sin acceso */ }
    }

    const calListResp = await calendar.calendarList.list();
    const calendars = (calListResp.data.items || []);

    if (!calendars.length) {
        console.error('❌  No hay calendarios accesibles. Compartí los calendarios con:', clientEmail);
        process.exit(1);
    }

    console.log(`✅  ${calendars.length} calendarios encontrados:`);
    calendars.forEach(c => console.log(`   · ${c.summary} (${c.accessRole})`));

    // 2. Recolectar eventos desde 2020
    console.log('\n🔍  Escaneando eventos desde 2020...');
    const timeMin = new Date('2020-01-01T00:00:00Z').toISOString();
    const timeMax = new Date().toISOString();

    const allEvents: EventRecord[] = [];

    for (const cal of calendars) {
        if (!cal.id) continue;
        console.log(`   Escaneando: ${cal.summary}...`);
        let pageToken: string | undefined;
        let calCount = 0;

        do {
            const resp = await calendar.events.list({
                calendarId: cal.id,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 2500,
                pageToken,
            });

            for (const ev of resp.data.items || []) {
                if (ev.status === 'cancelled') continue;

                const startRaw = ev.start?.dateTime || ev.start?.date;
                if (!startRaw) continue;

                const date    = new Date(startRaw);
                const endRaw  = ev.end?.dateTime || ev.end?.date;
                const endDate = endRaw ? new Date(endRaw) : date;
                const isAllDay = !ev.start?.dateTime;
                const duration_min = isAllDay ? 0 : Math.round((endDate.getTime() - date.getTime()) / 60000);

                allEvents.push({
                    calendarName: cal.summary || cal.id,
                    date:        startRaw,
                    yearMonth:   `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`,
                    year:        date.getFullYear(),
                    month:       date.getMonth(),
                    dayOfWeek:   date.getDay(),
                    hour:        date.getHours(),
                    summary:     ev.summary || '',
                    description: ev.description || '',
                    organizer:   ev.organizer?.email || '',
                    attendees:   (ev.attendees || []).map((a: any) => a.email).filter(Boolean),
                    treatment:   classify(ev.summary || '', ev.description || ''),
                    isAllDay,
                    status:      ev.status || 'confirmed',
                    duration_min,
                });
                calCount++;
            }

            pageToken = resp.data.nextPageToken ?? undefined;
        } while (pageToken);

        console.log(`      → ${calCount} eventos`);
    }

    console.log(`\n📊  Total eventos recolectados: ${allEvents.length}`);

    // ── Análisis ────────────────────────────────────────────────────────────────
    const appointmentEvents = allEvents.filter(e => !e.isAllDay);

    // Por mes
    const byMonthMap: Record<string, number> = {};
    for (const e of appointmentEvents) {
        byMonthMap[e.yearMonth] = (byMonthMap[e.yearMonth] || 0) + 1;
    }
    const byMonth = Object.entries(byMonthMap)
        .sort((a,b) => a[0].localeCompare(b[0]))
        .map(([ym, count]) => {
            const [y, m] = ym.split('-');
            return { yearMonth: ym, label: `${MONTHS_ES[parseInt(m)-1]} ${y}`, count };
        });

    // Por tipo de tratamiento
    const byTreatment: Record<string, number> = {};
    for (const e of appointmentEvents) {
        byTreatment[e.treatment] = (byTreatment[e.treatment] || 0) + 1;
    }

    // Por día de la semana
    const byDayOfWeek: Record<string, number> = {};
    DAYS_ES.forEach(d => byDayOfWeek[d] = 0);
    for (const e of appointmentEvents) {
        byDayOfWeek[DAYS_ES[e.dayOfWeek]]++;
    }

    // Por franja horaria
    const byHour: Record<string, number> = {};
    for (const e of appointmentEvents) {
        if (e.hour === 0) continue;
        const label = `${String(e.hour).padStart(2,'0')}:00`;
        byHour[label] = (byHour[label] || 0) + 1;
    }

    // Por año
    const byYear: Record<number, number> = {};
    for (const e of appointmentEvents) {
        byYear[e.year] = (byYear[e.year] || 0) + 1;
    }

    // Por calendario
    const byCalendar: Record<string, number> = {};
    for (const e of appointmentEvents) {
        byCalendar[e.calendarName] = (byCalendar[e.calendarName] || 0) + 1;
    }

    // Duración promedio por tipo
    const durationByType: Record<string, number[]> = {};
    for (const e of appointmentEvents) {
        if (e.duration_min > 0 && e.duration_min < 480) {
            if (!durationByType[e.treatment]) durationByType[e.treatment] = [];
            durationByType[e.treatment].push(e.duration_min);
        }
    }
    const avgDurationByType: Record<string, number> = {};
    for (const [type, durations] of Object.entries(durationByType)) {
        avgDurationByType[type] = Math.round(durations.reduce((a,b) => a+b, 0) / durations.length);
    }

    // Palabras únicas en summaries (para detectar nombres de pacientes potenciales)
    const uniqueSummaries = [...new Set(appointmentEvents.map(e => e.summary))];

    // Emails únicos de attendees
    const uniqueAttendeeEmails = [...new Set(appointmentEvents.flatMap(e => e.attendees))].filter(Boolean);

    // Picos
    const peakDay   = Object.entries(byDayOfWeek).sort((a,b) => b[1]-a[1])[0];
    const peakHour  = Object.entries(byHour).sort((a,b) => b[1]-a[1])[0];
    const peakType  = Object.entries(byTreatment).sort((a,b) => b[1]-a[1])[0];
    const peakMonth = [...byMonth].sort((a,b) => b.count-a.count)[0];
    const avgPerMonth = byMonth.length ? Math.round(appointmentEvents.length / byMonth.length) : 0;

    // Últimos 12 meses
    const last12Months = byMonth.slice(-12);
    const last12Total  = last12Months.reduce((s,m) => s+m.count, 0);

    // ── Output ──────────────────────────────────────────────────────────────────
    const outputDir = path.resolve(process.cwd(), 'scripts/output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const report = {
        generatedAt: new Date().toISOString(),
        calendars: calendars.map(c => ({ name: c.summary, id: c.id, role: c.accessRole })),
        totalEvents: allEvents.length,
        appointmentEvents: appointmentEvents.length,
        uniqueAttendeeEmails: uniqueAttendeeEmails.length,
        uniqueSummaryTitles: uniqueSummaries.length,
        byMonth,
        byTreatment,
        byDayOfWeek,
        byHour,
        byYear,
        byCalendar,
        avgDurationByType,
        highlights: {
            peakDay:      peakDay   ? { day: peakDay[0],   count: peakDay[1]   } : null,
            peakHour:     peakHour  ? { hour: peakHour[0], count: peakHour[1]  } : null,
            peakType:     peakType  ? { type: peakType[0], count: peakType[1]  } : null,
            peakMonth:    peakMonth ?? null,
            avgPerMonth,
            last12Total,
        },
        rawEvents: appointmentEvents,  // todos los eventos para importación
        attendeeEmails: uniqueAttendeeEmails,
    };

    const reportPath = path.join(outputDir, 'calendar_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // ── Resumen en consola ──────────────────────────────────────────────────────
    const sep = '─'.repeat(60);
    console.log('\n' + sep);
    console.log('  📋  ANÁLISIS COMPLETO DE CALENDARIOS — AM CLÍNICA');
    console.log(sep);
    console.log(`  Calendarios escaneados : ${calendars.length}`);
    console.log(`  Eventos totales        : ${allEvents.length}`);
    console.log(`  Turnos con horario     : ${appointmentEvents.length}`);
    console.log(`  Emails únicos          : ${uniqueAttendeeEmails.length}`);
    console.log(`  Títulos únicos         : ${uniqueSummaries.length}`);

    console.log('\n  📆  EVOLUCIÓN ANUAL');
    Object.entries(byYear).sort().forEach(([y, c]) => {
        const bar = '█'.repeat(Math.round(c / 10));
        console.log(`     ${y}: ${bar} ${c}`);
    });

    console.log('\n  🏥  TOP TRATAMIENTOS');
    Object.entries(byTreatment).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([t, c]) => {
        const pct = Math.round(c / appointmentEvents.length * 100);
        console.log(`     ${t.padEnd(35)} ${c.toString().padStart(5)}  (${pct}%)`);
    });

    console.log('\n  📅  DÍAS MÁS ACTIVOS');
    Object.entries(byDayOfWeek).sort((a,b) => b[1]-a[1]).forEach(([d, c]) => {
        const bar = '▓'.repeat(Math.round(c / 10));
        console.log(`     ${d.padEnd(12)} ${bar} ${c}`);
    });

    console.log('\n  🕐  FRANJAS HORARIAS PICO');
    Object.entries(byHour).sort((a,b) => b[1]-a[1]).slice(0, 8).forEach(([h, c]) => {
        const bar = '▪'.repeat(Math.round(c / 5));
        console.log(`     ${h}  ${bar} ${c}`);
    });

    console.log('\n  ⭐  HIGHLIGHTS');
    console.log(`     Día más ocupado     : ${peakDay?.[0]} (${peakDay?.[1]} turnos)`);
    console.log(`     Franja pico         : ${peakHour?.[0]} (${peakHour?.[1]} turnos)`);
    console.log(`     Tratamiento #1      : ${peakType?.[0]} (${peakType?.[1]} veces)`);
    console.log(`     Mes récord          : ${peakMonth?.label} (${peakMonth?.count} turnos)`);
    console.log(`     Promedio mensual    : ${avgPerMonth} turnos`);
    console.log(`     Últimos 12 meses    : ${last12Total} turnos en total`);

    if (avgDurationByType['Consulta'] || avgDurationByType['Limpieza Dental']) {
        console.log('\n  ⏱   DURACIÓN PROMEDIO POR TIPO');
        Object.entries(avgDurationByType).sort((a,b) => b[1]-a[1]).forEach(([t, m]) => {
            console.log(`     ${t.padEnd(35)} ${m} min`);
        });
    }

    console.log('\n  📧  OPORTUNIDADES');
    if (uniqueAttendeeEmails.length > 0) {
        console.log(`     → ${uniqueAttendeeEmails.length} emails de pacientes detectados en los attendees`);
        console.log('       (se pueden cruzar con la DB para encontrar pacientes sin perfil)');
    }
    console.log(`     → ${uniqueSummaries.length} títulos únicos de eventos`);
    console.log('       (revisar calendar_report.json → uniqueSummaryTitles para ver nombres)');

    console.log('\n' + sep);
    console.log(`  ✅  Reporte guardado en: scripts/output/calendar_report.json`);
    console.log(sep + '\n');
}

main().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
