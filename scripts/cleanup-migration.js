
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const NOISE_PATTERNS = [
    /reuni/i, /curso/i, /staff/i, /vacaciones/i, /feriado/i, /almuerzo/i,
    /lunch/i, /personal/i, /bloqueo/i, /mantenimiento/i, /limpieza/i,
    /no viene/i, /no esta/i, /no está/i, /ausente/i, /aviso/i, /cancelado/i,
    /recordatorio/i, /aniversario/i, /cumpleaños/i, /feliz/i, /pago/i,
    /cuota/i, /alquiler/i, /residuos/i, /patol/i, /banco/i, /trámite/i,
    /tramite/i, /doctor/i, /dra\./i, /dr\./i, /odont/i, /asistente/i,
    /hasta las/i, /desde las/i, /libre/i, /zoom/i, /meet/i, /llamar/i,
    /notar/i, /aviso/i, /confirm/i, /mensaje/i, /wp/i, /wpp/i, /pagar/i, /pago/i,
    /vencimiento/i, /financiacion/i, /cuota/i, /seña/i, /debe/i, /cobrar/i,
    /consultas/i // Added "consultas" plural as it often refers to blocks in this context
];

async function cleanup() {
    console.log('--- Cleaning up potential noise from imported appointments ---');
    const { data: apps, error } = await supabase
        .from('agenda_appointments')
        .select('id, title')
        .eq('source', 'google_calendar_migration');

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Checking ${apps.length} appointments...`);

    let removedCount = 0;
    for (const app of apps) {
        const isNoise = NOISE_PATTERNS.some(p => p.test(app.title));
        if (isNoise) {
            console.log(`- Removing noise: ${app.title}`);
            const { error: delError } = await supabase
                .from('agenda_appointments')
                .delete()
                .eq('id', app.id);

            if (delError) console.error(`Error deleting ${app.id}:`, delError);
            else removedCount++;
        }
    }

    console.log(`\nCleanup complete. Removed ${removedCount} noise events.`);

    const { count } = await supabase
        .from('agenda_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'google_calendar_migration');

    console.log(`Final count in database: ${count}`);
}

cleanup();
