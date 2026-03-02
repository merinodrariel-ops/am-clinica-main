import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * GET /api/agenda/import/resolve?jobId=xxx
 * Fetches all import rows for a job with patient suggestions for the resolution UI.
 */
export async function GET(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const jobId = searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // Fetch all rows for this job (not yet imported)
        const { data: rows, error: rowsError } = await adminClient
            .from('agenda_import_rows')
            .select('id, raw_data, status, suggested_patient_id, resolved_patient_id, match_confidence, match_reasons')
            .eq('job_id', jobId)
            .in('status', ['matched', 'pending', 'unmatched', 'resolved'])
            .order('match_confidence', { ascending: false });

        if (rowsError) throw rowsError;
        if (!rows || rows.length === 0) {
            return NextResponse.json({ rows: [], patients: {} });
        }

        // Collect all patient IDs that need resolution info
        const patientIds = new Set<string>();
        for (const row of rows) {
            if (row.suggested_patient_id) patientIds.add(row.suggested_patient_id);
            if (row.resolved_patient_id) patientIds.add(row.resolved_patient_id);
        }

        // Fetch patient details for suggestions
        let patients: Record<string, { id: string; nombre: string; apellido: string; email: string | null; telefono: string | null }> = {};
        if (patientIds.size > 0) {
            const { data: patientData } = await adminClient
                .from('pacientes')
                .select('id_paciente, nombre, apellido, email, telefono')
                .in('id_paciente', Array.from(patientIds));

            if (patientData) {
                for (const p of patientData) {
                    patients[p.id_paciente] = {
                        id: p.id_paciente,
                        nombre: p.nombre,
                        apellido: p.apellido,
                        email: p.email,
                        telefono: p.telefono,
                    };
                }
            }
        }

        return NextResponse.json({ rows, patients });
    } catch (error: any) {
        console.error('[Import Resolve GET Error]', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}

/**
 * POST /api/agenda/import/resolve
 * Bulk-update resolved_patient_id for import rows.
 * Body: { jobId, resolutions: [{ rowId, patientId }] }
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId, resolutions } = await req.json();
        if (!jobId || !Array.isArray(resolutions)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // Update each row's resolved_patient_id and status
        let resolvedCount = 0;
        for (const { rowId, patientId } of resolutions) {
            if (!rowId) continue;

            const { error } = await adminClient
                .from('agenda_import_rows')
                .update({
                    resolved_patient_id: patientId || null,
                    status: patientId ? 'resolved' : 'pending',
                })
                .eq('id', rowId)
                .eq('job_id', jobId);

            if (!error) resolvedCount++;
        }

        return NextResponse.json({ success: true, resolvedCount });
    } catch (error: any) {
        console.error('[Import Resolve POST Error]', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
