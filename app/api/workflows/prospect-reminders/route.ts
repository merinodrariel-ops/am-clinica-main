import { NextRequest, NextResponse } from 'next/server';
import { runProspectReengagementReminders } from '@/app/actions/prospects';

/**
 * POST /api/workflows/prospect-reminders
 *
 * Daily cron endpoint — scans all active prospects and fires
 * re-engagement emails/WhatsApp scripts when stage SLAs are exceeded.
 *
 * Auth: Bearer token via WORKFLOWS_CRON_SECRET env var.
 *
 * Designed to be called from Vercel Cron (vercel.json):
 *   { "path": "/api/workflows/prospect-reminders", "schedule": "0 9 * * *" }
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || token !== process.env.WORKFLOWS_CRON_SECRET) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const result = await runProspectReengagementReminders();
        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Prospect reminders cron error:', error);
        return NextResponse.json(
            { error: 'Error interno al procesar recordatorios de prospectos' },
            { status: 500 }
        );
    }
}

// Allow GET for manual testing in dev
export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Solo disponible en desarrollo' }, { status: 403 });
    }
    return POST(request);
}
