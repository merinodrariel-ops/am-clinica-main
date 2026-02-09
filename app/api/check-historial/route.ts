import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const results: string[] = [];

    try {
        // Step 1: Create the table
        const { error: createError } = await supabase.from('historial_ediciones').select('id').limit(1);

        if (createError && createError.code === '42P01') {
            // Table doesn't exist, need to create it via SQL Editor in Supabase Dashboard
            return NextResponse.json({
                success: false,
                message: 'La tabla historial_ediciones no existe. Ejecute el siguiente SQL en Supabase SQL Editor:',
                sql: `
-- Ejecutar en Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.historial_ediciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    id_registro UUID NOT NULL,
    tabla_origen TEXT NOT NULL,
    campo_modificado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario_editor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_email TEXT,
    fecha_edicion TIMESTAMPTZ DEFAULT now(),
    motivo_edicion TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_ediciones_registro 
    ON public.historial_ediciones(id_registro, tabla_origen);

ALTER TABLE public.historial_ediciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_select_admin_owner"
    ON public.historial_ediciones
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "historial_insert_authenticated"
    ON public.historial_ediciones
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
                `
            }, { status: 400 });
        }

        results.push('✅ Tabla historial_ediciones existe');

        // Step 2: Test insert (to verify RLS works)
        const testId = crypto.randomUUID();
        const { error: insertError } = await supabase
            .from('historial_ediciones')
            .insert({
                id_registro: testId,
                tabla_origen: 'test',
                campo_modificado: 'test_field',
                valor_anterior: 'old',
                valor_nuevo: 'new',
                motivo_edicion: 'Test de migración - eliminar'
            });

        if (insertError) {
            results.push(`⚠️ Error en INSERT test: ${insertError.message}`);
        } else {
            results.push('✅ INSERT funciona correctamente');

            // Clean up test record
            await supabase
                .from('historial_ediciones')
                .delete()
                .eq('id_registro', testId);
            results.push('✅ Test record eliminado');
        }

        // Step 3: Check existing records
        const { data: records, error: selectError } = await supabase
            .from('historial_ediciones')
            .select('*')
            .order('fecha_edicion', { ascending: false })
            .limit(5);

        if (selectError) {
            results.push(`⚠️ Error en SELECT: ${selectError.message}`);
        } else {
            results.push(`✅ Registros existentes: ${records?.length || 0}`);
        }

        return NextResponse.json({
            success: true,
            message: 'Tabla historial_ediciones configurada correctamente',
            results,
            existingRecords: records
        });

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: String(error),
            results
        }, { status: 500 });
    }
}

export async function GET() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        const { data, error } = await supabase
            .from('historial_ediciones')
            .select('*')
            .order('fecha_edicion', { ascending: false })
            .limit(20);

        if (error) {
            if (error.code === '42P01') {
                return NextResponse.json({
                    exists: false,
                    message: 'Tabla no existe. Use POST para ver instrucciones de creación.'
                });
            }
            return NextResponse.json({ exists: false, error: error.message });
        }

        return NextResponse.json({
            exists: true,
            count: data?.length || 0,
            records: data
        });

    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
