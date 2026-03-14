import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const oldPresentationId = '1cohk-k-CEpsyIL8G7MN74asprq1c0EXpHuVR4AhFvR8'; // The one from 2024

    console.log(`3. Actualizando el link en la base de datos de Supabase...`);
    const { error } = await supabase
        .from('pacientes')
        .update({
            link_google_slides: `https://docs.google.com/presentation/d/${oldPresentationId}/edit?usp=drivesdk`
        })
        .eq('id_paciente', '3453ef3c-0f7b-405c-a025-70178404d91f'); // Ana Lia active record

    if (error) {
        console.error('❌ Error actualizando Supabase:', error);
    } else {
        console.log(`✅ Link en base de datos apuntando a la presentación original de 2024.`);
    }
}

main().catch(console.error);
