import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { source, totalRows, settings } = await req.json();

        if (!source || typeof totalRows !== 'number') {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { data: job, error } = await supabase
            .from('agenda_import_jobs')
            .insert({
                created_by: user.id,
                source,
                status: 'pending',
                total_rows: totalRows,
                settings,
            })
            .select('id')
            .single();

        if (error || !job) {
            throw error;
        }

        return NextResponse.json({ success: true, jobId: job.id });
    } catch (error: any) {
        console.error('[Import Job API Error]', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
