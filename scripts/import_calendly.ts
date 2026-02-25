/**
 * import_calendly.ts
 *
 * Importa todos los registros del Google Sheet de Calendly y cruza contra
 * la base de datos de pacientes en Supabase. Para cada registro:
 *
 *   A) Paciente YA en DB sin email/teléfono  → completa los datos faltantes
 *   B) Paciente YA en DB sin workflow Prospectos → lo inscribe
 *   C) Paciente NO en DB (evento "primera consulta") → crea legajo + inscribe
 *
 * Flags:
 *   --dry-run   Solo muestra qué haría (default)
 *   --import    Escribe en Supabase
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/import_calendly.ts
 *   npx ts-node --transpile-only scripts/import_calendly.ts --import
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ── Constants ─────────────────────────────────────────────────────────────────

const SHEET_ID = '1XjMpSfBNfAxXl-eT-E5F4HaBsMb5V9YwVsbZAxf5Rms';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

const PROSPECT_WORKFLOW_ID = '11111111-0000-0000-0000-000000000001';
const STAGE_CONSULTA_REALIZADA = '11111111-0001-0000-0000-000000000001';
const STAGE_CONVERTIDO = '11111111-0001-0000-0000-000000000007';
const STAGE_NO_INTERESADO = '11111111-0001-0000-0000-000000000008';

// Emails internos a ignorar (doctor, test, admin)
const SKIP_EMAILS = new Set([
    'dr.arielmerinopersonal@gmail.com',
    'drarielmerino@gmail.com',
    'amesteticadentaladm@gmail.com',
    'ventas.clinicas@grimbergdentales.com', // proveedor, no paciente
]);

// Palabras clave para detectar "primera consulta"
const FIRST_CONSULT_KEYWORDS = [
    'primera vez',
    'primera consulta',
    'turno / consulta',
    'turno/consulta',
];

// ── CSV Fetch ─────────────────────────────────────────────────────────────────

function fetchUrl(url: string, redirectCount = 0): Promise<string> {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) { reject(new Error('Too many redirects')); return; }
        https.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ── CSV Parser (handles quoted fields with embedded commas and newlines) ──────

function parseCSV(csv: string): string[][] {
    const rows: string[][] = [];
    let i = 0;
    const len = csv.length;

    while (i < len) {
        const row: string[] = [];
        while (i < len && csv[i] !== '\n') {
            if (csv[i] === '"') {
                i++; // skip opening quote
                let field = '';
                while (i < len) {
                    if (csv[i] === '"' && csv[i + 1] === '"') { field += '"'; i += 2; }
                    else if (csv[i] === '"') { i++; break; }
                    else { field += csv[i++]; }
                }
                row.push(field);
                if (csv[i] === ',') i++;
            } else {
                let field = '';
                while (i < len && csv[i] !== ',' && csv[i] !== '\n') field += csv[i++];
                row.push(field.trim());
                if (csv[i] === ',') i++;
            }
        }
        if (csv[i] === '\n') i++;
        if (row.some(c => c.length > 0)) rows.push(row);
    }
    return rows;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendlyRow {
    inviteeName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    eventType: string;
    startDate: string;      // YYYY-MM-DD
    canceled: boolean;
    responses: string[];
    isFirstConsult: boolean;
}

interface Patient {
    id_paciente: string;
    nombre: string;
    apellido: string;
    email: string | null;
    telefono: string | null;
}

type ActionType =
    | 'enroll'          // ya en DB, inscribir en Prospectos
    | 'patch_contact'   // ya en DB, completar email/teléfono faltante
    | 'create_and_enroll' // no está en DB, crear + inscribir
    | 'skip_converted'  // ya convirtió, ignorar
    | 'skip_enrolled'   // ya está en Prospectos, ignorar
    | 'skip_active_tx'  // tiene tratamiento activo, ignorar
    | 'skip_no_first_consult' // no es primera consulta y no está en DB, ignorar
    | 'skip_no_real_name';    // nombre inválido (sólo nombre de pila, etc.)

interface ProcessedRow {
    action: ActionType;
    calendly: CalendlyRow;
    patient?: Patient;
    patchFields?: { email?: string; telefono?: string };
    interest?: string;
    notes?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str: string): string {
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferInterest(eventType: string, responses: string[]): string | undefined {
    const text = normalize([eventType, ...responses].join(' '));
    if (text.includes('ortodoncia') || text.includes('alineador') || text.includes('bracket')) return 'ortodoncia';
    if (text.includes('carill') || text.includes('diseno') || text.includes('sonrisa') || text.includes('veneer') || text.includes('faceta')) return 'carillas';
    if (text.includes('implante')) return 'implantes';
    if (text.includes('blanquea')) return 'blanqueamiento';
    if (text.includes('botox') || text.includes('relleno') || text.includes('hialuronico')) return 'botox';
    return undefined;
}

function findPatientByName(firstName: string, lastName: string, patients: Patient[]): Patient | null {
    if (!firstName || !lastName || lastName.length < 2) return null;
    const normN = normalize(firstName);
    const normA = normalize(lastName);
    for (const p of patients) {
        const pN = normalize(p.nombre || '');
        const pA = normalize(p.apellido || '');
        const nParts = normN.split(' ').filter(x => x.length >= 3);
        const aParts = normA.split(' ').filter(x => x.length >= 3);
        if (nParts.length === 0 || aParts.length === 0) continue;
        const nameOk = nParts.some(part => pN.includes(part));
        const surnameOk = aParts.some(part => pA.includes(part));
        if (nameOk && surnameOk) return p;
    }
    return null;
}

function parseCalendlyRows(rows: string[][]): CalendlyRow[] {
    if (rows.length === 0) return [];
    const headers = rows[0].map(h => h.toLowerCase().trim());
    const col = (name: string) => headers.findIndex(h => h.includes(name));

    const idxName    = col('invitee name');
    const idxFirst   = col('invitee first name');
    const idxLast    = col('invitee last name');
    const idxEmail   = col('invitee email');
    const idxPhone   = col('text reminder number');
    const idxEvent   = col('event type name');
    const idxStart   = col('start date');
    const idxCancel  = col('canceled');
    const respIdxs   = headers.reduce<number[]>((acc, h, i) => { if (/^response \d+$/.test(h)) acc.push(i); return acc; }, []);

    const result: CalendlyRow[] = [];

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const email = (r[idxEmail] || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        if (SKIP_EMAILS.has(email)) continue;

        const canceled   = (r[idxCancel] || '').toLowerCase() === 'true';
        const inviteeName = (r[idxName] || '').trim();
        const firstName  = (r[idxFirst] || inviteeName.split(' ')[0] || '').trim();
        const lastName   = (r[idxLast] || inviteeName.split(' ').slice(1).join(' ') || '').trim();
        const phone      = (r[idxPhone] || '').trim() || null;
        const eventType  = (r[idxEvent] || '').trim();
        const startRaw   = (r[idxStart] || '').trim();
        const startDate  = startRaw.length >= 10 ? startRaw.slice(0, 10) : '';
        const responses  = respIdxs.map(ri => (r[ri] || '').trim()).filter(Boolean);
        const eventLow   = eventType.toLowerCase();
        const isFirstConsult = FIRST_CONSULT_KEYWORDS.some(kw => eventLow.includes(kw));

        result.push({ inviteeName, firstName, lastName, email, phone, eventType, startDate, canceled, responses, isFirstConsult });
    }

    return result;
}

// Deduplicate by email: keep earliest date per email (for prospect_consulta_date)
function deduplicateByEmail(rows: CalendlyRow[]): CalendlyRow[] {
    const map = new Map<string, CalendlyRow>();
    for (const row of rows) {
        const existing = map.get(row.email);
        if (!existing) {
            map.set(row.email, row);
        } else {
            // Keep earliest date; prefer isFirstConsult=true; merge phone if missing
            const earlierDate = row.startDate < existing.startDate ? row : existing;
            map.set(row.email, {
                ...earlierDate,
                phone: existing.phone || row.phone,
                isFirstConsult: existing.isFirstConsult || row.isFirstConsult,
                responses: [...new Set([...existing.responses, ...row.responses])],
            });
        }
    }
    return Array.from(map.values());
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const doImport = args.includes('--import');

    console.log(`\n🔵 Modo: ${doImport ? 'IMPORTACIÓN → Supabase' : 'DRY RUN (sin escritura)'}`);
    if (!doImport) console.log('   Tip: pasar --import para escribir en Supabase.\n');

    // ── 1. Fetch Calendly data ────────────────────────────────────────────────
    console.log('📥 Descargando datos de Calendly (Google Sheet)...');
    const csvRaw = await fetchUrl(SHEET_URL);
    const rows = parseCSV(csvRaw);
    console.log(`   → ${rows.length - 1} filas en el CSV`);

    const allCalendly = parseCalendlyRows(rows);
    console.log(`   → ${allCalendly.length} registros válidos (con email, no internos)`);

    const notCanceled = allCalendly.filter(r => !r.canceled);
    console.log(`   → ${notCanceled.length} no cancelados`);

    const unique = deduplicateByEmail(notCanceled);
    console.log(`   → ${unique.length} únicos por email (deduplicados)\n`);

    // ── 2. Load Supabase data ─────────────────────────────────────────────────
    console.log('🔌 Cargando datos de Supabase...');

    const { data: patientsRaw, error: pErr } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, email, telefono')
        .eq('is_deleted', false);
    if (pErr) { console.error('❌', pErr.message); process.exit(1); }
    const patients: Patient[] = patientsRaw || [];

    // Index by email for fast lookup
    const patientByEmail = new Map<string, Patient>();
    for (const p of patients) {
        if (p.email) patientByEmail.set(p.email.toLowerCase().trim(), p);
    }

    const { data: existingProspects } = await supabase
        .from('patient_treatments')
        .select('patient_id, current_stage_id')
        .eq('workflow_id', PROSPECT_WORKFLOW_ID);

    const enrolledIds = new Set((existingProspects || []).map(r => r.patient_id));
    const convertedOrLost = new Set(
        (existingProspects || [])
            .filter(r => r.current_stage_id === STAGE_CONVERTIDO || r.current_stage_id === STAGE_NO_INTERESADO)
            .map(r => r.patient_id)
    );

    const { data: activeTx } = await supabase
        .from('patient_treatments')
        .select('patient_id')
        .neq('workflow_id', PROSPECT_WORKFLOW_ID)
        .eq('status', 'active');
    const activeIds = new Set((activeTx || []).map(r => r.patient_id));

    console.log(`✅ ${patients.length} pacientes | ${enrolledIds.size} en Prospectos | ${activeIds.size} con tratamiento activo\n`);

    // ── 3. Process each Calendly row ──────────────────────────────────────────
    const processed: ProcessedRow[] = [];

    for (const cal of unique) {
        const interest = inferInterest(cal.eventType, cal.responses);

        // Find patient: email first, then name
        let patient = patientByEmail.get(cal.email) || null;
        if (!patient) {
            patient = findPatientByName(cal.firstName, cal.lastName, patients);
        }

        if (patient) {
            const pid = patient.id_paciente;

            if (convertedOrLost.has(pid)) {
                processed.push({ action: 'skip_converted', calendly: cal, patient, interest });
                continue;
            }
            if (enrolledIds.has(pid)) {
                // Check if we should patch missing contact
                const patchFields: { email?: string; telefono?: string } = {};
                if (!patient.email && cal.email) patchFields.email = cal.email;
                if (!patient.telefono && cal.phone) patchFields.telefono = cal.phone;
                if (Object.keys(patchFields).length > 0) {
                    processed.push({ action: 'patch_contact', calendly: cal, patient, patchFields, interest });
                } else {
                    processed.push({ action: 'skip_enrolled', calendly: cal, patient, interest });
                }
                continue;
            }
            if (activeIds.has(pid)) {
                processed.push({ action: 'skip_active_tx', calendly: cal, patient, interest });
                continue;
            }

            // In DB, not enrolled, no active treatment
            const patchFields: { email?: string; telefono?: string } = {};
            if (!patient.email && cal.email) patchFields.email = cal.email;
            if (!patient.telefono && cal.phone) patchFields.telefono = cal.phone;

            processed.push({ action: 'enroll', calendly: cal, patient, patchFields, interest });

        } else {
            // Not in DB at all
            if (!cal.isFirstConsult) {
                processed.push({ action: 'skip_no_first_consult', calendly: cal, interest });
                continue;
            }
            if (!cal.lastName || cal.lastName.length < 2) {
                processed.push({ action: 'skip_no_real_name', calendly: cal, interest });
                continue;
            }

            processed.push({ action: 'create_and_enroll', calendly: cal, interest });
        }
    }

    // ── 4. Summary ────────────────────────────────────────────────────────────
    const byAction = (a: ActionType) => processed.filter(p => p.action === a);

    const toEnroll          = byAction('enroll');
    const toPatch           = byAction('patch_contact');
    const toCreate          = byAction('create_and_enroll');
    const skipConverted     = byAction('skip_converted');
    const skipEnrolled      = byAction('skip_enrolled');
    const skipActiveTx      = byAction('skip_active_tx');
    const skipNoConsult     = byAction('skip_no_first_consult');
    const skipNoName        = byAction('skip_no_real_name');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('           CALENDLY IMPORT — RESUMEN');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📥 Total registros únicos de Calendly:   ${unique.length}`);
    console.log(`───────────────────────────────────────────────────────────────`);
    console.log(`🆕 Crear legajo + inscribir en Prospectos: ${toCreate.length}`);
    console.log(`📋 Inscribir en Prospectos (ya en DB):     ${toEnroll.length}`);
    console.log(`📧 Completar email/teléfono (ya inscripto): ${toPatch.length}`);
    console.log(`───────────────────────────────────────────────────────────────`);
    console.log(`⏭  Ya convertido o perdido:               ${skipConverted.length}`);
    console.log(`⏭  Ya en Prospectos (sin datos faltantes): ${skipEnrolled.length}`);
    console.log(`⏭  Tiene tratamiento activo:              ${skipActiveTx.length}`);
    console.log(`⏭  No es "primera consulta" y no en DB:   ${skipNoConsult.length}`);
    console.log(`⏭  Sin apellido real:                     ${skipNoName.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Interest breakdown
    const allActionable = [...toCreate, ...toEnroll];
    const interestCount: Record<string, number> = {};
    for (const p of allActionable) {
        const k = p.interest || 'sin_definir';
        interestCount[k] = (interestCount[k] || 0) + 1;
    }
    if (Object.keys(interestCount).length > 0) {
        console.log('📊 Interés detectado (en actionables):');
        Object.entries(interestCount).sort((a, b) => b[1] - a[1])
            .forEach(([k, n]) => console.log(`   ${k.padEnd(20)} ${n}`));
        console.log('');
    }

    // Preview creates
    if (toCreate.length > 0) {
        console.log(`🆕 CREAR + INSCRIBIR (${toCreate.length}):`);
        toCreate.slice(0, 20).forEach(p => {
            const phone = p.calendly.phone ? '📞' : '  ';
            console.log(`   ${p.calendly.startDate} ${phone} ${p.calendly.firstName} ${p.calendly.lastName} <${p.calendly.email}> [${p.interest || '?'}]`);
        });
        if (toCreate.length > 20) console.log(`   ... y ${toCreate.length - 20} más`);
        console.log('');
    }

    // Preview enrollments (existing patients)
    if (toEnroll.length > 0) {
        console.log(`📋 INSCRIBIR en Prospectos - ya en DB (${toEnroll.length}):`);
        toEnroll.slice(0, 20).forEach(p => {
            const name = `${p.patient!.nombre} ${p.patient!.apellido}`;
            console.log(`   ${p.calendly.startDate}  ${name} <${p.calendly.email}> [${p.interest || '?'}]`);
        });
        if (toEnroll.length > 20) console.log(`   ... y ${toEnroll.length - 20} más`);
        console.log('');
    }

    // Preview patches
    if (toPatch.length > 0) {
        console.log(`📧 COMPLETAR DATOS (${toPatch.length}):`);
        toPatch.forEach(p => {
            const fields = Object.entries(p.patchFields || {}).map(([k, v]) => `${k}=${v}`).join(', ');
            const name = `${p.patient!.nombre} ${p.patient!.apellido}`;
            console.log(`   ${name} → ${fields}`);
        });
        console.log('');
    }

    if (!doImport) {
        console.log('⚡ Para importar, ejecutar:');
        console.log('   npx ts-node --transpile-only scripts/import_calendly.ts --import\n');

        // Save dry-run report
        const reportPath = path.resolve(process.cwd(), 'scripts/output/calendly_import_report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            mode: 'dry_run',
            stats: {
                total_calendly: unique.length,
                to_create: toCreate.length,
                to_enroll: toEnroll.length,
                to_patch: toPatch.length,
                skipped: skipConverted.length + skipEnrolled.length + skipActiveTx.length + skipNoConsult.length + skipNoName.length,
            },
            to_create: toCreate.map(p => ({
                name: `${p.calendly.firstName} ${p.calendly.lastName}`,
                email: p.calendly.email,
                phone: p.calendly.phone,
                date: p.calendly.startDate,
                interest: p.interest,
                event_type: p.calendly.eventType,
            })),
            to_enroll: toEnroll.map(p => ({
                name: `${p.patient!.nombre} ${p.patient!.apellido}`,
                email: p.calendly.email,
                date: p.calendly.startDate,
                interest: p.interest,
            })),
            to_patch: toPatch.map(p => ({
                name: `${p.patient!.nombre} ${p.patient!.apellido}`,
                fields: p.patchFields,
            })),
        }, null, 2));
        console.log(`📄 Reporte guardado en: scripts/output/calendly_import_report.json`);
        return;
    }

    // ── 5. Execute actions ────────────────────────────────────────────────────
    console.log(`\n🚀 Iniciando importación...\n`);

    let created = 0, enrolled = 0, patched = 0, errors = 0;

    // A) Create new patients + enroll
    for (const p of toCreate) {
        const { firstName, lastName, email, phone, startDate } = p.calendly;

        const { data: newPatient, error: createErr } = await supabase
            .from('pacientes')
            .insert({
                nombre: firstName,
                apellido: lastName,
                email: email,
                telefono: phone || null,
                origen_registro: 'calendly',
                fecha_alta: new Date().toISOString().slice(0, 10),
                estado_paciente: 'prospecto',
                observaciones_generales: `Importado de Calendly. Primera consulta: ${startDate}. Tipo: ${p.calendly.eventType}.`,
                is_deleted: false,
            })
            .select('id_paciente')
            .single();

        if (createErr) {
            // Skip duplicates silently
            if (createErr.code !== '23505') {
                console.error(`  ❌ Crear ${firstName} ${lastName}: ${createErr.message}`);
                errors++;
            }
            continue;
        }

        created++;
        console.log(`  ✅ Creado: ${firstName} ${lastName} <${email}>`);

        // Enroll in Prospectos
        const { error: enrollErr } = await supabase.from('patient_treatments').insert({
            patient_id: newPatient.id_paciente,
            workflow_id: PROSPECT_WORKFLOW_ID,
            current_stage_id: STAGE_CONSULTA_REALIZADA,
            start_date: new Date(startDate).toISOString(),
            last_stage_change: new Date(startDate).toISOString(),
            status: 'active',
            prospect_main_interest: p.interest || null,
            prospect_consulta_date: startDate,
            prospect_contact_count: 0,
            metadata: { source: 'calendly_import', import_source: 'calendly', event_type: p.calendly.eventType },
        });

        if (enrollErr && enrollErr.code !== '23505') {
            console.error(`    ⚠️  Inscripción ${firstName} ${lastName}: ${enrollErr.message}`);
        } else {
            enrolled++;
        }
    }

    // B) Enroll existing patients
    for (const p of toEnroll) {
        const pid = p.patient!.id_paciente;
        const { startDate } = p.calendly;

        // Patch missing contact info first
        if (p.patchFields && Object.keys(p.patchFields).length > 0) {
            await supabase.from('pacientes').update(p.patchFields).eq('id_paciente', pid);
        }

        const { error: enrollErr } = await supabase.from('patient_treatments').insert({
            patient_id: pid,
            workflow_id: PROSPECT_WORKFLOW_ID,
            current_stage_id: STAGE_CONSULTA_REALIZADA,
            start_date: new Date(startDate).toISOString(),
            last_stage_change: new Date(startDate).toISOString(),
            status: 'active',
            prospect_main_interest: p.interest || null,
            prospect_consulta_date: startDate,
            prospect_contact_count: 0,
            metadata: { source: 'calendly_import', import_source: 'calendly', event_type: p.calendly.eventType },
        });

        if (enrollErr) {
            if (enrollErr.code !== '23505') {
                console.error(`  ❌ ${p.patient!.nombre} ${p.patient!.apellido}: ${enrollErr.message}`);
                errors++;
            }
            continue;
        }

        console.log(`  📋 Inscripto: ${p.patient!.nombre} ${p.patient!.apellido} (${startDate})`);
        enrolled++;
    }

    // C) Patch contact info only (already enrolled)
    for (const p of toPatch) {
        if (!p.patchFields || Object.keys(p.patchFields).length === 0) continue;
        const { error: patchErr } = await supabase
            .from('pacientes')
            .update(p.patchFields)
            .eq('id_paciente', p.patient!.id_paciente);

        if (patchErr) {
            console.error(`  ❌ Patch ${p.patient!.nombre}: ${patchErr.message}`);
            errors++;
        } else {
            const fields = Object.keys(p.patchFields).join(', ');
            console.log(`  📧 Datos completados: ${p.patient!.nombre} ${p.patient!.apellido} → ${fields}`);
            patched++;
        }
    }

    // ── 6. Final report ───────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`✅ Pacientes creados:          ${created}`);
    console.log(`📋 Inscritos en Prospectos:    ${enrolled}`);
    console.log(`📧 Datos de contacto parcheados: ${patched}`);
    console.log(`❌ Errores:                    ${errors}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\nYa visibles en /workflows → Prospectos - 1ra Consulta');

    const reportPath = path.resolve(process.cwd(), 'scripts/output/calendly_import_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        mode: 'import',
        stats: { created, enrolled, patched, errors },
    }, null, 2));
    console.log(`\n📄 Reporte guardado en: scripts/output/calendly_import_report.json`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
