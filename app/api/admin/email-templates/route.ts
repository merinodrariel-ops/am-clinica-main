/**
 * Admin: Email & WhatsApp template preview + test send
 * GET  /api/admin/email-templates?template=X  → { subject, html, whatsapp }
 * POST /api/admin/email-templates             → { template, to } → sends test email
 *
 * Protected: requires owner or admin categoria.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { renderTemplate, AppointmentNotificationContext } from '@/lib/am-scheduler/notification-service';
import { EmailService } from '@/lib/email-service';

// Mock context used for all preview renders
function getMockCtx(templateKey: string): AppointmentNotificationContext {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(11, 0, 0, 0);

    return {
        appointmentId: '00000000-0000-0000-abcd-preview000001',
        templateKey,
        channel: 'both',
        patientName: 'Valentina García',
        patientEmail: 'demo@am-clinica.ar',
        patientPhone: '+5491112345678',
        doctorName: 'Dra. Ana Morales',
        startTime: tomorrow.toISOString(),
        endTime: tomorrowEnd.toISOString(),
        surveyToken: 'token-de-ejemplo-preview',
        clinicName: 'AM Clínica',
    };
}

const ALLOWED_ROLES = ['owner', 'admin', 'developer'];

async function checkAuth() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.categoria)) return null;
    return user;
}

export async function GET(request: Request) {
    const user = await checkAuth();
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const templateKey = searchParams.get('template') ?? '';

    if (!templateKey) {
        // Return list of available templates
        return NextResponse.json({
            notification: [
                'reminder_24h',
                'reminder_1h',
                'appointment_confirmed',
                'appointment_cancelled',
                'survey_post_appointment',
                'birthday_greeting',
                'post_treatment_followup',
                'recall_6_months',
            ],
        });
    }

    const ctx = getMockCtx(templateKey);
    const { subject, html, whatsapp } = renderTemplate(templateKey, ctx);

    return NextResponse.json({ subject, html, whatsapp });
}

export async function POST(request: Request) {
    const user = await checkAuth();
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { template, to } = body as { template: string; to: string };

    if (!template || !to) {
        return NextResponse.json({ error: 'Faltan parámetros: template, to' }, { status: 400 });
    }

    const ctx = getMockCtx(template);
    const { subject, html } = renderTemplate(template, ctx);

    const result = await EmailService.send({
        to,
        subject: `[PREVIEW] ${subject}`,
        html,
    });

    if (!result.success) {
        return NextResponse.json({ success: false, error: (result as any).error?.message || 'Error al enviar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
