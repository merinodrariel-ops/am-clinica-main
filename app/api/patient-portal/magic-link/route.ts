import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendEmail } from '@/lib/nodemailer';
import { generatePatientMagicLinkEmail } from '@/lib/email-templates';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

function getPublicUrl() {
    const url = process.env.NEXT_PUBLIC_APP_URL;
    if (url && !url.includes('localhost')) return url.replace(/\/$/, '');
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'https://am-clinica-main.vercel.app';
}

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Look up patient by email
        const { data: patient, error: patientError } = await supabaseAdmin
            .from('pacientes')
            .select('id_paciente, nombre, apellido, email')
            .ilike('email', normalizedEmail)
            .single();

        if (patientError || !patient) {
            // Return generic success to avoid email enumeration
            return NextResponse.json({ success: true });
        }

        // 2. Generate a secure token (32 random bytes → 64 hex chars)
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

        // 3. Upsert token in patient_portal_tokens table
        const { error: tokenError } = await supabaseAdmin
            .from('patient_portal_tokens')
            .upsert(
                {
                    patient_id: patient.id_paciente,
                    token,
                    expires_at: expiresAt,
                    used: false,
                },
                { onConflict: 'patient_id' }
            );

        if (tokenError) {
            console.error('Token upsert error:', tokenError);
            return NextResponse.json({ error: 'Error interno' }, { status: 500 });
        }

        // 4. Build magic link URL
        const portalUrl = `${getPublicUrl()}/mi-clinica/${token}`;
        const nombre = patient.nombre || 'Paciente';

        // 5. Send email
        console.log(`[MagicLink] Attempting to send magic link to: ${patient.email}`);
        const emailResult = await sendEmail({
            to: patient.email,
            subject: `Tu acceso seguro a AM Clínica – ${nombre}`,
            html: generatePatientMagicLinkEmail(nombre, portalUrl),
        });
        console.log(`[MagicLink] Email result for ${patient.email}:`, emailResult);

        if (!emailResult.success) {
            console.error('[MagicLink] Email send failure:', emailResult.error);
            return NextResponse.json({ error: 'No se pudo enviar el email' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Magic link error:', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
