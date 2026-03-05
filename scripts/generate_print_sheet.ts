/**
 * generate_print_sheet.ts
 *
 * Genera un HTML listo para imprimir con los prospectos urgentes
 * (🔴 y 🟠) para el equipo de ventas.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/generate_print_sheet.ts
 *
 * Output:
 *   scripts/output/mision_ventas_2026-02-25.html
 *   → Abrir en Chrome → Imprimir (Ctrl+P) → Guardar como PDF
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^#=][^=]*)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  });
  return env;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROSPECT_WORKFLOW_ID = '11111111-0000-0000-0000-000000000001';
const STAGE_CONVERTIDO = '11111111-0001-0000-0000-000000000007';
const STAGE_NO_INTERESADO = '11111111-0001-0000-0000-000000000008';

const INTEREST_LABELS: Record<string, string> = {
  ortodoncia: 'Ortodoncia',
  carillas: 'Carillas',
  implantes: 'Implantes',
  blanqueamiento: 'Blanqueamiento',
  botox: 'Botox',
};

function diasDesde(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatPhone(p: any): string {
  if (p?.whatsapp_numero) return `${p.whatsapp_pais_code || '+54'} ${p.whatsapp_numero}`.trim();
  return p?.whatsapp || '';
}

async function main() {
  console.log('\n🖨️  Generando hoja de misión para ventas...\n');

  const { data: treatments } = await supabase
    .from('patient_treatments')
    .select(`
            prospect_consulta_date, prospect_main_interest, start_date,
            pacientes ( nombre, apellido, email, whatsapp, whatsapp_pais_code, whatsapp_numero )
        `)
    .eq('workflow_id', PROSPECT_WORKFLOW_ID)
    .eq('status', 'active')
    .neq('current_stage_id', STAGE_CONVERTIDO)
    .neq('current_stage_id', STAGE_NO_INTERESADO);

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  const rows = (treatments || []).map(t => {
    const p = t.pacientes as any;
    const consultaDate = t.prospect_consulta_date || t.start_date?.slice(0, 10) || '';
    const dias = consultaDate ? diasDesde(consultaDate) : 9999;
    return {
      nombre: p ? `${p.nombre} ${p.apellido}` : '—',
      email: p?.email || '',
      whatsapp: formatPhone(p),
      interes: INTEREST_LABELS[t.prospect_main_interest || ''] || '',
      consultaDate,
      dias,
    };
  }).sort((a, b) => a.dias - b.dias);

  const urgente = rows.filter(r => r.dias <= 30);
  const alta = rows.filter(r => r.dias > 30 && r.dias <= 90);
  const media = rows.filter(r => r.dias > 90 && r.dias <= 180);

  function tableRows(list: typeof rows, showDias = true): string {
    return list.map((r, i) => `
            <tr class="${i % 2 === 0 ? 'even' : ''}">
                <td class="num">${i + 1}</td>
                <td class="name">${r.nombre}</td>
                <td>${r.email ? `<span class="contact">${r.email}</span>` : '<span class="missing">sin email</span>'}</td>
                <td>${r.whatsapp ? `<span class="contact">${r.whatsapp}</span>` : '<span class="missing">sin WA</span>'}</td>
                <td class="tag">${r.interes ? `<span class="badge">${r.interes}</span>` : ''}</td>
                <td class="center">${r.consultaDate ? formatDate(r.consultaDate) : '—'}</td>
                ${showDias ? `<td class="center dias">${r.dias === 9999 ? '—' : r.dias + 'd'}</td>` : ''}
                <td class="check"><span class="checkbox"></span></td>
            </tr>`).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Misión Ventas — AM Estética Dental — ${dateStr}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: #1a1a2e;
    background: #fff;
    padding: 20px 24px;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 3px solid #0f3460;
  }
  .brand { font-size: 18px; font-weight: 800; color: #0f3460; letter-spacing: -0.5px; }
  .brand span { color: #e94560; }
  .subtitle { font-size: 11px; color: #666; margin-top: 2px; }
  .meta { text-align: right; font-size: 10px; color: #888; }
  .meta strong { display: block; font-size: 13px; color: #0f3460; font-weight: 700; }

  /* ── Briefing box ── */
  .briefing {
    background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
    color: white;
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 20px;
    display: flex;
    gap: 24px;
    align-items: center;
  }
  .briefing-title { font-size: 14px; font-weight: 800; letter-spacing: -0.3px; }
  .briefing-sub { font-size: 10px; opacity: 0.75; margin-top: 2px; }
  .kpis { display: flex; gap: 20px; margin-left: auto; }
  .kpi { text-align: center; }
  .kpi-val { font-size: 22px; font-weight: 800; line-height: 1; }
  .kpi-label { font-size: 9px; opacity: 0.7; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi.red .kpi-val { color: #ff6b6b; }
  .kpi.orange .kpi-val { color: #ffa94d; }
  .kpi.yellow .kpi-val { color: #ffe066; }

  /* ── Section headers ── */
  .section {
    margin-bottom: 22px;
    page-break-inside: avoid;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-radius: 7px;
    margin-bottom: 8px;
    font-weight: 700;
    font-size: 12px;
  }
  .section-header.red    { background: #fff0f0; color: #c0392b; border-left: 4px solid #e74c3c; }
  .section-header.orange { background: #fff8f0; color: #d35400; border-left: 4px solid #f39c12; }
  .section-header.yellow { background: #fffbf0; color: #b7770d; border-left: 4px solid #f1c40f; }
  .section-header .count {
    margin-left: auto;
    font-size: 10px;
    background: rgba(0,0,0,0.1);
    padding: 2px 8px;
    border-radius: 20px;
  }

  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  th {
    background: #f1f3f8;
    padding: 5px 8px;
    text-align: left;
    font-weight: 600;
    color: #555;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid #e0e0e0;
  }
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: middle;
  }
  tr.even td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }

  .num { color: #aaa; font-size: 9.5px; width: 22px; }
  .name { font-weight: 600; color: #1a1a2e; }
  .contact { color: #0f3460; font-family: monospace; font-size: 10px; }
  .missing { color: #ccc; font-style: italic; }
  .center { text-align: center; }
  .dias { font-weight: 700; }
  .check { width: 30px; text-align: center; }
  .checkbox {
    display: inline-block;
    width: 14px; height: 14px;
    border: 1.5px solid #bbb;
    border-radius: 3px;
  }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 20px;
    background: #e8f4fd;
    color: #2980b9;
    font-size: 9px;
    font-weight: 600;
  }
  .tag { width: 90px; }

  /* ── Instructions ── */
  .instructions {
    margin-top: 20px;
    padding: 12px 16px;
    background: #f8f9fc;
    border-radius: 8px;
    border: 1px solid #e8ecf4;
    page-break-inside: avoid;
  }
  .instructions h3 { font-size: 11px; font-weight: 700; color: #0f3460; margin-bottom: 8px; }
  .instructions ol { padding-left: 16px; }
  .instructions li { margin-bottom: 4px; line-height: 1.5; color: #444; }
  .instructions li strong { color: #1a1a2e; }

  /* ── Footer ── */
  .footer {
    margin-top: 16px;
    padding-top: 10px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #bbb;
  }

  /* ── Print ── */
  @media print {
    body { padding: 12px 16px; font-size: 10.5px; }
    .section { page-break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="brand">AM <span>Estética</span> Dental</div>
    <div class="subtitle">Hoja de Misión — Equipo de Ventas</div>
  </div>
  <div class="meta">
    <strong>Fecha: ${dateStr.split('-').reverse().join('/')}</strong>
    Generado automáticamente desde el sistema
  </div>
</div>

<!-- Briefing -->
<div class="briefing">
  <div>
    <div class="briefing-title">🎯 Misión: Recontactar prospectos prioritarios</div>
    <div class="briefing-sub">Pacientes que consultaron y no iniciaron tratamiento. Foco en los más recientes.</div>
  </div>
  <div class="kpis">
    <div class="kpi red">
      <div class="kpi-val">${urgente.length}</div>
      <div class="kpi-label">🔴 Urgentes</div>
    </div>
    <div class="kpi orange">
      <div class="kpi-val">${alta.length}</div>
      <div class="kpi-label">🟠 Alta prio.</div>
    </div>
    <div class="kpi yellow">
      <div class="kpi-val">${media.length}</div>
      <div class="kpi-label">🟡 Media</div>
    </div>
  </div>
</div>

<!-- URGENTE -->
<div class="section">
  <div class="section-header red">
    🔴 URGENTE — Consultaron hace menos de 1 mes
    <span class="count">${urgente.length} pacientes · cerrar esta semana</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Nombre</th>
        <th>Email</th>
        <th>WhatsApp</th>
        <th>Interés</th>
        <th class="center">Consulta</th>
        <th class="center">Hace</th>
        <th class="center">✓</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows(urgente)}
    </tbody>
  </table>
</div>

<!-- ALTA -->
<div class="section">
  <div class="section-header orange">
    🟠 ALTA PRIORIDAD — Consultaron hace 1 a 3 meses
    <span class="count">${alta.length} pacientes · esta semana / próxima</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Nombre</th>
        <th>Email</th>
        <th>WhatsApp</th>
        <th>Interés</th>
        <th class="center">Consulta</th>
        <th class="center">Hace</th>
        <th class="center">✓</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows(alta)}
    </tbody>
  </table>
</div>

<!-- MEDIA -->
${media.length > 0 ? `
<div class="section">
  <div class="section-header yellow">
    🟡 MEDIA — Consultaron hace 3 a 6 meses
    <span class="count">${media.length} pacientes · este mes</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Nombre</th>
        <th>Email</th>
        <th>WhatsApp</th>
        <th>Interés</th>
        <th class="center">Consulta</th>
        <th class="center">Hace</th>
        <th class="center">✓</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows(media)}
    </tbody>
  </table>
</div>
` : ''}

<!-- Instructions -->
<div class="instructions">
  <h3>📋 Instrucciones para el equipo</h3>
  <ol>
    <li><strong>Empezar por los 🔴 URGENTES</strong> — son los más frescos, mayor probabilidad de conversión.</li>
    <li><strong>Primer contacto:</strong> WhatsApp personalizado mencionando el tratamiento de interés. No usar mensajes genéricos.</li>
    <li><strong>Si no responden en 48hs:</strong> llamada telefónica + segundo mensaje.</li>
    <li><strong>Marcar el tilde (✓)</strong> cuando el paciente fue contactado y actualizar el estado en el sistema.</li>
    <li><strong>Si agenda turno:</strong> registrar en el sistema como "Agendado" y notificar al Dr. Merino.</li>
    <li><strong>Sin email ni WhatsApp:</strong> consultar con recepción si tienen otro dato de contacto.</li>
  </ol>
</div>

<!-- Footer -->
<div class="footer">
  <span>AM Estética Dental · Sistema de Gestión Interno · Confidencial</span>
  <span>Generado el ${dateStr} · ${urgente.length + alta.length + media.length} prospectos en esta hoja</span>
</div>

</body>
</html>`;

  const outPath = path.resolve(process.cwd(), `scripts/output/mision_ventas_${dateStr}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(`✅ Hoja generada: scripts/output/mision_ventas_${dateStr}.html`);
  console.log(`\n   Incluye:`);
  console.log(`   🔴 ${urgente.length} urgentes`);
  console.log(`   🟠 ${alta.length} alta prioridad`);
  console.log(`   🟡 ${media.length} media prioridad`);
  console.log(`\n💡 Para imprimir:`);
  console.log(`   1. Abrí el archivo en Chrome`);
  console.log(`   2. Ctrl+P (o Cmd+P en Mac)`);
  console.log(`   3. Destino: "Guardar como PDF" o impresora directa`);
  console.log(`   4. Orientación: Horizontal · Márgenes: Mínimos\n`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
