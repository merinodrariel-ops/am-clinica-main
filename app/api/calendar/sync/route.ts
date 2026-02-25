/**
 * POST /api/calendar/sync
 *
 * Escanea todos los calendarios de Google conectados a la cuenta de servicio,
 * identifica eventos relevantes (limpiezas, botox, carillas, etc.),
 * los cruza con pacientes de la DB y opcionalmente importa recalls.
 *
 * Body JSON:
 *   { "autoImport": true }  → escanea e importa automáticamente
 *   { "autoImport": false } → solo escanea y devuelve resultados (preview)
 *
 * Headers requeridos:
 *   Authorization: Bearer <CRON_SECRET>  (o sesión activa de admin/owner)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';
import { scanCalendarForRecalls, importRecalls } from '@/app/actions/recall-import';

export async function POST(request: NextRequest) {
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    let autoImport = false;
    try {
        const body = await request.json().catch(() => ({}));
        autoImport = Boolean(body?.autoImport);
    } catch {
        // default: only scan
    }

    // 1. Scan calendars
    const scanResult = await scanCalendarForRecalls();

    if (!scanResult.success) {
        return NextResponse.json(
            { success: false, error: scanResult.error },
            { status: 500 }
        );
    }

    const events = scanResult.data ?? [];

    // 2. Optionally import
    if (autoImport && events.length > 0) {
        const importResult = await importRecalls(events);
        return NextResponse.json({
            success: true,
            mode: 'scan_and_import',
            scanned: events.length,
            imported: importResult.imported,
            errors: importResult.errors,
            events,
        });
    }

    // 3. Preview only
    return NextResponse.json({
        success: true,
        mode: 'scan_only',
        scanned: events.length,
        events,
    });
}

/**
 * GET /api/calendar/sync
 * Verifica el estado de conexión del calendario sin escanear eventos.
 */
export async function GET(request: NextRequest) {
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { google } = await import('googleapis');

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        return NextResponse.json({
            connected: false,
            error: 'GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no configurados.',
            serviceAccountEmail: null,
            calendars: [],
        });
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        });

        const calendar = google.calendar({ version: 'v3', auth });
        const calList = await calendar.calendarList.list();
        const calendars = (calList.data.items || []).map(c => ({
            id: c.id,
            name: c.summary,
            primary: c.primary ?? false,
            accessRole: c.accessRole,
        }));

        return NextResponse.json({
            connected: true,
            serviceAccountEmail: clientEmail,
            calendarsCount: calendars.length,
            calendars,
            setupInstructions: calendars.length === 0
                ? `Para conectar tu calendario: andá a Google Calendar → Configuración de tu calendario → "Compartir con personas específicas" → agregá ${clientEmail} con rol "Ver todos los detalles del evento".`
                : null,
        });
    } catch (error) {
        return NextResponse.json({
            connected: false,
            serviceAccountEmail: clientEmail,
            error: error instanceof Error ? error.message : String(error),
            calendars: [],
        });
    }
}
