import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { extractFolderIdFromUrl, listFolderFiles } from '../lib/google-drive';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: patient, error } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id_paciente', '2d298146-745c-4069-902e-5025d1b6536e')
        .single();
    
    if (error || !patient) {
        console.error("Error or no patient:", error);
        return;
    }
    
    console.log("Patient: ", patient.nombre, patient.apellido);
    console.log("Link HC: ", patient.link_historia_clinica);
    console.log("Link pres: ", patient.link_google_slides);
    console.log("Foto facial: ", patient.foto_facial);
    
    const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica || '');
    if (!motherFolderId) {
        console.log("No mother folder.");
        return;
    }
    
    console.log(`Mother folder ID: ${motherFolderId}`);
    
    const result = await listFolderFiles(motherFolderId);
    if (result.error) return;
    
    for (const f of result.files) {
        console.log(`- Folder: ${f.name} id: ${f.id}`);
        const subResult = await listFolderFiles(f.id);
        if (subResult.error) {
        } else {
            for (const sf of subResult.files) {
                 console.log(`     - File: ${sf.name}`);
                 console.log(`     - Id: ${sf.id} (type: ${sf.mimeType})`);
                 console.log(`     - Link: ${sf.webViewLink}`);
            }
        }
    }
}
main().catch(console.error);
