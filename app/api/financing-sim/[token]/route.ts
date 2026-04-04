import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    calculateFinancingBreakdown,
    DEFAULT_MONTHLY_INTEREST_PCT,
} from '@/lib/financial-engine';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeOptions(raw: unknown, fallback: number[]): number[] {
    if (!Array.isArray(raw)) return [...fallback];
    const values = raw
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
        .map((item) => Math.round(item));
    const unique = Array.from(new Set(values));
    return unique.length > 0 ? unique : [...fallback];
}

async function getSimulationByToken(token: string) {
    const { data, error } = await supabase
        .from('financing_simulations')
        .select('*')
        .eq('share_token', token)
        .single();

    if (error || !data) {
        return { simulation: null, error: 'Simulación no encontrada' };
    }

    const isExpired = new Date(data.expires_at) < new Date();
    if (isExpired && data.status !== 'expired') {
        await supabase
            .from('financing_simulations')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', data.id);
    }

    const allowedInstallments = normalizeOptions(data.allowed_installment_options, [3, 6, 12]);
    const allowedUpfront = normalizeOptions(data.allowed_upfront_options, [30, 50]).filter((value) => [30, 50].includes(value));

    return {
        simulation: {
            id: data.id as string,
            patientId: data.patient_id as string,
            treatment: data.treatment as string,
            totalUsd: Number(data.total_usd || 0),
            bnaVentaArs: Number(data.bna_venta_ars || 0),
            monthlyInterestPct: Number(data.monthly_interest_pct || DEFAULT_MONTHLY_INTEREST_PCT),
            baseInstallments: Number(data.base_installments || 12),
            allowedInstallments,
            allowedUpfront,
            status: (isExpired ? 'expired' : data.status) as 'shared' | 'selected' | 'contracted' | 'expired',
            selectedInstallments: data.selected_installments ? Number(data.selected_installments) : null,
            selectedUpfrontPct: data.selected_upfront_pct ? Number(data.selected_upfront_pct) : null,
            selectedAt: data.selected_at as string | null,
            expiresAt: data.expires_at as string,
            createdAt: data.created_at as string,
        },
        error: null,
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    if (!token) {
        return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    const { simulation, error } = await getSimulationByToken(token);
    if (!simulation) {
        return NextResponse.json({ error }, { status: 404 });
    }

    if (simulation.status === 'expired') {
        return NextResponse.json({ error: 'Esta simulación expiró.' }, { status: 410 });
    }

    const { data: patient } = await supabase
        .from('pacientes')
        .select('nombre, apellido')
        .eq('id_paciente', simulation.patientId)
        .maybeSingle();

    return NextResponse.json({
        success: true,
        simulation,
        patient: patient || null,
    });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    if (!token) {
        return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    const { simulation, error } = await getSimulationByToken(token);
    if (!simulation) {
        return NextResponse.json({ error }, { status: 404 });
    }

    if (simulation.status === 'expired') {
        return NextResponse.json({ error: 'La simulación está expirada.' }, { status: 410 });
    }

    if (simulation.status === 'contracted') {
        return NextResponse.json({ error: 'Esta simulación ya fue convertida en contrato.' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const upfrontPct = Math.round(Number(body?.upfrontPct));
    const installments = Math.round(Number(body?.installments));

    if (!simulation.allowedUpfront.includes(upfrontPct)) {
        return NextResponse.json({ error: 'Anticipo inválido para esta simulación.' }, { status: 400 });
    }

    if (!simulation.allowedInstallments.includes(installments)) {
        return NextResponse.json({ error: 'Plan de cuotas inválido para esta simulación.' }, { status: 400 });
    }

    const quote = calculateFinancingBreakdown({
        totalUsd: simulation.totalUsd,
        upfrontPct,
        installments,
        monthlyInterestPct: simulation.monthlyInterestPct,
        bnaVentaArs: simulation.bnaVentaArs,
    });

    const { error: updateError } = await supabase
        .from('financing_simulations')
        .update({
            status: 'selected',
            selected_upfront_pct: upfrontPct,
            selected_installments: installments,
            selected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', simulation.id);

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        selected: {
            upfrontPct,
            installments,
            quote,
        },
    });
}
