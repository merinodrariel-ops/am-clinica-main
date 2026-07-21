import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

// Credenciales desde el entorno (correr con: node --env-file=.env.local scripts/<script>.mjs)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exit(1);
}
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Paginar para traer TODOS
const PAGE = 1000;
let all = [];
let from = 0;
while (true) {
    const { data, error } = await supabase
        .from('pacientes')
        .select('*')
        .range(from, from + PAGE - 1)
        .order('id_paciente');
    if (error) { console.error(error); process.exit(1); }
    all = all.concat(data);
    console.log(`  Cargados ${all.length}...`);
    if (data.length < PAGE) break;
    from += PAGE;
}

console.log(`\nTotal en DB: ${all.length}`);

// CSV backup completo
const headers = Object.keys(all[0] || {}).join(',');
const rows = all.map(p => Object.values(p).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
const csv = [headers, ...rows].join('\n');
const filename = `scripts/backup-pacientes-completo-${new Date().toISOString().split('T')[0]}.csv`;
writeFileSync(filename, csv, 'utf8');
console.log(`✅ Backup completo guardado: ${filename}`);

// Preview por tipo de paciente
const TEST_PATTERNS = [/prueba/i, /apellido/i, /\bpaciente\b/i, /\btest\b/i, /merino.*ariel/i, /ariel.*merino/i];
const aEliminar = all.filter(p => TEST_PATTERNS.some(re => re.test(`${p.nombre ?? ''} ${p.apellido ?? ''}`)));
const aConservar = all.filter(p => !aEliminar.includes(p));

// Nombres únicos a eliminar
const nombresUnicos = [...new Set(aEliminar.map(p => `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim()))].sort();

console.log(`\n🗑️  A ELIMINAR: ${aEliminar.length} pacientes de prueba`);
console.log(`   Nombres únicos involucrados:`);
nombresUnicos.forEach(n => console.log(`     - ${n}`));

console.log(`\n✅ A CONSERVAR: ${aConservar.length} pacientes reales`);
