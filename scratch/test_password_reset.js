require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { EmailService } = require('../lib/email-service');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getAppPublicUrl() {
    const url = process.env.NEXT_PUBLIC_APP_URL;
    if (url && !url.includes('localhost')) {
        return url.replace(/\/$/, '');
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return 'https://am-clinica-main.vercel.app';
}

async function testReset() {
    const email = 'dra.candelacruz@gmail.com';
    console.log(`--- Simulando restablecimiento de contraseña para: ${email} ---`);
    
    try {
        // 1. Fetch profile name
        const { data: profile, error: dbError } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('email', email)
            .maybeSingle();
            
        if (dbError) throw dbError;
        const name = profile?.full_name || 'Candela Cruz';
        console.log(`Paso 1: Nombre encontrado -> "${name}"`);

        // 2. Generate recovery link
        const publicUrl = getAppPublicUrl();
        console.log(`Paso 2: Generando link con redirect a ${publicUrl}`);
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: {
                redirectTo: `${publicUrl}/auth/callback?next=/auth/update-password`
            }
        });

        if (linkError) throw linkError;
        
        const actionLink = linkData?.properties?.action_link;
        if (!actionLink) throw new Error('No se pudo generar el enlace de recuperación');
        console.log(`Link generado con éxito: ${actionLink.slice(0, 70)}...`);

        // 3. Send email using Resend
        console.log('Paso 3: Enviando email a través de Resend...');
        const emailRes = await EmailService.sendPasswordReset(name, email, actionLink);
        
        if (emailRes.success) {
            console.log(`¡Éxito! Email enviado correctamente. ID del mensaje: ${emailRes.id}`);
        } else {
            console.error('Error al enviar el email:', emailRes.error);
        }
    } catch (error) {
        console.error('Fallo en la prueba de restablecimiento:', error);
    }
}

testReset();
