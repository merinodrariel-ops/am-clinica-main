'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getUserAppProfile } from '@/app/actions/worker-portal';
import { canManagePresupuestos } from '@/lib/presupuesto-access';
import { AM_REFERENCE_CASES, DEFAULT_CASE_SLUGS } from '@/lib/presupuesto-brand';
import { MAX_PRESUPUESTO_ALTERNATIVES, type PresupuestoPayload, type PresupuestoRecord } from '@/lib/presupuesto-types';

export type { PresupuestoAlternative, PresupuestoPayload, PresupuestoRecord } from '@/lib/presupuesto-types';

async function requireBudgetRole() {
    const profile = await getUserAppProfile();
    if (!canManagePresupuestos(profile?.categoria)) {
        throw new Error('No tenés permisos para acceder a presupuestos.');
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesión requerida.');
    return { user, admin: createAdminClient() };
}

function normalizePayload(input: PresupuestoPayload): PresupuestoPayload {
    return {
        patientName: input.patientName.trim().slice(0, 160),
        intro: input.intro.trim().slice(0, 1200),
        alternatives: input.alternatives.slice(0, MAX_PRESUPUESTO_ALTERNATIVES).map((item) => ({
            title: item.title.trim().slice(0, 120),
            description: item.description.trim().slice(0, 800),
            total: Number.isFinite(item.total) && item.total >= 0 ? item.total : 0,
            currency: item.currency === 'ARS' ? 'ARS' : 'USD',
        })),
        financing: input.financing.trim().slice(0, 800),
        guarantee: input.guarantee.trim().slice(0, 800),
        conditions: input.conditions.trim().slice(0, 1200),
        cta: input.cta.trim().slice(0, 800),
        photoUrls: input.photoUrls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 6),
        caseSlugs: normalizeCaseSlugs(input.caseSlugs),
        financingUpfrontPct: input.financingUpfrontPct === 30 ? 30 : 50,
        financingBaseIndex: normalizeBaseIndex(input.financingBaseIndex, input.alternatives.length),
        financingEnabled: input.financingEnabled !== false,
    };
}

function normalizeCaseSlugs(slugs: string[] | undefined): string[] {
    const known = new Set(AM_REFERENCE_CASES.map((item) => item.slug));
    const clean = (slugs || []).filter((slug) => known.has(slug)).slice(0, 2);
    return clean.length > 0 ? clean : DEFAULT_CASE_SLUGS;
}

function normalizeBaseIndex(index: number | undefined, alternativesCount: number): number {
    if (!Number.isInteger(index) || index === undefined) return 0;
    if (index < 0 || index >= Math.min(alternativesCount, MAX_PRESUPUESTO_ALTERNATIVES)) return 0;
    return index;
}

export async function listPatientPresupuestos(patientId: string): Promise<{ success: boolean; data?: PresupuestoRecord[]; error?: string }> {
    try {
        const { admin } = await requireBudgetRole();
        const { data, error } = await admin.from('paciente_presupuestos').select('id, paciente_id, status, valid_days, issued_at, expires_at, payload, version').eq('paciente_id', patientId).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        return { success: true, data: (data || []) as PresupuestoRecord[] };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudieron cargar los presupuestos.' };
    }
}

export async function createPatientPresupuesto(patientId: string, payload: PresupuestoPayload): Promise<{ success: boolean; data?: PresupuestoRecord; error?: string }> {
    try {
        const { user, admin } = await requireBudgetRole();
        const cleanPayload = normalizePayload(payload);
        const { data, error } = await admin.from('paciente_presupuestos').insert({
            paciente_id: patientId,
            created_by: user.id,
            payload: cleanPayload,
            valid_days: 7,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }).select('id, paciente_id, status, valid_days, issued_at, expires_at, payload, version').single();
        if (error) throw error;
        revalidatePath(`/patients/${patientId}`);
        return { success: true, data: data as PresupuestoRecord };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo crear el presupuesto.' };
    }
}

export async function updatePatientPresupuesto(id: string, patientId: string, payload: PresupuestoPayload): Promise<{ success: boolean; data?: PresupuestoRecord; error?: string }> {
    try {
        await requireBudgetRole();
        const cleanPayload = normalizePayload(payload);
        const { data, error } = await createAdminClient().from('paciente_presupuestos').update({ payload: cleanPayload, updated_at: new Date().toISOString(), version: 1 }).eq('id', id).eq('paciente_id', patientId).select('id, paciente_id, status, valid_days, issued_at, expires_at, payload, version').single();
        if (error) throw error;
        revalidatePath(`/patients/${patientId}`);
        return { success: true, data: data as PresupuestoRecord };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo actualizar el presupuesto.' };
    }
}
