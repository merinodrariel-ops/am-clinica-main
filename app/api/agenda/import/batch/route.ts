import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { correlatePatient, CsvMapping } from '@/lib/am-scheduler/csv-import';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId, rows, mapping } = await req.json();

        if (!jobId || !rows || !mapping || !Array.isArray(rows)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // Process correlation in parallel for the batch
        const importRows = await Promise.all(
            rows.map(async (row: any) => {
                const correlation = await correlatePatient(row, mapping as CsvMapping);
                let status = 'pending';

                // Auto-match if confidence is very high
                if (correlation.confidence >= 80) {
                    status = 'matched';
                } else if (correlation.confidence === 0) {
                    status = 'unmatched'; // Optional clarification
                }

                return {
                    job_id: jobId,
                    raw_data: row,
                    status,
                    suggested_patient_id: correlation.patientId,
                    match_confidence: correlation.confidence,
                    match_reasons: correlation.reasons,
                };
            })
        );

        const { error } = await adminClient.from('agenda_import_rows').insert(importRows);
        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, processedCount: rows.length });
    } catch (error: any) {
        console.error('[Import Batch API Error]', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
