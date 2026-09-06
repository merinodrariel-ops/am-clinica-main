/** Read-only checks against the configured database. Never sends messages. */
import { createClient } from '@supabase/supabase-js';
import { loadDashboardStats } from '../lib/dashboard-queries';
import { loadTodayWork } from '../lib/today-work';
import { getDashboardDates } from '../lib/dashboard-dates';
import { runReminderCycle } from '../lib/am-scheduler/reminder-cycle';

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing database configuration');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const stats = await loadDashboardStats(client);
    if (!stats.patientsCount) throw new Error('Expected patient data is missing');
    console.log('dashboard: OK (expected data present)');
    const counts = await loadTodayWork(client, { todos: true, recalls: true });
    if (counts.todos === null || counts.recalls === null) throw new Error('Pending work query failed');
    console.log('pending work: OK (schema/data check; UI remains RLS-scoped)');
    const dates = getDashboardDates();
    const { data, error } = await client.from('agenda_appointments').select('start_time')
        .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
        .not('status', 'in', '("cancelled","no_show")')
        .gte('start_time', `${dates.comparisonMonthStart}T00:00:00-03:00`)
        .lt('start_time', dates.nextMonthStartInstant);
    if (error || !data?.length) throw new Error('Expected agenda comparison data is missing');
    console.log('agenda date range: OK (expected data present)');
    const prohibited = async (): Promise<never> => { throw new Error('Dry run attempted a side effect'); };
    const cycle = await runReminderCycle({ supabase: client, sendNotification: prohibited,
        createAndSendSurvey: prohibited, createRecalls: prohibited }, { dryRun: true });
    if (cycle.failed.length) throw new Error(`Reminder queries failed: ${cycle.failed.join(',')}`);
    console.log('reminder cycle: OK (dry run; no writes or deliveries)');
}

main().catch(() => { console.error('Read-only contract verification failed'); process.exitCode = 1; });
