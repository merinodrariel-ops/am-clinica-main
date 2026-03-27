/**
 * Bulk invite: manda invitaciones a todos los prestadores en `personal`
 * que tienen email pero todavía no tienen cuenta en auth.users.
 *
 * Uso: node scripts/bulk-invite-prestadores.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL = 'https://ybozzesadqcorvfqpsyo.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4';
const RESEND_API_KEY = 're_V1sbguSt_B3F9wrdy8tMsQdAAaACrHRyu';
const APP_URL = 'https://am-clinica-main.vercel.app';
const FROM = 'AM Clínica <info@amesteticadental.com>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

// Categoría por área de trabajo
function categoriaPorArea(area = '') {
    const a = area.toLowerCase();
    if (a.includes('odonto') || a.includes('dent')) return 'odontologo';
    if (a.includes('laboratorio') || a.includes('lab')) return 'laboratorio';
    if (a.includes('asistente')) return 'asistente';
    if (a.includes('recepci') || a.includes('admin')) return 'reception';
    if (a.includes('limpieza')) return 'asistente';
    return 'asistente'; // default seguro — sin acceso financiero
}

async function main() {
    console.log('=== Bulk invite prestadores ===\n');

    // 1. Obtener todos los prestadores con email
    const { data: prestadores, error: prestErr } = await supabase
        .from('personal')
        .select('id, nombre, apellido, email, area, categoria')
        .not('email', 'is', null)
        .neq('email', '');

    if (prestErr) { console.error('Error al leer personal:', prestErr); process.exit(1); }
    console.log(`Prestadores con email: ${prestadores.length}`);

    // 2. Obtener todos los usuarios de auth
    const { data: { users: authUsers }, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authErr) { console.error('Error al leer auth.users:', authErr); process.exit(1); }

    const authEmails = new Set(authUsers.map(u => u.email?.toLowerCase()));
    console.log(`Usuarios con cuenta de acceso: ${authEmails.size}\n`);

    // 3. Filtrar los que NO tienen cuenta
    const sinCuenta = prestadores.filter(p => p.email && !authEmails.has(p.email.toLowerCase()));
    console.log(`Prestadores sin cuenta de acceso: ${sinCuenta.length}\n`);

    if (sinCuenta.length === 0) {
        console.log('✅ Todos los prestadores ya tienen cuenta. No hay nada que hacer.');
        return;
    }

    // 4. Previsualización antes de enviar
    console.log('Se enviará invitación a:');
    sinCuenta.forEach(p => console.log(`  - ${p.nombre} ${p.apellido} <${p.email}> [${p.area || 'sin área'}]`));
    console.log('');

    // 5. Enviar invitaciones (1 por segundo para no saturar)
    let ok = 0, fail = 0;

    for (const p of sinCuenta) {
        const fullName = `${p.nombre} ${p.apellido}`.trim();
        const email = p.email.trim();
        const categoria = p.categoria || categoriaPorArea(p.area);

        try {
            // Intentar crear usuario; si ya existe usamos recovery en vez de invite
            let linkType = 'invite';
            const { error: createErr } = await supabase.auth.admin.createUser({
                email,
                user_metadata: { full_name: fullName, categoria },
                email_confirm: false,
            });
            if (createErr) {
                // Ya existe (probablemente Google OAuth) → mandarle link de recovery
                linkType = 'recovery';
            }

            // Generar link
            const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
                type: linkType,
                email,
                options: {
                    redirectTo: `${APP_URL}/auth/callback?next=/auth/update-password`,
                    data: { full_name: fullName },
                },
            });
            if (linkErr) throw linkErr;

            const inviteLink = linkData.properties.action_link;

            // Enviar email via Resend
            const { error: mailErr } = await resend.emails.send({
                from: FROM,
                to: email,
                subject: 'Tu acceso a AM Clínica está listo',
                html: buildInviteHtml(fullName, inviteLink),
            });
            if (mailErr) throw new Error(mailErr.message);

            console.log(`✅ ${fullName} <${email}>`);
            ok++;

            // Pausa para no superar rate limits de Resend
            await new Promise(r => setTimeout(r, 800));

        } catch (err) {
            console.error(`❌ ${fullName} <${email}>: ${err.message}`);
            fail++;
        }
    }

    console.log(`\n=== Resultado ===`);
    console.log(`✅ Invitaciones enviadas: ${ok}`);
    if (fail > 0) console.log(`❌ Fallidas: ${fail}`);
}

function buildInviteHtml(name, link) {
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:0 16px;">
    <div style="background:#111;border:1px solid #222;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1a1208,#0f0a04);padding:32px 32px 24px;border-bottom:1px solid #222;">
        <p style="margin:0 0 8px;color:#C9A96E;font-size:12px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">AM Clínica</p>
        <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;line-height:1.2;">Tu acceso está listo</h1>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 16px;color:#aaa;font-size:15px;line-height:1.6;">Hola <strong style="color:#fff;">${name}</strong>,</p>
        <p style="margin:0 0 24px;color:#aaa;font-size:15px;line-height:1.6;">
          Tu cuenta en AM Clínica fue creada. Hacé clic en el botón para elegir tu contraseña y acceder al portal.
        </p>
        <a href="${link}" style="display:inline-block;background:#C9A96E;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;">
          Crear mi contraseña →
        </a>
        <p style="margin:24px 0 0;color:#555;font-size:12px;line-height:1.6;">
          El link expira en 24 horas. Si no solicitaste esto, ignorá este email.
        </p>
      </div>
    </div>
    <p style="text-align:center;color:#333;font-size:11px;margin-top:20px;">AM Estética Dental · Buenos Aires</p>
  </div>
</body>
</html>`;
}

main().catch(err => { console.error(err); process.exit(1); });
