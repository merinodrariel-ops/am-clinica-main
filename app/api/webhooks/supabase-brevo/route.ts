/**
 * POST /api/webhooks/supabase-brevo
 *
 * Triggered by Supabase Database Webhook on INSERT to public.pacientes.
 * Adds the new patient to Brevo list ID 3 ("AM Estética Dental - Pacientes AR")
 * if they have a valid email address.
 *
 * Supabase setup (Dashboard → Database → Webhooks → Create):
 *   Table: public.pacientes
 *   Events: INSERT
 *   HTTP Method: POST
 *   URL: https://<your-domain>/api/webhooks/supabase-brevo
 *   Headers: { "x-webhook-secret": "<SUPABASE_BREVO_WEBHOOK_SECRET>" }
 */

import { NextRequest, NextResponse } from 'next/server';

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const BREVO_LIST_ID = 3;
const WEBHOOK_SECRET = process.env.SUPABASE_BREVO_WEBHOOK_SECRET;

interface PacienteRecord {
  id_paciente: string;
  nombre: string;
  apellido: string;
  email: string | null;
  whatsapp: string | null;
  is_deleted: boolean;
}

interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: PacienteRecord;
  old_record: PacienteRecord | null;
}

export async function POST(req: NextRequest) {
  // Validate webhook secret if configured
  if (WEBHOOK_SECRET) {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, record } = payload;

  // Only handle INSERTs with a valid email
  if (type !== 'INSERT') {
    return NextResponse.json({ skipped: 'not an INSERT' });
  }

  const email = record.email?.trim().toLowerCase();
  if (!email || !email.includes('@') || record.is_deleted) {
    return NextResponse.json({ skipped: 'no valid email or deleted' });
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        attributes: {
          NOMBRE: record.nombre,
          APELLIDO: record.apellido,
        },
        listIds: [BREVO_LIST_ID],
        updateEnabled: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[brevo-sync] failed to add contact:', err);
      return NextResponse.json({ error: err }, { status: 502 });
    }

    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error('[brevo-sync] unexpected error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
