/**
 * GET /api/calendar/stats
 *
 * Extrae y agrega estadísticas de turnos desde Google Calendar.
 *
 * Query params:
 *   months=12   → cuántos meses hacia atrás analizar (default 12, max 36)
 *
 * Retorna:
 *   - turnos por mes (últimos N meses)
 *   - distribución por tipo de tratamiento
 *   - días de la semana más activos
 *   - franjas horarias más demandadas
 *   - total de eventos encontrados
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';
import { google } from 'googleapis';

// Mapeo de palabras clave a tipo de tratamiento (para estadísticas)
const TREATMENT_KEYWORDS: Record<string, string> = {
    'limpieza': 'Limpieza Dental',
    'profilaxis': 'Limpieza Dental',
    'botox': 'Botox',
    'carilla': 'Carillas / Diseño',
    'veneer': 'Carillas / Diseño',
    'faceta': 'Carillas / Diseño',
    'diseño de sonrisa': 'Carillas / Diseño',
    'diseno de sonrisa': 'Carillas / Diseño',
    'blanqueamiento': 'Blanqueamiento',
    'ortodoncia': 'Ortodoncia',
    'alineador': 'Ortodoncia',
    'invisalign': 'Ortodoncia',
    'implante': 'Implantes',
    'cirugia': 'Implantes / Cirugía',
    'extraccion': 'Cirugía Menor',
    'conducto': 'Endodoncia',
    'endodoncia': 'Endodoncia',
    'corona': 'Prótesis',
    'protesis': 'Prótesis',
    'consulta': 'Consulta',
    'control': 'Control',
    'rx': 'Diagnóstico',
    'radiografia': 'Diagnóstico',
    'cbct': 'Diagnóstico',
};

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function normalize(str: string) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
}

function classifyEvent(summary: string, description: string): string {
    const text = normalize(summary + ' ' + description);
    for (const [keyword, label] of Object.entries(TREATMENT_KEYWORDS)) {
        if (text.includes(normalize(keyword))) return label;
    }
    return 'Otros';
}

export async function GET(request: NextRequest) {
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthsBack = Math.min(36, Math.max(1, parseInt(searchParams.get('months') || '12', 10)));

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        return NextResponse.json(
            { error: 'Google Service Account no configurado.' },
            { status: 503 }
        );
    }

    const gAuth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth: gAuth });

    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - monthsBack);
    timeMin.setHours(0, 0, 0, 0);

    const timeMax = new Date(); // hasta hoy

    try {
        // Obtener todos los calendarios accesibles
        const calList = await calendar.calendarList.list();
        const calendarIds = (calList.data.items || []).map(c => c.id!).filter(Boolean);

        if (calendarIds.length === 0) {
            return NextResponse.json({
                error: 'No hay calendarios compartidos con la cuenta de servicio.',
                hint: `Compartí tu calendario con ${clientEmail} desde la configuración de Google Calendar.`,
                byMonth: [],
                byType: {},
                byDayOfWeek: {},
                byHour: {},
                total: 0,
            });
        }

        // Recolectar todos los eventos
        interface CalEvent {
            date: Date;
            yearMonth: string; // "2025-03"
            dayOfWeek: number;
            hour: number;
            type: string;
            summary: string;
        }

        const allEvents: CalEvent[] = [];

        for (const calId of calendarIds) {
            let pageToken: string | undefined;
            do {
                const resp = await calendar.events.list({
                    calendarId: calId,
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 2500,
                    pageToken,
                });

                for (const event of resp.data.items || []) {
                    // Ignorar eventos de todo el día sin hora específica si se prefiere
                    const startRaw = event.start?.dateTime || event.start?.date;
                    if (!startRaw) continue;

                    const date = new Date(startRaw);
                    if (isNaN(date.getTime())) continue;

                    // Ignorar eventos marcados como cancelados
                    if (event.status === 'cancelled') continue;

                    const summary = event.summary || '';
                    const description = event.description || '';
                    const type = classifyEvent(summary, description);

                    allEvents.push({
                        date,
                        yearMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                        dayOfWeek: date.getDay(),
                        hour: date.getHours(),
                        type,
                        summary,
                    });
                }

                pageToken = resp.data.nextPageToken ?? undefined;
            } while (pageToken);
        }

        // ── Agregaciones ──────────────────────────────────────────────────────

        // 1. Por mes — generar todos los meses en el rango aunque no haya eventos
        const byMonthMap: Record<string, number> = {};
        for (let i = monthsBack - 1; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            byMonthMap[key] = 0;
        }
        for (const e of allEvents) {
            if (e.yearMonth in byMonthMap) byMonthMap[e.yearMonth]++;
        }

        const byMonth = Object.entries(byMonthMap).map(([ym, count]) => {
            const [year, month] = ym.split('-');
            return {
                yearMonth: ym,
                label: `${MONTHS_ES[parseInt(month) - 1]} ${year}`,
                count,
            };
        });

        // 2. Por tipo de tratamiento
        const byType: Record<string, number> = {};
        for (const e of allEvents) {
            byType[e.type] = (byType[e.type] || 0) + 1;
        }

        // 3. Por día de la semana (0=Dom … 6=Sáb)
        const byDayOfWeek: Record<string, number> = {};
        for (let i = 0; i <= 6; i++) byDayOfWeek[DAYS_ES[i]] = 0;
        for (const e of allEvents) {
            byDayOfWeek[DAYS_ES[e.dayOfWeek]]++;
        }

        // 4. Por franja horaria (solo eventos con hora específica)
        const byHour: Record<string, number> = {};
        for (const e of allEvents) {
            if (e.hour === 0 && e.date.getMinutes() === 0) continue; // skip all-day
            const label = `${String(e.hour).padStart(2, '0')}:00`;
            byHour[label] = (byHour[label] || 0) + 1;
        }

        // 5. Día pico
        const peakDay = Object.entries(byDayOfWeek).sort((a, b) => b[1] - a[1])[0];
        const peakType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
        const peakMonth = [...byMonth].sort((a, b) => b.count - a.count)[0];

        return NextResponse.json({
            success: true,
            analyzedMonths: monthsBack,
            calendarsScanned: calendarIds.length,
            total: allEvents.length,
            byMonth,
            byType,
            byDayOfWeek,
            byHour,
            highlights: {
                peakDay: peakDay ? { day: peakDay[0], count: peakDay[1] } : null,
                peakType: peakType ? { type: peakType[0], count: peakType[1] } : null,
                peakMonth: peakMonth ?? null,
                avgPerMonth: byMonth.length > 0
                    ? Math.round(allEvents.length / byMonth.length)
                    : 0,
            },
        });

    } catch (error) {
        console.error('Calendar stats error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
