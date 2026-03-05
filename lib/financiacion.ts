import { createClient } from '@/utils/supabase/client';
const supabase = createClient();

export interface PlanFinanciacion {
    id: string;
    paciente_id: string | null;
    paciente_nombre: string;
    tratamiento: string;
    fecha_inicio: string;
    condicion: string | null;
    cuit: string | null;
    estado: string;
    cuotas_total: number;
    cuotas_pagadas: number;
    monto_cuota_usd: number;
    monto_total_usd: number;
    saldo_restante_usd: number;
    notas: string | null;
    contrato_url: string | null;
    created_at: string;
}

export interface FinanciacionStats {
    planes: PlanFinanciacion[];
    planesActivos: number;
    deudaGlobal: number;
    cobroEsperadoProxMes: number;
    totalRecaudado: number;
}

export async function getFinanciacionData(): Promise<FinanciacionStats> {
    const { data, error } = await supabase
        .from('planes_financiacion')
        .select('*')
        .order('paciente_nombre');

    if (error) {
        console.error('Error fetching financing data:', error);
        return {
            planes: [],
            planesActivos: 0,
            deudaGlobal: 0,
            cobroEsperadoProxMes: 0,
            totalRecaudado: 0,
        };
    }

    const planes = (data || []) as PlanFinanciacion[];
    const activos = planes.filter(p => p.estado === 'En curso');

    const deudaGlobal = activos.reduce(
        (sum, p) => sum + (Number(p.saldo_restante_usd) || 0), 0
    );

    // Expected collection next month = sum of monthly installments for active plans with remaining quotas
    const cobroEsperadoProxMes = activos
        .filter(p => p.cuotas_pagadas < p.cuotas_total)
        .reduce((sum, p) => sum + (Number(p.monto_cuota_usd) || 0), 0);

    // Total already collected
    const totalRecaudado = activos.reduce(
        (sum, p) => sum + (Number(p.monto_cuota_usd) * p.cuotas_pagadas || 0), 0
    );

    return {
        planes,
        planesActivos: activos.length,
        deudaGlobal: Math.round(deudaGlobal),
        cobroEsperadoProxMes: Math.round(cobroEsperadoProxMes),
        totalRecaudado: Math.round(totalRecaudado),
    };
}

export async function uploadContrato(planId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'pdf';
    const filePath = `${planId}/contrato_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('contratos-financiacion')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true,
        });

    if (uploadError) {
        console.error('Error uploading contract:', uploadError);
        return null;
    }

    // Get signed URL (valid for 10 years — essentially permanent for internal use)
    const { data: signedData } = await supabase.storage
        .from('contratos-financiacion')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10);

    const url = signedData?.signedUrl || null;

    if (url) {
        // Save URL to the plan
        const { error: updateError } = await supabase
            .from('planes_financiacion')
            .update({ contrato_url: filePath, updated_at: new Date().toISOString() })
            .eq('id', planId);

        if (updateError) {
            console.error('Error updating plan with contract URL:', updateError);
        }
    }

    return url;
}

export async function getContratoSignedUrl(filePath: string): Promise<string | null> {
    const { data } = await supabase.storage
        .from('contratos-financiacion')
        .createSignedUrl(filePath, 60 * 60); // 1 hour

    return data?.signedUrl || null;
}

export async function deleteContrato(planId: string, filePath: string): Promise<boolean> {
    const { error: deleteError } = await supabase.storage
        .from('contratos-financiacion')
        .remove([filePath]);

    if (deleteError) {
        console.error('Error deleting contract file:', deleteError);
        return false;
    }

    const { error: updateError } = await supabase
        .from('planes_financiacion')
        .update({ contrato_url: null, updated_at: new Date().toISOString() })
        .eq('id', planId);

    if (updateError) {
        console.error('Error clearing contract URL:', updateError);
        return false;
    }

    return true;
}
