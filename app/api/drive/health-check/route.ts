import { NextRequest, NextResponse } from 'next/server';
import { runDriveHealthCheckAction, getLatestDriveHealthChecksAction } from '@/app/actions/drive-health';

function authorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    const header = req.headers.get('Authorization') ?? req.headers.get('x-cron-secret');
    return header === `Bearer ${secret}` || header === secret;
}

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const sampleLimit = Number(payload?.sampleLimit || 20);

    const result = await runDriveHealthCheckAction({
        sampleLimit,
        persist: true,
        source: 'cron',
    });

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: result.data });
}

export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV !== 'development' && !authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 5);
    const result = await getLatestDriveHealthChecksAction(limit);

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: result.data });
}
