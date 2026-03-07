import { NextResponse } from 'next/server';
import { listPublicDoctors, normalizeBookingMode } from '@/lib/public-booking';

import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const mode = normalizeBookingMode(request.nextUrl.searchParams.get('mode') || undefined);
        const doctors = await listPublicDoctors(mode);
        return NextResponse.json({ success: true, doctors });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los profesionales';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
