import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ybozzesadqcorvfqpsyo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4'
);

const TEST_PATTERNS = [
    /prueba/i,
    /apellido/i,
    /\bpaciente\b/i,
    /\btest\b/i,
    /merino.*ariel/i,
    /ariel.*merino/i,
];

const { data: todos, error } = await supabase
    .from('pacientes')
    .select('id_paciente, nombre, apellido, email, whatsapp')
    .order('nombre', { ascending: true });

if (error) { console.error(error); process.exit(1); }

const aEliminar = todos.filter(p => {
    const full = `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
    return TEST_PATTERNS.some(re => re.test(full));
});

console.log(`\n══════════════════════════════════════════════`);
console.log(`  A ELIMINAR: ${aEliminar.length} de ${todos.length} pacientes`);
console.log(`══════════════════════════════════════════════\n`);

aEliminar.forEach((p, i) => {
    const nombre = `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
    const email = p.email || '-';
    const tel = p.whatsapp || '-';
    console.log(`${String(i+1).padStart(3)}. ${nombre.padEnd(35)} ${email.padEnd(35)} wa:${tel}`);
});
