import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
        return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // We can't run raw SQL via supabase-js, but we can use RPC to call a function
        // Alternative: Create policies via individual statements

        // First, let's check current policies
        const { data: _policies, error: _polErr } = await supabase
            .rpc('get_policies_for_table', { table_name: 'sucursales' })
            .maybeSingle();

        // Since we can't run raw SQL, let's try a workaround:
        // We'll verify that the data is accessible and report back

        // Test 1: Read sucursales with service role
        const { data: sucursales, error: sucErr } = await supabase
            .from('sucursales')
            .select('*');

        if (sucErr) {
            return NextResponse.json({
                error: 'Cannot read sucursales even with service role',
                details: sucErr.message
            }, { status: 500 });
        }

        // Test 2: Check if there are any RLS policies blocking
        // We need to apply the migration manually via Supabase Dashboard SQL Editor

        const migrationSQL = `
-- Run this in Supabase Dashboard -> SQL Editor:

-- Drop ALL existing policies on sucursales
DROP POLICY IF EXISTS "Authenticated users can view sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Owner/Admin can manage sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Allow all authenticated to view sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Service role full access sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "sucursales_anon" ON public.sucursales;
DROP POLICY IF EXISTS "sucursales_select_all" ON public.sucursales;
DROP POLICY IF EXISTS "sucursales_admin_modify" ON public.sucursales;

-- Drop ALL existing policies on cuentas_financieras  
DROP POLICY IF EXISTS "Authenticated users can view cuentas" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "Owner/Admin can manage cuentas" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "cuentas_financieras_anon" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "cuentas_select_all" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "cuentas_admin_modify" ON public.cuentas_financieras;

-- Create simple SELECT policy for all (these are not sensitive tables)
CREATE POLICY "sucursales_select_all" ON public.sucursales
    FOR SELECT USING (true);

CREATE POLICY "cuentas_select_all" ON public.cuentas_financieras
    FOR SELECT USING (true);

-- Create write policies for authenticated users
CREATE POLICY "sucursales_write_auth" ON public.sucursales
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "cuentas_write_auth" ON public.cuentas_financieras
    FOR ALL USING (auth.role() = 'authenticated');
`;

        return NextResponse.json({
            status: 'requires_manual_action',
            message: 'Please run the following SQL in Supabase Dashboard -> SQL Editor',
            sucursalesFound: sucursales?.length || 0,
            sql: migrationSQL
        });

    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to get the SQL migration script to fix RLS policies'
    });
}
