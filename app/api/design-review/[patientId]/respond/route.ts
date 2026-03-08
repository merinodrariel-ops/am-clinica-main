import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '';

type Action = 'viewed' | 'approved' | 'revision';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ patientId: string }> }
) {
    const { patientId } = await params;
    const body = await request.json().catch(() => ({}));
    const { token, action, comment } = body as { token: string; action: Action; comment?: string };

    if (!token || !action) {
        return NextResponse.json({ error: 'token y action requeridos' }, { status: 400 });
    }

    // Validar token
    const { data: tokenData } = await admin
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, is_active')
        .eq('token', token)
        .eq('patient_id', patientId)
        .single();

    if (!tokenData || !tokenData.is_active || new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Obtener review activo
    const { data: review } = await admin
        .from('patient_design_reviews')
        .select('id, status, label')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!review) {
        return NextResponse.json({ error: 'Revisión no encontrada' }, { status: 404 });
    }

    // Obtener datos de la paciente
    const { data: patient } = await admin
        .from('pacientes')
        .select('nombre, apellido')
        .eq('id_paciente', patientId)
        .single();

    const patientName = patient ? `${patient.nombre} ${patient.apellido}` : 'La paciente';

    // Actualizar estado
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};

    if (action === 'viewed' && review.status === 'pending') {
        updates.status = 'viewed';
        updates.viewed_at = now;
    } else if (action === 'approved') {
        updates.status = 'approved';
        updates.responded_at = now;
        if (comment) updates.patient_comment = comment;
    } else if (action === 'revision') {
        updates.status = 'revision';
        updates.responded_at = now;
        if (comment) updates.patient_comment = comment;
    }

    if (Object.keys(updates).length > 0) {
        await admin
            .from('patient_design_reviews')
            .update(updates)
            .eq('id', review.id);
    }

    // Notificar (no bloquear la respuesta si falla)
    const shouldNotify = action !== 'viewed' || review.status === 'pending';
    if (shouldNotify) {
        sendNotifications(patientId, patientName, action, comment, review.label).catch(err => {
            console.error('[design-review/respond] Error in notifications:', err);
        });
    }

    return NextResponse.json({ success: true });
}

async function sendNotifications(
    patientId: string,
    patientName: string,
    action: Action,
    comment: string | undefined,
    designLabel: string
) {
    const { data: destinatarios } = await admin
        .from('design_review_destinatarios')
        .select('profile_id, notify_on')
        .eq('is_active', true)
        .contains('notify_on', [action]);

    if (!destinatarios?.length) return;

    const profileIds = destinatarios.map((n: { profile_id: string }) => n.profile_id);
    const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', profileIds);

    if (!profiles?.length) return;

    const actionLabels: Record<Action, string> = {
        viewed: 'vio su diseño por primera vez',
        approved: 'APROBÓ el diseño ✅',
        revision: 'pidió cambios en el diseño ✏️',
    };

    const subject = `${patientName} ${actionLabels[action]}`;
    const fichaUrl = `${APP_URL}/patients/${patientId}`;

    const bodyHtml = `
        <div style="font-family:sans-serif;padding:24px;background:#0a0a0f;color:#fff;border-radius:8px;max-width:500px">
          <h2 style="color:#C9A96E;margin:0 0 16px;font-size:20px">${subject}</h2>
          <p style="color:rgba(255,255,255,0.6);margin:0 0 8px;font-size:14px"><strong>Diseño:</strong> ${designLabel}</p>
          ${comment ? `<p style="color:rgba(255,255,255,0.6);margin:0 0 16px;font-size:14px"><strong>Comentario:</strong> "${comment}"</p>` : ''}
          <a href="${fichaUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#C9A96E;color:#000;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
            Ver ficha del paciente →
          </a>
        </div>
    `;

    for (const profile of profiles) {
        if (!profile.email) continue;
        await resend.emails.send({
            from: 'AM Clínica <notificaciones@am-clinica.ar>',
            to: profile.email,
            subject,
            html: bodyHtml,
        }).catch(err => {
            console.error('[design-review] Error sending email to', profile.email, err);
        });
    }
}
