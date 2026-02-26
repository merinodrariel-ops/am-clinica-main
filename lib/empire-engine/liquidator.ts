import { supabase } from '../supabase';
import { fetchBNADolarVenta } from '../bna';
import { PerformanceItem, DoctorLiquidation, StaffLiquidation, LiquidationPeriod } from './types';
import { parseProsoftExcel } from './prosoft-parser';

/**
 * Calculates liquidation for a specific doctor based on completed prestations
 * and validated "Carga de Evolución en Slides" tasks.
 */
export async function calculateDoctorLiquidation(
    providerId: string,
    period: LiquidationPeriod
): Promise<DoctorLiquidation> {
    const { rate: exchangeRate } = await fetchBNADolarVenta();

    // 1. Fetch performed prestations for the period
    const startDate = new Date(period.year, period.month - 1, 1).toISOString();
    const endDate = new Date(period.year, period.month, 0, 23, 59, 59).toISOString();

    const { data: prestations, error: prestError } = await supabase
        .from('prestaciones_realizadas')
        .select(`
            id,
            fecha,
            paciente:pacientes(nombre, apellido),
            prestacion:prestaciones_lista(nombre, valor_usd),
            profesional_id
        `)
        .eq('profesional_id', providerId)
        .gte('fecha', startDate)
        .lte('fecha', endDate);

    if (prestError) throw prestError;

    // 2. Fetch "Carga de Evolución en Slides" tasks for this provider
    // We assume these tasks are linked to the specific prestations or the patient/date
    const { data: tasks, error: taskError } = await supabase
        .from('todos')
        .select('*')
        .eq('created_by', providerId)
        .ilike('title', '%Slides%');

    if (taskError) throw taskError;

    const performanceItems: PerformanceItem[] = (prestations || []).map(p => {
        // Simple matching logic for now: check if there's a task for this patient/date
        const relatedTask = tasks?.find(t =>
            t.title.includes((p.paciente as any)?.nombre) ||
            t.description?.includes(p.id)
        );

        return {
            id: p.id,
            date: p.fecha,
            patientName: `${(p.paciente as any)?.nombre} ${(p.paciente as any)?.apellido}`,
            treatmentName: (p.prestacion as any)?.nombre,
            usdValue: (p.prestacion as any)?.valor_usd || 0,
            hasSlidesUrl: !!relatedTask?.description?.match(/https:\/\/docs\.google\.com\/presentation/i),
            slidesUrl: relatedTask?.description,
            isTaskDone: relatedTask?.completed || false
        };
    });

    const totalUsd = performanceItems.reduce((sum, item) => sum + item.usdValue, 0);
    const allTasksDone = performanceItems.every(item => item.isTaskDone && item.hasSlidesUrl);

    return {
        providerId,
        totalUsd,
        totalArs: Math.round(totalUsd * exchangeRate),
        exchangeRate,
        performances: performanceItems,
        status: allTasksDone ? 'READY' : 'PENDING_TASKS'
    };
}

/**
 * Processes a staff liquidation from a Prosoft Excel buffer.
 */
export async function processStaffLiquidation(
    staffId: string,
    period: LiquidationPeriod,
    excelBuffer: Buffer,
    hourlyRateArs: number
): Promise<StaffLiquidation> {
    const records = parseProsoftExcel(excelBuffer);

    // Filter records for the specific staff (by DNI or Name matching)
    // For now, we sum all hours from the file if it's a per-person upload,
    // or filter if it's a bulk upload.
    const totalHours = records.reduce((sum, r) => sum + r.horasNetas, 0);

    return {
        staffId,
        totalHours,
        hourlyRateArs,
        totalArs: Math.round(totalHours * hourlyRateArs),
        period
    };
}
