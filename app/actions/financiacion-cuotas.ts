'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

type MatchMethod = 'paciente_id' | 'presupuesto_id' | 'dni' | 'nombre_fuzzy';
type SyncFailureCode =
    | 'not_authenticated'
    | 'planes_query_error'
    | 'plan_not_found'
    | 'plan_without_id'
    | 'plan_update_error'
    | 'write_confirmation_failed'
    | 'unexpected_error';

interface SyncCuotaParams {
    movementId: string;
    pacienteId: string;
    pacienteNombre: string;
    montoUsd: number;
    montoOriginal: number;
    moneda: 'USD' | 'ARS' | 'USDT';
    cuotaNro?: number | null;
    cuotasTotal?: number | null;
    presupuestoRef?: string | null;
    observaciones?: string | null;
}

interface SyncCuotaResult {
    success: boolean;
    error?: string;
    failureCode?: SyncFailureCode;
    matchMethod?: MatchMethod;
    planId?: string;
    cuotasPagadas?: number;
    saldoRestanteUsd?: number;
    pendingSaved?: boolean;
}

interface SyncIdentidadesResult {
    success: boolean;
    scanned: number;
    linked: number;
    alreadyLinked: number;
    unresolved: number;
    unresolvedExamples?: string[];
    error?: string;
}

const PRESUPUESTO_KEYS = ['presupuesto_id', 'id_presupuesto', 'presupuesto_ref', 'id_presupuesto_externo', 'presupuesto'];
const DNI_KEYS = ['dni', 'documento', 'paciente_documento', 'dni_paciente', 'cuit'];

function normalizeText(value?: string | null) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\\/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeDigits(value?: string | null) {
    return (value || '').replace(/\D/g, '');
}

function buildNameVariants(raw?: string | null): string[] {
    const source = raw || '';
    const variants = new Set<string>();
    const normalized = normalizeText(source);
    if (normalized) variants.add(normalized);

    for (const part of source.split('/')) {
        const value = normalizeText(part);
        if (value) variants.add(value);
    }

    return Array.from(variants);
}

function pickPlanName(plan: Record<string, unknown>) {
    const fromNombre = getPlanText(plan, 'paciente_nombre');
    if (fromNombre) return fromNombre;
    const apellido = getPlanText(plan, 'apellido');
    const nombre = getPlanText(plan, 'nombre');
    return [apellido, nombre].filter(Boolean).join(' ').trim();
}

function getPlanText(plan: Record<string, unknown>, key: string) {
    const value = plan[key];
    return typeof value === 'string' ? value : null;
}

function getPlanNumber(plan: Record<string, unknown>, key: string) {
    const value = Number(plan[key]);
    return Number.isFinite(value) ? value : 0;
}

function findByPresupuestoRef(plans: Array<Record<string, unknown>>, presupuestoRef: string) {
    const normalizedRef = normalizeText(presupuestoRef);
    if (!normalizedRef) return null;

    return plans.find((plan) => PRESUPUESTO_KEYS.some((key) => {
        const value = getPlanText(plan, key);
        return normalizeText(value) === normalizedRef;
    })) || null;
}

function findByDni(plans: Array<Record<string, unknown>>, pacienteDni: string) {
    const normalizedDni = normalizeDigits(pacienteDni);
    if (!normalizedDni) return null;

    return plans.find((plan) => DNI_KEYS.some((key) => {
        const value = getPlanText(plan, key);
        return normalizeDigits(value) === normalizedDni;
    })) || null;
}

function findByNameFuzzy(plans: Array<Record<string, unknown>>, patientName: string) {
    const inputVariants = buildNameVariants(patientName);
    if (inputVariants.length === 0) return null;

    return plans.find((plan) => {
        const planName = pickPlanName(plan);
        const normalizedPlan = normalizeText(planName);
        if (!normalizedPlan) return false;

        return inputVariants.some((variant) => {
            if (variant === normalizedPlan) return true;
            if (variant.length >= 6 && normalizedPlan.includes(variant)) return true;
            if (normalizedPlan.length >= 6 && variant.includes(normalizedPlan)) return true;

            const variantTokens = variant.split(' ').filter(Boolean);
            const planTokens = normalizedPlan.split(' ').filter(Boolean);
            const tokenMatches = variantTokens.filter((token) => planTokens.includes(token)).length;
            return tokenMatches >= 2;
        });
    }) || null;
}

