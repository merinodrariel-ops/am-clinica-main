/**
 * POST /api/agenda/checkin
 *
 * Records a patient physical check-in at reception.
 * Used by the Sala de Espera Virtual dashboard.
 *
 * Body: { appointmentId: string }
 * Auth: session cookie (authenticated staff only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { appointmentId?: string };
  const { appointmentId } = body;

  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('agenda_appointments')
    .update({
      checked_in_at: new Date().toISOString(),
      status:        'arrived',
    })
    .eq('id', appointmentId)
    .in('status', ['confirmed', 'pending']); // Only update if hasn't started yet

  if (error) {
    console.error('[CheckIn] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checkedInAt: new Date().toISOString() });
}

/**
 * PATCH /api/agenda/checkin
 * Update appointment status from the waiting room
 * Body: { appointmentId: string, status: string }
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { appointmentId?: string; status?: string };
  const { appointmentId, status } = body;

  if (!appointmentId || !status) {
    return NextResponse.json({ error: 'appointmentId and status required' }, { status: 400 });
  }

  const allowed = ['arrived', 'in_progress', 'completed', 'cancelled', 'no_show'];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  // Auto-set checked_in_at if transitioning to 'arrived'
  if (status === 'arrived') {
    updates.checked_in_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('agenda_appointments')
    .update(updates)
    .eq('id', appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
