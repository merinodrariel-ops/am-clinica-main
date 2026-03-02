import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { CsvMapping } from '@/lib/am-scheduler/csv-import';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await req.json();
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // Fetch Job & Settings
        const { data: job, error: jobError } = await adminClient
            .from('agenda_import_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) throw new Error('Job not found');

        const mapping = job.settings as CsvMapping;
        if (!mapping) throw new Error('Missing mapping settings in job');

        // Fetch all mapped/resolved rows
        const { data: rowsToImport, error: rowsError } = await adminClient
            .from('agenda_import_rows')
            .select('*')
            .eq('job_id', jobId)
            .in('status', ['matched', 'resolved']);

        if (rowsError) throw rowsError;
        if (!rowsToImport || rowsToImport.length === 0) {
            return NextResponse.json({ success: true, importedCount: 0, message: 'No mapped rows found to import.' });
        }

        // Map rows to `agenda_appointments` format
        const appointmentsToInsert = rowsToImport.map((rowData) => {
            const raw = rowData.raw_data;
            const finalPatientId = rowData.resolved_patient_id || rowData.suggested_patient_id;

            const title = mapping.title ? raw[mapping.title] : 'Importado';
            const parsedStart = new Date(raw[mapping.startTime]).toISOString();
            let parsedEnd = new Date(parsedStart);

            if (mapping.endTime && raw[mapping.endTime]) {
                parsedEnd = new Date(raw[mapping.endTime]);
            } else {
                // Default to 1 hour if no end time
                parsedEnd.setHours(parsedEnd.getHours() + 1);
            }

            return {
                patient_id: finalPatientId,
                doctor_id: job.created_by, // Use the user who initiated the job as the default doctor
                start_time: parsedStart,
                end_time: parsedEnd.toISOString(),
                title: title || 'Turno Histórico',
                status: 'completed', // By default, historical imports are usually past
                type: 'consulta',
                notes: mapping.notes ? raw[mapping.notes] : null,
                source: job.source,
                external_id: `import_${jobId}_${rowData.id}`,
            };
        });

        // Execute bulk insert in chunks to avoid Supabase limits
        const chunkSize = 500;
        let importedRows = 0;
        for (let i = 0; i < appointmentsToInsert.length; i += chunkSize) {
            const chunk = appointmentsToInsert.slice(i, i + chunkSize);
            const { error: insertError } = await adminClient.from('agenda_appointments').insert(chunk);
            if (insertError) {
                console.error('[Import Execute] Chunk insert error:', insertError);
                throw insertError;
            }
            importedRows += chunk.length;
        }

        // Update job row statuses
        await adminClient
            .from('agenda_import_rows')
            .update({ status: 'imported' })
            .in('id', rowsToImport.map(r => r.id));

        // Update job status
        await adminClient
            .from('agenda_import_jobs')
            .update({ status: 'completed', imported_rows: importedRows })
            .eq('id', jobId);

        return NextResponse.json({ success: true, importedCount: importedRows });

    } catch (error: any) {
        console.error('[Import Execute API Error]', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