function findPatientByNameFuzzy(
    patients: Array<Record<string, unknown>>,
    planName: string,
) {
    const inputVariants = buildNameVariants(planName);
    if (inputVariants.length === 0) return null;

    for (const patient of patients) {
        const patientName = `${String(patient.apellido || '')} ${String(patient.nombre || '')}`.trim();
        const normalizedPatient = normalizeText(patientName);
        if (!normalizedPatient) continue;

        const matches = inputVariants.some((variant) => {
            if (variant === normalizedPatient) return true;
            if (variant.length >= 6 && normalizedPatient.includes(variant)) return true;
            if (normalizedPatient.length >= 6 && variant.includes(normalizedPatient)) return true;

            const variantTokens = variant.split(' ').filter(Boolean);
            const patientTokens = normalizedPatient.split(' ').filter(Boolean);
            const tokenMatches = variantTokens.filter((token) => patientTokens.includes(token)).length;
            return tokenMatches >= 2;
        });

        if (matches) return patient;
    }

    return null;
}

function pickPatientName(patient: Record<string, unknown>) {
    return `${String(patient.apellido || '')} ${String(patient.nombre || '')}`.trim();
}

async function savePendingPayment(admin: ReturnType<typeof createAdminClient>, params: SyncCuotaParams, reason: string, matchSnapshot?: Record<string, unknown>, errorMessage?: string) {
    const payload = {
        movement_id: params.movementId,
        paciente_id: params.pacienteId,
        paciente_nombre: params.pacienteNombre,
        presupuesto_ref: params.presupuestoRef || null,
        cuota_nro: params.cuotaNro || null,
        cuotas_total: params.cuotasTotal || null,
        monto_usd: params.montoUsd,
        monto_original: params.montoOriginal,
        moneda: params.moneda,
        motivo: reason,
        estado: 'pendiente',
        match_snapshot: matchSnapshot || null,
        error_message: errorMessage || null,
    };

    const { error } = await admin
        .from('financiacion_pagos_pendientes')
        .upsert(payload, { onConflict: 'movement_id' });

    return !error;
}

