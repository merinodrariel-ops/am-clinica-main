import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function normalize(apellido: string, nombre: string): string {
    return `${(apellido || '').toUpperCase().trim()}, ${(nombre || '').trim().charAt(0).toUpperCase()}${(nombre || '').trim().slice(1).toLowerCase()}`;
}

async function main() {
    const { data: patients } = await sb
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_historia_clinica')
        .order('apellido');

    if (!patients) return;

    // Group by normalized name
    const groups = new Map<string, typeof patients>();
    for (const p of patients) {
        const key = normalize(p.apellido || '', p.nombre || '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
    }

    // Show duplicates
    const dupes = Array.from(groups.entries()).filter(([, v]) => v.length > 1);
    console.log(`Total pacientes: ${patients.length}`);
    console.log(`Nombres únicos: ${groups.size}`);
    console.log(`Nombres con duplicados: ${dupes.length}`);
    console.log();

    // Top duplicates
    dupes.sort((a, b) => b[1].length - a[1].length);
    console.log('Top duplicados:');
    for (const [name, items] of dupes.slice(0, 20)) {
        console.log(`  ${name} × ${items.length} (IDs: ${items.map(i => i.id_paciente.slice(0, 8)).join(', ')})`);
    }
}

main().catch(console.error);
