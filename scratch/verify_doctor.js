require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDoctor() {
    console.log('--- Buscando a la Dra. Cande Cruz en la base de datos ---');
    
    // 1. Query staff table
    const { data: personal, error: pError } = await supabase
        .from('personal')
        .select('*')
        .ilike('nombre', '%cande%');
        
    if (pError) {
        console.error('Error al consultar tabla personal:', pError);
        return;
    }
    
    if (!personal || personal.length === 0) {
        console.log('No se encontró a nadie llamado "Cande" en la tabla personal.');
        return;
    }
    
    console.log('Encontrada en tabla personal:');
    personal.forEach(p => {
        console.log(`- ID: ${p.id}`);
        console.log(`  Nombre: ${p.nombre} ${p.apellido}`);
        console.log(`  Email: ${p.email}`);
        console.log(`  user_id (vinculado a auth): ${p.user_id}`);
        console.log(`  Categoría: ${p.categoria}`);
        console.log(`  Activo: ${p.activo}`);
    });
    
    const doctor = personal[0];
    if (doctor.user_id) {
        // 2. Query profiles table
        const { data: profile, error: prError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', doctor.user_id)
            .maybeSingle();
            
        if (prError) {
            console.error('Error al consultar tabla profiles:', prError);
        } else if (profile) {
            console.log('\nEncontrado perfil de acceso en tabla profiles:');
            console.log(`- ID: ${profile.id}`);
            console.log(`  Email: ${profile.email}`);
            console.log(`  Nombre: ${profile.full_name}`);
            console.log(`  Categoría/Rol de acceso: ${profile.categoria}`);
            console.log(`  Estado: ${profile.estado}`);
        } else {
            console.log('\nEl user_id está registrado pero no existe entrada en la tabla profiles.');
        }
    } else {
        console.log('\nAlerta: El registro de la doctora no está vinculado a ningún usuario de autenticación (user_id es NULL).');
    }
}

checkDoctor();
