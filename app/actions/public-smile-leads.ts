'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';

type CaptureSmileLeadInput = {
    fullName: string;
    email: string;
    whatsapp?: string;
    photoName?: string;
};

function normalizeText(value?: string) {
    return (value || '').trim();
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function capturePublicSmileLead(input: CaptureSmileLeadInput) {
    const fullName = normalizeText(input.fullName);
    const email = normalizeText(input.email).toLowerCase();
    const whatsapp = normalizeText(input.whatsapp);

    if (fullName.length < 2) {
        return { success: false, error: 'Ingresá tu nombre.' };
    }

    if (!isValidEmail(email)) {
        return { success: false, error: 'Ingresá un email válido.' };
    }

    const headerStore = await headers();
    const userAgent = headerStore.get('user-agent') || null;
    const referrer = headerStore.get('referer') || null;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('marketing_leads')
        .insert({
            origin: 'web_form_amesteticadental',
            full_name: fullName,
            email,
            whatsapp: whatsapp || null,
            status: 'new',
            lead_score: 85,
            interest_tags: ['diseno_sonrisa', 'carillas', 'simulador_ia'],
            metadata: {
                source: 'simulador_sonrisa_web',
                photoName: input.photoName || null,
                consent: true,
                referrer,
                userAgent,
                capturedAt: new Date().toISOString(),
                note: 'Lead capturado antes de generar simulacion. No se guarda la foto en esta accion.',
            },
            notes: 'Lead generado desde MVP público de simulador de sonrisa con IA.',
        })
        .select('id')
        .single();

    if (error) {
        console.error('[public-smile-leads] insert error:', error);
        return { success: false, error: 'No pudimos guardar tus datos. Intentá de nuevo.' };
    }

    return { success: true, leadId: data?.id as string | undefined };
}
