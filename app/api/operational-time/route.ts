import { NextResponse } from 'next/server';
import { AM_OPERATING_TIME_ZONE, getLocalISODate, getOperationalNow } from '@/lib/local-date';

export const dynamic = 'force-dynamic';

export async function GET() {
    const now = getOperationalNow();
    return NextResponse.json(
        {
            now: now.toISOString(),
            date: getLocalISODate(now),
            timeZone: AM_OPERATING_TIME_ZONE,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
}
