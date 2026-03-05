import { createPaciente } from '@/lib/patients';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const supabase = await createClient();
        const { data, error } = await createPaciente(supabase, body);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ patient: data }, { status: 201 });
    } catch (e: unknown) {
        console.error('Error in create patient API:', e);
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
