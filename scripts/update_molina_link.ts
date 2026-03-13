import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const oldPresentationId = '1RHGOtEWaRxL0PulCAsGLMIqaSKyHQY72EztkZ2um_t4'; // The one from 2025

    console.log(`Actualizando Molina Maria Eugenia...`);
    const { error } = await supabase
        .from('pacientes')
        .update({
            link_google_slides: `https://docs.google.com/presentation/d/${oldPresentationId}/edit?usp=drivesdk`
        })
        .eq('id_paciente', '2d298146-745c-4069-902e-5025d1b6536e'); 

    if (error) {
        console.error('❌ Error actualizando Supabase:', error);
    } else {
        console.log(`✅ Link en base de datos apuntando a la presentación de Molina.`);
    }
}

main().catch(console.error);
