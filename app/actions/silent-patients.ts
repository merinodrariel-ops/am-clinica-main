'use server';

import { createClient } from '@/utils/supabase/server';

export interface SilentPatient {
    patientId: string;
    nombre: string;
    apellido: string;
    telefono: string | null;
    fullName: string;
    workflowName: string;
    stageName: string | null;
    daysSilent: number;
    lastStageChange: string;
}

/**
 * Pacientes con tratamiento activo (active / waiting / production)
 * que NO tuvieron ningún turno en los últimos `dayThreshold` días
 * y tampoco tienen un turno futuro agendado.
 */
export async function getSilentPatients(dayThreshold = 45): Promise<SilentPatient[]> {
    const supabase = await createClient();

    const { data: treatments, error } = await supabase
        .from('patient_treatments')
        .select(`
            patient_id,
            last_stage_change,
            patient:patient_id ( full_name, nombre, apellido, telefono ),
            workflow:workflow_id ( name ),
            stage:current_stage_id ( name )
        `)
        .in('status', ['active', 'waiting', 'production']);

    if (error || !treatments?.length) return [];

    // Pacientes que SÍ tienen turno dentro de la ventana (últimos N días O en el futuro)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayThreshold);

    const { data: recentApts } = await supabase
        .from('agenda_appointments')
        .select('patient_id')
        .gte('start_time', cutoff.toISOString())
        .neq('status', 'cancelled');

    const activeIds = new Set(
        (recentApts || []).map(a => a.patient_id).filter(Boolean)
    );

    const now = new Date();

    return treatments
        .filter(t => t.patient_id && !activeIds.has(t.patient_id))
        .map(t => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = t.patient as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = t.workflow as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const s = t.stage as any;
            const daysSilent = Math.floor(
                (now.getTime() - new Date(t.last_stage_change).getTime()) / 86_400_000
            );
            return {
                patientId: t.patient_id,
                nombre: p?.nombre ?? '',
                apellido: p?.apellido ?? '',
                telefono: p?.telefono ?? null,
                fullName: p?.full_name ?? `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim(),
                workflowName: w?.name ?? 'Tratamiento',
                stageName: s?.name ?? null,
                daysSilent,
                lastStageChange: t.last_stage_change,
            };
        })
        .filter(p => p.daysSilent >= dayThreshold)
        .sort((a, b) => b.daysSilent - a.daysSilent);
}
