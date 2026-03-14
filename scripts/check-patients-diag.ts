import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Fetching details for Molina and Kobal...');
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_google_slides, link_historia_clinica, foto_facial')
        .or('apellido.ilike.%Molina%,apellido.ilike.%Kobal%');

    if (error) {
        console.error(error);
        return;
    }

    console.table(data);

    for (const p of data || []) {
        console.log(`\n--- ${p.apellido}, ${p.nombre} ---`);
        const { data: pres } = await supabase
            .from('paciente_presentaciones')
            .select('drive_name, drive_web_view_link, is_deleted')
            .eq('paciente_id', p.id_paciente);
        
        console.log('Presentaciones en tabla paciente_presentaciones:');
        console.table(pres);
    }
}

main().catch(console.error);
