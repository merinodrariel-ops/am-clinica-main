import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This is a one-time setup endpoint - should be called once to initialize the system
export async function POST() {
    // Use service role key for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
        return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Check if sucursales already exist
        const { data: existing, error: checkError } = await supabase
            .from('sucursales')
            .select('id')
            .limit(1);

        if (checkError) {
            return NextResponse.json({ error: checkError.message }, { status: 500 });
        }

        if (existing && existing.length > 0) {
            return NextResponse.json({
                message: 'Sucursales already exist',
                count: existing.length
            });
        }

        // Create default sucursal for Buenos Aires (Argentina)
        const { data: sucursalBA, error: errorBA } = await supabase
            .from('sucursales')
            .insert({
                nombre: 'Buenos Aires',
                modo_caja: 'SEPARADA',
                moneda_local: 'ARS',
                activa: true
            })
            .select()
            .single();

        if (errorBA) {
            return NextResponse.json({ error: `Error creating BA: ${errorBA.message}` }, { status: 500 });
        }

        // Create default financial accounts for BA
        const cuentasBA = [
            { sucursal_id: sucursalBA.id, nombre_cuenta: 'Efectivo USD', tipo_cuenta: 'EFECTIVO', moneda: 'USD', activa: true, orden: 1 },
            { sucursal_id: sucursalBA.id, nombre_cuenta: 'Efectivo ARS', tipo_cuenta: 'EFECTIVO', moneda: 'ARS', activa: true, orden: 2 },
            { sucursal_id: sucursalBA.id, nombre_cuenta: 'Banco Galicia USD', tipo_cuenta: 'BANCO', moneda: 'USD', activa: true, orden: 3 },
            { sucursal_id: sucursalBA.id, nombre_cuenta: 'Banco Galicia ARS', tipo_cuenta: 'BANCO', moneda: 'ARS', activa: true, orden: 4 },
            { sucursal_id: sucursalBA.id, nombre_cuenta: 'Mercado Pago', tipo_cuenta: 'SERVICIO', moneda: 'ARS', activa: true, orden: 5 },
        ];

        const { error: cuentasErrorBA } = await supabase
            .from('cuentas_financieras')
            .insert(cuentasBA);

        if (cuentasErrorBA) {
            console.error('Error creating BA cuentas:', cuentasErrorBA);
        }

        // Optionally create Uruguay sucursal
        const { data: sucursalUY, error: errorUY } = await supabase
            .from('sucursales')
            .insert({
                nombre: 'Montevideo',
                modo_caja: 'UNIFICADA',
                moneda_local: 'USD',
                activa: true
            })
            .select()
            .single();

        if (errorUY) {
            console.error('Error creating UY sucursal:', errorUY);
        } else {
            // Create default financial accounts for UY
            const cuentasUY = [
                { sucursal_id: sucursalUY.id, nombre_cuenta: 'Efectivo USD', tipo_cuenta: 'EFECTIVO', moneda: 'USD', activa: true, orden: 1 },
                { sucursal_id: sucursalUY.id, nombre_cuenta: 'Banco Itaú USD', tipo_cuenta: 'BANCO', moneda: 'USD', activa: true, orden: 2 },
            ];

            const { error: cuentasErrorUY } = await supabase
                .from('cuentas_financieras')
                .insert(cuentasUY);

            if (cuentasErrorUY) {
                console.error('Error creating UY cuentas:', cuentasErrorUY);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Sucursales and cuentas created successfully',
            sucursales: [
                { id: sucursalBA.id, nombre: sucursalBA.nombre },
                sucursalUY ? { id: sucursalUY.id, nombre: sucursalUY.nombre } : null
            ].filter(Boolean)
        });

    } catch (error) {
        console.error('Setup error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to initialize sucursales and cuentas financieras'
    });
}
