import { NextRequest, NextResponse } from 'next/server';
import { runAgendaReminderCycle } from '@/lib/am-scheduler/reminder-cycle';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('Authorization') ?? req.headers.get('x-cron-secret');
  return header === `Bearer ${secret}` || header === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await runAgendaReminderCycle({ dryRun: req.nextUrl.searchParams.get('dryRun') === '1' });
    return NextResponse.json({
      ok: result.failed.length === 0, at: result.at, dryRun: result.dryRun,
      dispatched: result.dispatched.length, failed: result.failed.length,
      autoCompleted: result.autoCompleted.length, surveys: result.surveys,
      ids: { dispatched: result.dispatched, failed: result.failed, autoCompleted: result.autoCompleted },
      warnings: result.warnings,
    }, { status: result.failed.length ? 500 : 200 });
  } catch {
    return NextResponse.json({ error: 'Reminder cycle failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return POST(req); }
