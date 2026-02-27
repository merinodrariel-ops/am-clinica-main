import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
    const { data: all } = await sb
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_historia_clinica')
        .order('apellido');

    console.log('Total pacientes:', all?.length);

    const withFolder = all?.filter(p => p.link_historia_clinica) || [];
    const withoutFolder = all?.filter(p => !p.link_historia_clinica) || [];

    console.log('Con carpeta Drive:', withFolder.length);
    console.log('Sin carpeta Drive:', withoutFolder.length);

    console.log('\nPacientes SIN carpeta:');
    withoutFolder.forEach(p => console.log('  -', p.apellido, p.nombre));

    console.log('\nPacientes CON carpeta:');
    withFolder.forEach(p => console.log('  -', p.apellido, p.nombre, '→', (p.link_historia_clinica || '').substring(0, 70)));
}

main().catch(console.error);
