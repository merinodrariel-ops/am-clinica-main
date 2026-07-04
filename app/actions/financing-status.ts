'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
    buildFinancingStatusMessage,
    getFinancingStatusSummary,
    type FinancingStatusInput,
    type FinancingStatusSummary,
} from '@/lib/caja-recepcion/financing-status-message';

export interface FinancingStatusActionResult {
    success: boolean;
    error?: string;
    summary?: FinancingStatusSummary;
    message?: string;
}

const ALLOWED_CATEGORIES = new Set(['owner', 'admin', 'reception', 'recepcion']);

function asNumber(value: unknown) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategoria(value?: string | null) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

export async function getFinancingStatusForMovementAction(movementId: string): Promise<FinancingStatusActionResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'No autenticado' };
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError || !ALLOWED_CATEGORIES.has(normalizeCategoria(profile?.categoria))) {
        return { success: false, error: 'Acceso denegado' };
    }

    const admin = createAdminClient();

    const { data: movement, error: movementError } = await admin
        .from('caja_recepcion_movimientos')
        .select('id, paciente_id, cuota_nro, cuotas_total, usd_equivalente, monto, moneda, fecha_movimiento, fecha_hora')
        .eq('id', movementId)
        .maybeSingle();

    if (movementError) {
        return { success: false, error: movementError.message };
    }

    if (!movement) {
        return { success: false, error: 'No se encontró el movimiento.' };
    }

    const pacienteId = String(movement.paciente_id || '');
    if (!pacienteId) {
        return { success: false, error: 'El movimiento no tiene paciente asociado.' };
    }

    const [{ data: patient, error: patientError }, { data: plans, error: plansError }] = await Promise.all([
        admin
            .from('pacientes')
            .select('id_paciente, nombre, apellido, saldo_a_favor_usd')
            .eq('id_paciente', pacienteId)
            .maybeSingle(),
        admin
            .from('planes_financiacion')
            .select('id, paciente_id, paciente_nombre, tratamiento, cuotas_total, cuotas_pagadas, monto_cuota_usd, saldo_restante_usd, estado, updated_at, created_at')
            .eq('paciente_id', pacienteId)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1),
    ]);

    if (patientError) {
        return { success: false, error: patientError.message };
    }

    if (plansError) {
        return { success: false, error: plansError.message };
    }

    const plan = plans?.[0];
    if (!plan) {
        return { success: false, error: 'El paciente no tiene un plan de financiación cargado.' };
    }

    const patientName = patient
        ? `${String(patient.nombre || '')} ${String(patient.apellido || '')}`.trim()
        : String(plan.paciente_nombre || 'Paciente');

    const totalInstallments = asNumber(plan.cuotas_total || movement.cuotas_total);
    const paidInstallments = asNumber(plan.cuotas_pagadas);
    const installmentUsd = asNumber(plan.monto_cuota_usd);
    const remainingUsd = asNumber(plan.saldo_restante_usd);
    const currentInstallmentNumber = asNumber(movement.cuota_nro);

    const input: FinancingStatusInput = {
        patientName,
        treatment: typeof plan.tratamiento === 'string' ? plan.tratamiento : null,
        totalInstallments,
        paidInstallments,
        installmentUsd,
        remainingUsd,
        creditBalanceUsd: asNumber(patient?.saldo_a_favor_usd),
        currentPayment: currentInstallmentNumber > 0
            ? {
                installmentNumber: currentInstallmentNumber,
                totalInstallments: asNumber(movement.cuotas_total) || totalInstallments,
                paidUsd: asNumber(movement.usd_equivalente || movement.monto),
                paidDate: String(movement.fecha_movimiento || movement.fecha_hora || ''),
            }
            : null,
    };

    return {
        success: true,
        summary: getFinancingStatusSummary(input),
        message: buildFinancingStatusMessage(input),
    };
}
