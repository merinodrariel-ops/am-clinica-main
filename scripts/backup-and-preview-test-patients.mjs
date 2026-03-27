import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
    'https://ybozzesadqcorvfqpsyo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4'
);

// 1. BACKUP: exportar TODOS los pacientes
const { data: todos, error } = await supabase
    .from('pacientes')
    .select('*')
    .order('id_paciente', { ascending: true });

if (error) { console.error('Error:', error); process.exit(1); }

// Guardar CSV completo
const headers = Object.keys(todos[0] || {}).join(',');
const rows = todos.map(p => Object.values(p).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
const csv = [headers, ...rows].join('\n');
const filename = `scripts/backup-pacientes-${new Date().toISOString().split('T')[0]}.csv`;
writeFileSync(filename, csv, 'utf8');
console.log(`✅ Backup guardado: ${filename} (${todos.length} pacientes)`);

// 2. PREVIEW: mostrar cuáles serían borrados
const TEST_PATTERNS = [
    /prueba/i,
    /apellido/i,
    /paciente/i,
    /test/i,
    /demo/i,
    /ejemplo/i,
    /merino.*ariel/i,
    /ariel.*merino/i,
];

const aEliminar = todos.filter(p => {
    const full = `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
    return TEST_PATTERNS.some(re => re.test(full));
});

const aConservar = todos.filter(p => !aEliminar.includes(p));

console.log(`\n🗑️  PACIENTES QUE SE BORRARÍAN (${aEliminar.length}):`);
aEliminar.forEach(p => console.log(`   [${p.id_paciente}] ${p.nombre} ${p.apellido ?? ''} | ${p.email ?? ''} | ${p.telefono ?? ''}`));

console.log(`\n✅ PACIENTES QUE SE CONSERVARÍAN (${aConservar.length}):`);
aConservar.slice(0, 20).forEach(p => console.log(`   [${p.id_paciente}] ${p.nombre} ${p.apellido ?? ''}`));
if (aConservar.length > 20) console.log(`   ... y ${aConservar.length - 20} más`);

console.log('\n⚠️  Revisá la lista y avisá si está OK para proceder con el borrado.');