export async function syncPagoCuotaAction(params: SyncCuotaParams): Promise<SyncCuotaResult> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: 'No autenticado', failureCode: 'not_authenticated' };
        }

        const admin = createAdminClient();

        const { data: patientRow } = await admin
            .from('pacientes')
            .select('id_paciente, documento, nombre, apellido, is_deleted')
            .eq('id_paciente', params.pacienteId)
            .maybeSingle();

        const patientRecord = (patientRow as Record<string, unknown> | null) || null;

        let effectivePatientId = params.pacienteId;
        let effectivePatientDni = normalizeDigits(patientRecord?.documento as string | undefined);
        let effectivePatientName = params.pacienteNombre || `${patientRecord?.apellido || ''} ${patientRecord?.nombre || ''}`.trim();

        if (patientRecord?.is_deleted === true) {
            const { data: activePatients, error: activePatientsError } = await admin
                .from('pacientes')
                .select('id_paciente, nombre, apellido, documento')
                .eq('is_deleted', false)
                .limit(5000);

            if (!activePatientsError && activePatients && activePatients.length > 0) {
                const activeRows = activePatients as Array<Record<string, unknown>>;
                let canonicalPatient: Record<string, unknown> | null = null;

                if (effectivePatientDni) {
                    canonicalPatient = activeRows.find((row) => normalizeDigits(String(row.documento || '')) === effectivePatientDni) || null;
                }

                if (!canonicalPatient) {
                    const deletedName = pickPatientName(patientRecord);
                    canonicalPatient = findPatientByNameFuzzy(activeRows, deletedName || effectivePatientName);
                }

                if (canonicalPatient) {
                    const canonicalId = String(canonicalPatient.id_paciente || '');
                    if (canonicalId) {
                        effectivePatientId = canonicalId;
                        effectivePatientName = `${String(canonicalPatient.apellido || '')}, ${String(canonicalPatient.nombre || '')}`.trim();
                        effectivePatientDni = normalizeDigits(String(canonicalPatient.documento || ''));

                        await admin
                            .from('caja_recepcion_movimientos')
                            .update({ paciente_id: canonicalId })
                            .eq('id', params.movementId);
                    }
                }
            }
        }

        const patientName = effectivePatientName;

        const { data: plansRaw, error: plansError } = await admin
            .from('planes_financiacion')
            .select('*')
            .eq('estado', 'En curso')
            .order('created_at', { ascending: false })
            .limit(300);

        if (plansError) {
            const pendingSaved = await savePendingPayment(
                admin,
                { ...params, pacienteId: effectivePatientId, pacienteNombre: patientName },
                'error_consulta_planes',
                undefined,
                plansError.message,
            );
            return {
                success: false,
                error: `Pago registrado en caja, pero falló la consulta de financiación: ${plansError.message}`,
                pendingSaved,
                failureCode: 'planes_query_error',
            };
        }

        const plans = (plansRaw || []) as Array<Record<string, unknown>>;

        let matched: Record<string, unknown> | null = null;
        let matchMethod: MatchMethod | undefined;

        matched = plans.find((plan) => String(plan.paciente_id || '') === effectivePatientId) || null;
        if (matched) matchMethod = 'paciente_id';

        if (!matched && params.presupuestoRef) {
            matched = findByPresupuestoRef(plans, params.presupuestoRef);
            if (matched) matchMethod = 'presupuesto_id';
        }

        if (!matched && effectivePatientDni) {
            matched = findByDni(plans, effectivePatientDni);
            if (matched) matchMethod = 'dni';
        }

        if (!matched) {
            matched = findByNameFuzzy(plans, patientName);
            if (matched) matchMethod = 'nombre_fuzzy';
        }

        if (!matched) {
            const pendingSaved = await savePendingPayment(
                admin,
                { ...params, pacienteId: effectivePatientId, pacienteNombre: patientName },
                'plan_no_encontrado',
                {
                patient_name: patientName,
                patient_dni: effectivePatientDni,
                presupuesto_ref: params.presupuestoRef || null,
                candidates: plans.slice(0, 15).map((plan) => ({
                    id: plan.id,
                    paciente_nombre: plan.paciente_nombre,
                    paciente_id: plan.paciente_id,
                    cuit: plan.cuit,
                })),
                },
            );

            return {
                success: false,
                error: 'Pago registrado en caja, pero no se encontró un plan de financiación para acreditar la cuota.',
                pendingSaved,
                failureCode: 'plan_not_found',
            };
        }

        const planId = String(matched.id || '');
        if (!planId) {
            const pendingSaved = await savePendingPayment(
                admin,
                { ...params, pacienteId: effectivePatientId, pacienteNombre: patientName },
                'plan_sin_id',
                { matched },
            );
            return {
                success: false,
                error: 'Pago registrado en caja, pero el plan encontrado no tiene ID válido.',
                pendingSaved,
                failureCode: 'plan_without_id',
            };
        }

        const prevPaid = getPlanNumber(matched, 'cuotas_pagadas');
        const totalCuotas = getPlanNumber(matched, 'cuotas_total');
        const cuotaValue = getPlanNumber(matched, 'monto_cuota_usd') || params.montoUsd;
        const currentSaldo = getPlanNumber(matched, 'saldo_restante_usd');

        const nextPaid = totalCuotas > 0 ? Math.min(totalCuotas, prevPaid + 1) : prevPaid + 1;
        const nextSaldo = Math.max(0, currentSaldo - cuotaValue);
        const nextEstado = totalCuotas > 0 && nextPaid >= totalCuotas ? 'Finalizado' : 'En curso';

        const updatePayload: Record<string, unknown> = {
            cuotas_pagadas: nextPaid,
            saldo_restante_usd: nextSaldo,
            estado: nextEstado,
            updated_at: new Date().toISOString(),
        };

        if (!matched.paciente_id || String(matched.paciente_id) !== effectivePatientId) {
            updatePayload.paciente_id = effectivePatientId;
        }

        const { error: updateError } = await admin
            .from('planes_financiacion')
            .update(updatePayload)
            .eq('id', planId);

        if (updateError) {
            const pendingSaved = await savePendingPayment(
                admin,
                { ...params, pacienteId: effectivePatientId, pacienteNombre: patientName },
                'error_actualizacion_plan',
                { matched, matchMethod },
                updateError.message,
            );
            return {
                success: false,
                error: `Pago registrado en caja, pero no se pudo actualizar el plan: ${updateError.message}`,
                pendingSaved,
                failureCode: 'plan_update_error',
            };
        }

        // Immediate confirmation read (equivalent to forcing visible consistency)
        const { data: verifyRow, error: verifyError } = await admin
            .from('planes_financiacion')
            .select('id, cuotas_pagadas, saldo_restante_usd')
            .eq('id', planId)
            .single();

        if (verifyError || !verifyRow || Number(verifyRow.cuotas_pagadas || 0) !== nextPaid) {
            const pendingSaved = await savePendingPayment(
                admin,
                { ...params, pacienteId: effectivePatientId, pacienteNombre: patientName },
                'confirmacion_escritura_fallida',
                {
                expected: { cuotas_pagadas: nextPaid, saldo_restante_usd: nextSaldo },
                got: verifyRow || null,
                matchMethod,
                },
                verifyError?.message,
            );

            return {
                success: false,
                error: 'Pago registrado en caja, pero no se confirmó la acreditación de cuota en financiación.',
                pendingSaved,
                matchMethod,
                planId,
                failureCode: 'write_confirmation_failed',
            };
        }

        return {
            success: true,
            matchMethod,
            planId,
            cuotasPagadas: Number(verifyRow.cuotas_pagadas || 0),
            saldoRestanteUsd: Number(verifyRow.saldo_restante_usd || 0),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error inesperado al acreditar cuota',
            failureCode: 'unexpected_error',
        };
    }
}

