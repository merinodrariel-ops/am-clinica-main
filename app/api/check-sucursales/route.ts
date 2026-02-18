import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
        return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Check sucursales
        const { data: sucursales, error: sucError } = await supabase
            .from('sucursales')
            .select('*');

        // Check cuentas_financieras
        const { data: cuentas, error: cuentasError } = await supabase
            .from('cuentas_financieras')
            .select('*');

        // Check RLS status
        const { data: rlsStatus, error: rlsError } = await supabase.rpc('check_rls_enabled', {
            table_name: 'sucursales'
        }).maybeSingle();

        return NextResponse.json({
            sucursales: {
                count: sucursales?.length || 0,
                data: sucursales,
                error: sucError?.message
            },
            cuentas: {
                count: cuentas?.length || 0,
                data: cuentas,
                error: cuentasError?.message
            },
            rlsCheck: rlsStatus || 'RLS check function not available',
            rlsError: rlsError?.message
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
        return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Execute the SQL to fix RLS policies
        const _fixPolicies = `
            -- Make sure RLS is enabled
            ALTER TABLE IF EXISTS public.sucursales ENABLE ROW LEVEL SECURITY;
            ALTER TABLE IF EXISTS public.cuentas_financieras ENABLE ROW LEVEL SECURITY;
            
            -- Drop existing policies to recreate them
            DROP POLICY IF EXISTS "Authenticated users can view sucursales" ON public.sucursales;
            DROP POLICY IF EXISTS "Owner/Admin can manage sucursales" ON public.sucursales;
            DROP POLICY IF EXISTS "Allow all authenticated to view sucursales" ON public.sucursales;
            
            -- Create simple policy that allows all authenticated users to view
            CREATE POLICY "Allow all authenticated to view sucursales" 
            ON public.sucursales FOR SELECT 
            USING (auth.role() = 'authenticated');
            
            -- Allow service role full access
            CREATE POLICY IF NOT EXISTS "Service role full access sucursales"
            ON public.sucursales FOR ALL
            USING (auth.role() = 'service_role');
        `;

        // Note: supabase-js doesn't allow raw SQL execution on regular client
        // We need to use RPC or apply migrations separately

        // For now, let's try a simple approach - check if we can read with service role
        const { data: sucursales, error: sucError } = await supabase
            .from('sucursales')
            .select('*');

        if (sucError) {
            return NextResponse.json({
                error: sucError.message,
                hint: 'Please apply RLS policies migration manually in Supabase dashboard'
            }, { status: 500 });
        }

        // If no sucursales exist yet, create one
        if (!sucursales || sucursales.length === 0) {
            const { data: newSuc, error: insertError } = await supabase
                .from('sucursales')
                .insert({
                    nombre: 'Buenos Aires',
                    modo_caja: 'SEPARADA',
                    moneda_local: 'ARS',
                    activa: true
                })
                .select()
                .single();

            if (insertError) {
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }

            // Create default cuentas
            await supabase.from('cuentas_financieras').insert([
                { sucursal_id: newSuc.id, nombre_cuenta: 'Efectivo USD', tipo_cuenta: 'EFECTIVO', moneda: 'USD', activa: true, orden: 1 },
                { sucursal_id: newSuc.id, nombre_cuenta: 'Efectivo ARS', tipo_cuenta: 'EFECTIVO', moneda: 'ARS', activa: true, orden: 2 },
            ]);

            return NextResponse.json({
                success: true,
                message: 'Created sucursal and cuentas',
                sucursal: newSuc
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Sucursales already exist',
            count: sucursales.length,
            sucursales
        });

    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
