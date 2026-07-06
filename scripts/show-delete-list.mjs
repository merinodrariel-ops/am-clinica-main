import { createClient } from '@supabase/supabase-js';

// Credenciales desde el entorno (correr con: node --env-file=.env.local scripts/<script>.mjs)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exit(1);
}
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
