import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDoctorAgendas } from '@/lib/doctor-daily-agenda-notifications';
import { getLocalISODate } from '@/lib/local-date';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get('Authorization') ?? req.headers.get('x-cron-secret');
  return header === `Bearer ${secret}` || header === secret;
}

async function handler(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get('date') || getLocalISODate();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Fecha inválida. Usar YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const result = await sendDailyDoctorAgendas(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[daily-summary] failed:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error enviando agenda diaria',
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
