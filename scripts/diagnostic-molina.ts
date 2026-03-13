import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('--- MOLINA DIAGNOSTIC ---');
    
    const { data: patients, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, is_deleted, estado_paciente, link_google_slides, link_historia_clinica, origen_registro')
        .ilike('apellido', '%Molina%');

    if (error) {
        console.error('Error fetching Molina:', error);
    } else {
        console.log(JSON.stringify(patients, null, 2));
    }
}

main().catch(console.error);
