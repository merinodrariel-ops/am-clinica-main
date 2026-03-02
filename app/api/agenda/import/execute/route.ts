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

        // Fetch all importable rows (matched, resolved, AND unmatched/pending — we import all, with or without patient)
        const { data: rowsToImport, error: rowsError } = await adminClient
            .from('agenda_import_rows')
            .select('*')
            .eq('job_id', jobId)
            .in('status', ['matched', 'resolved', 'pending', 'unmatched']);

        if (rowsError) throw rowsError;
        if (!rowsToImport || rowsToImport.length === 0) {
            return NextResponse.json({ success: true, importedCount: 0, skippedCount: 0, message: 'No rows found to import.' });
        }

        const matchedRows = rowsToImport.filter((r: any) => ['matched', 'resolved'].includes(r.status));
        const unmatchedRows = rowsToImport.filter((r: any) => ['pending', 'unmatched'].includes(r.status));

        // Map rows to `agenda_appointments` format
        let skippedCount = 0;
        const appointmentsToInsert: any[] = [];

        for (const rowData of rowsToImport) {
            const raw = rowData.raw_data;
            const finalPatientId = rowData.resolved_patient_id || rowData.suggested_patient_id || null;

            const title = mapping.title ? raw[mapping.title] : 'Importado';
            const startRaw = raw[mapping.startTime];

            // Skip rows with invalid/missing start time
            const parsedStartDate = new Date(startRaw);
            if (!startRaw || isNaN(parsedStartDate.getTime())) {
                skippedCount++;
                continue;
            }

            const parsedStart = parsedStartDate.toISOString();
            let parsedEnd = new Date(parsedStart);

            if (mapping.endTime && raw[mapping.endTime]) {
                const endDate = new Date(raw[mapping.endTime]);
                if (!isNaN(endDate.getTime())) {
                    parsedEnd = endDate;
                } else {
                    parsedEnd.setHours(parsedEnd.getHours() + 1);
                }
            } else {
                // Default to 1 hour if no end time
                parsedEnd.setHours(parsedEnd.getHours() + 1);
            }

            // Determine status: future events → confirmed, past → completed
            const isFuture = parsedStartDate.getTime() > Date.now();

            appointmentsToInsert.push({
                patient_id: finalPatientId,
                doctor_id: job.created_by,
                start_time: parsedStart,
                end_time: parsedEnd.toISOString(),
                title: title || 'Turno Importado',
                status: isFuture ? 'confirmed' : 'completed',
                type: 'consulta',
                notes: mapping.notes ? raw[mapping.notes] : null,
                source: job.source,
                external_id: `import_${jobId}_${rowData.id}`,
            });
        }

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
            .in('id', rowsToImport.map((r: any) => r.id));

        // Update job status
        await adminClient
            .from('agenda_import_jobs')
            .update({ status: 'completed', imported_rows: importedRows })
            .eq('id', jobId);

        // Calculate date range of imported events for calendar navigation
        let minDate: string | null = null;
        let maxDate: string | null = null;
        if (appointmentsToInsert.length > 0) {
            const starts = appointmentsToInsert.map(a => a.start_time).sort();
            minDate = starts[0];
            maxDate = starts[starts.length - 1];
        }

        return NextResponse.json({
            success: true,
            importedCount: importedRows,
            skippedCount,
            matchedCount: matchedRows.length,
            unmatchedCount: unmatchedRows.length,
            dateRange: minDate && maxDate ? { min: minDate, max: maxDate } : null,
        });

    } catch (error: any) {
        console.error('[Import Execute API Error]', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
