const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const { syncPatientPresentationsForPatient } = require('../app/actions/presentaciones.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function finalize() {
    const patients = [
        { id: '2d298146-745c-4069-902e-5025d1b6536e', mother: '14d4REXk0KpIwk3oSJiqj-1XH4Ovgug1J' }, // Maria Eugenia Molina
        { id: '3453ef3c-0f7b-405c-a025-70178404d91f', mother: '17JwTp5dkAGaEW6E-AZlGa4hzz9uyBDSm' }  // Ana Lia Kobal
    ];

    for (const p of patients) {
        console.log(`Finalizing patient ${p.id}...`);
        
        // Update mother folder link
        await supabase.from('pacientes').update({
            link_historia_clinica: `https://drive.google.com/drive/folders/${p.mother}`,
            link_google_slides: null // Reset to force re-discovery
        }).eq('id_paciente', p.id);

        console.log(`  Syncing presentations...`);
        try {
            await syncPatientPresentationsForPatient(p.id);
            console.log(`  Sync result: success`);
        } catch (e) {
            console.error(`  Sync failed for ${p.id}:`, e);
        }
    }
}

finalize().catch(console.error);
