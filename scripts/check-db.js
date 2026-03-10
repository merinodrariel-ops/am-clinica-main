
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { count, error } = await supabase
        .from('agenda_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'google_calendar_migration');

    if (error) console.error(error);
    else console.log('Count:', count);
}
check();
