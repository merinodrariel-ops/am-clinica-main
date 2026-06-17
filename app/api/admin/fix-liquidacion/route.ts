/**
 * One-time admin utility route to fix a liquidación's estado.
 * Usage: GET /api/admin/fix-liquidacion?action=revert&personalId=<id>&mes=2026-06
 *        GET /api/admin/fix-liquidacion?action=pay&personalId=<id>&mes=2026-05&fecha=2026-05-31
 *        GET /api/admin/fix-liquidacion?action=lookup&nombre=Georgi
 * Restricted to admin/owner sessions only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient as getAdminClient } from '@/utils/supabase/admin';
import { revertLiquidacionToPending, markLiquidacionPaid, generateLiquidacion } from '@/app/actions/liquidaciones';

async function requireAdminOrOwner() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
        .from('app_users')
        .select('categoria')
        .eq('id', user.id)
        .single();

    if (!data || !['admin', 'owner'].includes(data.categoria ?? '')) return null;
    return user;
}

export async function GET(req: NextRequest) {
    const user = await requireAdminOrOwner();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const personalId = searchParams.get('personalId');
    const nombre = searchParams.get('nombre');
    const mes = searchParams.get('mes');
    const fecha = searchParams.get('fecha');

    const admin = getAdminClient();

    // Lookup personal by name
    if (action === 'lookup') {
        if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });
        const { data } = await admin
            .from('personal')
            .select('id, nombre, apellido, area, tipo')
            .ilike('nombre', `%${nombre}%`);
        return NextResponse.json({ personal: data });
    }

    // Get current liquidacion records for a person
    if (action === 'status') {
        if (!personalId) return NextResponse.json({ error: 'personalId requerido' }, { status: 400 });
        const { data } = await admin
            .from('liquidaciones_mensuales')
            .select('id, mes, estado, total_ars, total_usd, fecha_pago')
            .eq('personal_id', personalId)
            .order('mes', { ascending: false })
            .limit(6);
        return NextResponse.json({ liquidaciones: data });
    }

    // Revert a mes to pending
    if (action === 'revert') {
        if (!personalId || !mes) return NextResponse.json({ error: 'personalId y mes requeridos' }, { status: 400 });
        const result = await revertLiquidacionToPending(personalId, mes);
        return NextResponse.json(result);
    }

    // Mark a mes as paid
    if (action === 'pay') {
        if (!personalId || !mes) return NextResponse.json({ error: 'personalId y mes requeridos' }, { status: 400 });
        const fechaPago = fecha ?? new Date().toISOString().slice(0, 10);
        // Find the liquidacion id for this person+month
        const mesDate = mes.length === 7 ? `${mes}-01` : mes;
        const { data: liq } = await admin
            .from('liquidaciones_mensuales')
            .select('id, estado')
            .eq('personal_id', personalId)
            .eq('mes', mesDate)
            .single();

        if (!liq) {
            // No record exists — generate it first, then mark paid
            await generateLiquidacion(personalId, mes);
            const { data: newLiq } = await admin
                .from('liquidaciones_mensuales')
                .select('id')
                .eq('personal_id', personalId)
                .eq('mes', mesDate)
                .single();
            if (!newLiq) return NextResponse.json({ error: 'No se pudo crear la liquidación' }, { status: 500 });
            await markLiquidacionPaid(newLiq.id, fechaPago);
            return NextResponse.json({ success: true, created: true });
        }

        await markLiquidacionPaid(liq.id, fechaPago);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'action inválida. Usar: lookup, status, revert, pay' }, { status: 400 });
}
