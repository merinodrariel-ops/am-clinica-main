import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: 'Paciente requerido' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const admin = createAdminClient();

        // Read from planes_financiacion — the single source of truth for financing data.
        // Prefer active plan first; if none, fall back to the most recent one.
        const { data: plan, error } = await admin
            .from('planes_financiacion')
            .select('cuotas_total, cuotas_pagadas, monto_cuota_usd, monto_total_usd, saldo_restante_usd, estado, created_at')
            .eq('paciente_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!plan) {
            return NextResponse.json(
                { error: 'No hay plan de financiación registrado para este paciente.' },
                { status: 404 },
            );
        }

        return NextResponse.json({
            source: 'supabase',
            matchedBy: 'id',
            patientId: id,
            cuotasAbonadas: plan.cuotas_pagadas ?? null,
            saldoFaltante: plan.saldo_restante_usd ?? null,
            totalPlan: plan.monto_total_usd ?? null,
            cuotasTotal: plan.cuotas_total ?? null,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error inesperado consultando finanzas.' },
            { status: 500 },
        );
    }
}