export async function syncFinanciacionIdentidadesAction(): Promise<SyncIdentidadesResult> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return {
                success: false,
                scanned: 0,
                linked: 0,
                alreadyLinked: 0,
                unresolved: 0,
                error: 'No autenticado',
            };
        }

        const admin = createAdminClient();

        const [{ data: patientsRaw, error: patientsError }, { data: plansRaw, error: plansError }] = await Promise.all([
            admin
                .from('pacientes')
                .select('id_paciente, nombre, apellido, documento')
                .eq('is_deleted', false),
            admin
                .from('planes_financiacion')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(2000),
        ]);

        if (patientsError) {
            throw new Error(`Error al leer pacientes: ${patientsError.message}`);
        }
        if (plansError) {
            throw new Error(`Error al leer planes de financiación: ${plansError.message}`);
        }

        const patients = (patientsRaw || []) as Array<Record<string, unknown>>;
        const plans = (plansRaw || []) as Array<Record<string, unknown>>;

        const patientsById = new Map<string, Record<string, unknown>>();
        const patientsByDni = new Map<string, Record<string, unknown>>();

        for (const patient of patients) {
            const patientId = String(patient.id_paciente || '');
            if (patientId) {
                patientsById.set(patientId, patient);
            }

            const dni = normalizeDigits(String(patient.documento || ''));
            if (dni && !patientsByDni.has(dni)) {
                patientsByDni.set(dni, patient);
            }
        }

        let linked = 0;
        let alreadyLinked = 0;
        let unresolved = 0;
        const unresolvedExamples: string[] = [];

        for (const plan of plans) {
            const planId = String(plan.id || '');
            if (!planId) continue;

            const currentPatientId = String(plan.paciente_id || '');
            if (currentPatientId && patientsById.has(currentPatientId)) {
                alreadyLinked += 1;
                continue;
            }

            let matchedPatient: Record<string, unknown> | null = null;

            for (const key of DNI_KEYS) {
                const raw = getPlanText(plan, key);
                const planDni = normalizeDigits(raw);
                if (!planDni) continue;
                const byDni = patientsByDni.get(planDni);
                if (byDni) {
                    matchedPatient = byDni;
                    break;
                }
            }

            if (!matchedPatient) {
                matchedPatient = findPatientByNameFuzzy(patients, pickPlanName(plan));
            }

            if (!matchedPatient) {
                unresolved += 1;
                if (unresolvedExamples.length < 12) {
                    const planName = pickPlanName(plan) || `Plan ${planId}`;
                    unresolvedExamples.push(planName);
                }
                continue;
            }

            const matchedPatientId = String(matchedPatient.id_paciente || '');
            if (!matchedPatientId) {
                unresolved += 1;
                continue;
            }

            const { error: updateError } = await admin
                .from('planes_financiacion')
                .update({
                    paciente_id: matchedPatientId,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', planId);

            if (updateError) {
                unresolved += 1;
                if (unresolvedExamples.length < 12) {
                    const planName = pickPlanName(plan) || `Plan ${planId}`;
                    unresolvedExamples.push(`${planName} (error actualización)`);
                }
                continue;
            }

            linked += 1;
        }

        return {
            success: true,
            scanned: plans.length,
            linked,
            alreadyLinked,
            unresolved,
            unresolvedExamples,
        };
    } catch (error) {
        return {
            success: false,
            scanned: 0,
            linked: 0,
            alreadyLinked: 0,
            unresolved: 0,
            error: error instanceof Error ? error.message : 'Error inesperado al sincronizar identidades',
        };
    }
}
