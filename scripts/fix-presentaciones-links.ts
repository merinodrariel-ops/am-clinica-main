import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolvePatientPresentationLinkAction } from '../app/actions/presentaciones';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Buscando paciente Chasquez Milena...');
    
    // 1. Encontrar a Chasquez Milena y Molina Eugenia
    const { data: pacientes, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_google_slides')
        .or('apellido.ilike.%Chasquez%,apellido.ilike.%Molina%');

    if (error) {
        console.error('Error fetched pacientes', error);
        return;
    }

    for (const p of pacientes || []) {
        console.log(`\nProcesando a ${p.apellido}, ${p.nombre}...`);
        console.log(`Link google slides actual: ${p.link_google_slides}`);
        
        // Limpiamos el link para forzar regeneración
        await supabase
            .from('pacientes')
            .update({ link_google_slides: null })
            .eq('id_paciente', p.id_paciente);
        
        console.log('Link seteado a null. Ahora resolviendo usando la nueva logica...');
        
        const result = await resolvePatientPresentationLinkAction(p.id_paciente);
        console.log(`Resultado de resolver: `, result);
    }
}

main().catch(console.error);
