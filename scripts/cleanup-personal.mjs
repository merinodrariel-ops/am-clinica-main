/**
 * Limpieza de registros de prueba en `personal` y ajuste de rol.
 * node scripts/cleanup-personal.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ybozzesadqcorvfqpsyo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4'
);

const EMAILS_BORRAR = [
    'owner@clinica.com',
    'merinodrariel@gmail.com',
    'asd@gmail.com',
];

const EMAIL_RECEPCION = 'dr.arielmerino@gmail.com';

async function main() {
    // 1. Borrar registros de prueba de personal
    for (const email of EMAILS_BORRAR) {
        const { error } = await supabase.from('personal').delete().eq('email', email);
        if (error) console.error(`❌ No se pudo borrar ${email}:`, error.message);
        else console.log(`🗑  Borrado de personal: ${email}`);
    }

    // 2. Actualizar dr.arielmerino a categoria reception en profiles
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) { console.error('Error listUsers:', listErr); return; }

    const recepUser = users.find(u => u.email?.toLowerCase() === EMAIL_RECEPCION.toLowerCase());
    if (recepUser) {
        const { error: updErr } = await supabase.auth.admin.updateUserById(recepUser.id, {
            user_metadata: { ...recepUser.user_metadata, categoria: 'reception' },
        });
        if (updErr) console.error('❌ Error actualizando metadata:', updErr.message);
        else console.log(`✅ ${EMAIL_RECEPCION} → categoria: reception (metadata)`);

        // También actualizar profiles si existe
        const { error: profErr } = await supabase
            .from('profiles')
            .update({ categoria: 'reception' })
            .eq('id', recepUser.id);
        if (profErr) console.error('❌ Error actualizando profiles:', profErr.message);
        else console.log(`✅ profiles actualizado para ${EMAIL_RECEPCION}`);
    } else {
        console.log(`ℹ️  ${EMAIL_RECEPCION} no tiene cuenta auth todavía (se puede ignorar)`);
    }

    console.log('\nListo.');
}

main().catch(err => { console.error(err); process.exit(1); });
