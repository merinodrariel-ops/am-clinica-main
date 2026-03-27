import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
    'https://ybozzesadqcorvfqpsyo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4'
);

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
