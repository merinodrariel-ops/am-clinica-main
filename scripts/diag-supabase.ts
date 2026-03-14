import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_google_slides, link_historia_clinica')
        .or('apellido.ilike.%Molina%,apellido.ilike.%Kobal%');

    if (error) {
        console.error('Supabase Error:', error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}
run();
