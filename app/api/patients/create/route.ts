import { createPaciente } from '@/lib/patients';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { data, error } = await createPaciente(body);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ patient: data }, { status: 201 });
    } catch (e: any) {
        console.error('Error in create patient API:', e);
        return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
    }
}
