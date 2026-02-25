/**
 * export_prospectos_ventas.ts
 *
 * Exporta todos los prospectos activos del workflow "Prospectos - 1ra Consulta"
 * como CSV ordenado por urgencia, listo para el equipo de ventas.
 *
 * Columnas: Prioridad, Nombre, Email, Teléfono, Interés, Fecha Consulta,
 *           Días desde consulta, Estado actual, Intentos de contacto
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/export_prospectos_ventas.ts
 *
 * Output:
 *   scripts/output/prospectos_ventas_YYYY-MM-DD.csv
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const PROSPECT_WORKFLOW_ID = '11111111-0000-0000-0000-000000000001';
const STAGE_CONVERTIDO     = '11111111-0001-0000-0000-000000000007';
const STAGE_NO_INTERESADO  = '11111111-0001-0000-0000-000000000008';

const STAGE_NAMES: Record<string, string> = {
    '11111111-0001-0000-0000-000000000001': 'Consulta Realizada',
    '11111111-0001-0000-0000-000000000002': '1er Contacto Enviado',
    '11111111-0001-0000-0000-000000000003': 'Propuesta Formal',
    '11111111-0001-0000-0000-000000000004': 'En Seguimiento Activo',
    '11111111-0001-0000-0000-000000000005': 'Retomó Contacto',
    '11111111-0001-0000-0000-000000000006': 'Señado ✓',
    '11111111-0001-0000-0000-000000000007': 'Convertido',
    '11111111-0001-0000-0000-000000000008': 'No Interesado',
};

const INTEREST_LABELS: Record<string, string> = {
    ortodoncia:      'Ortodoncia',
    carillas:        'Carillas / Diseño de Sonrisa',
    implantes:       'Implantes',
    blanqueamiento:  'Blanqueamiento',
    botox:           'Botox / Estética Facial',
    otro:            'Otro',
};

// ── Priority tier based on days since consultation ────────────────────────────

function getPrioridad(diasDesdeConsulta: number): string {
    if (diasDesdeConsulta <= 30)  return '🔴 URGENTE (< 1 mes)';
    if (diasDesdeConsulta <= 90)  return '🟠 ALTA (1-3 meses)';
    if (diasDesdeConsulta <= 180) return '🟡 MEDIA (3-6 meses)';
    if (diasDesdeConsulta <= 365) return '🟢 BAJA (6-12 meses)';
    return '⚪ HISTÓRICO (> 1 año)';
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvCell(val: string | number | null | undefined): string {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
    return cells.map(csvCell).join(',');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n📊 Exportando prospectos para equipo de ventas...\n');

    // Load all active prospects with patient data
    const { data: treatments, error } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            current_stage_id,
            prospect_consulta_date,
            prospect_main_interest,
            prospect_contact_count,
            last_stage_change,
            metadata,
            start_date,
            pacientes (
                id_paciente,
                nombre,
                apellido,
                email,
                telefono,
                whatsapp_pais_code,
                whatsapp_numero
            )
        `)
        .eq('workflow_id', PROSPECT_WORKFLOW_ID)
        .eq('status', 'active')
        .neq('current_stage_id', STAGE_CONVERTIDO)
        .neq('current_stage_id', STAGE_NO_INTERESADO);

    if (error) { console.error('❌', error.message); process.exit(1); }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build rows
    const rows = (treatments || []).map(t => {
        const p = (t.pacientes as any);
        const nombre   = p ? `${p.nombre} ${p.apellido}` : 'Desconocido';
        const email    = p?.email || '';
        const telefono = p?.whatsapp_numero
            ? `${p.whatsapp_pais_code || '+54'}${p.whatsapp_numero}`.replace(/\s/g, '')
            : (p?.telefono || '');

        const consultaDate = t.prospect_consulta_date || t.start_date?.slice(0, 10) || '';
        const diasDesde = consultaDate
            ? Math.floor((today.getTime() - new Date(consultaDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
            : 9999;

        const prioridad  = getPrioridad(diasDesde);
        const interes    = INTEREST_LABELS[t.prospect_main_interest || ''] || 'Sin definir';
        const etapa      = STAGE_NAMES[t.current_stage_id] || t.current_stage_id;
        const contactos  = t.prospect_contact_count || 0;
        const tieneEmail = email ? '✓' : '✗';
        const tieneTel   = telefono ? '✓' : '✗';

        return {
            diasDesde,
            prioridad,
            nombre,
            email,
            telefono,
            tieneEmail,
            tieneTel,
            interes,
            consultaDate,
            diasDesde_display: diasDesde === 9999 ? 'sin fecha' : `${diasDesde} días`,
            etapa,
            contactos,
        };
    });

    // Sort: urgency first (fewer days = more urgent), then by date desc
    rows.sort((a, b) => a.diasDesde - b.diasDesde);

    // Stats
    const urgente   = rows.filter(r => r.diasDesde <= 30).length;
    const alta      = rows.filter(r => r.diasDesde > 30  && r.diasDesde <= 90).length;
    const media     = rows.filter(r => r.diasDesde > 90  && r.diasDesde <= 180).length;
    const baja      = rows.filter(r => r.diasDesde > 180 && r.diasDesde <= 365).length;
    const historico = rows.filter(r => r.diasDesde > 365).length;
    const sinEmail  = rows.filter(r => !r.email).length;
    const sinTel    = rows.filter(r => !r.telefono).length;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('           PROSPECTOS — RESUMEN PARA VENTAS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total prospectos activos:     ${rows.length}`);
    console.log(`🔴 Urgente  (< 1 mes):        ${urgente}`);
    console.log(`🟠 Alta     (1-3 meses):      ${alta}`);
    console.log(`🟡 Media    (3-6 meses):      ${media}`);
    console.log(`🟢 Baja     (6-12 meses):     ${baja}`);
    console.log(`⚪ Histórico (> 1 año):       ${historico}`);
    console.log(`───────────────────────────────────────────────────────────────`);
    console.log(`Sin email:                    ${sinEmail}`);
    console.log(`Sin teléfono:                 ${sinTel}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Interest breakdown
    const byInterest: Record<string, number> = {};
    rows.forEach(r => { byInterest[r.interes] = (byInterest[r.interes] || 0) + 1; });
    console.log('📊 Por interés:');
    Object.entries(byInterest).sort((a, b) => b[1] - a[1])
        .forEach(([k, n]) => console.log(`   ${k.padEnd(30)} ${n}`));

    // Build CSV
    const headers = [
        'Prioridad',
        'Nombre',
        'Email',
        'Teléfono',
        'Tiene Email',
        'Tiene Teléfono',
        'Interés',
        'Fecha Consulta',
        'Días desde consulta',
        'Etapa actual',
        'Intentos de contacto',
    ];

    const csvLines = [
        headers.join(','),
        ...rows.map(r => csvRow([
            r.prioridad,
            r.nombre,
            r.email,
            r.telefono,
            r.tieneEmail,
            r.tieneTel,
            r.interes,
            r.consultaDate,
            r.diasDesde_display,
            r.etapa,
            r.contactos,
        ])),
    ];

    const dateStr = today.toISOString().slice(0, 10);
    const outDir  = path.resolve(process.cwd(), 'scripts/output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `prospectos_ventas_${dateStr}.csv`);
    fs.writeFileSync(outPath, csvLines.join('\n'), 'utf-8');

    console.log(`\n✅ CSV exportado: scripts/output/prospectos_ventas_${dateStr}.csv`);
    console.log(`   ${rows.length} filas · listo para importar en Google Sheets\n`);
    console.log('💡 Para importar en Google Sheets:');
    console.log('   1. Abrís un Sheet nuevo');
    console.log('   2. Archivo → Importar → Subir el CSV');
    console.log('   3. Separador: Coma · Listo\n');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
