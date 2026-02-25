/**
 * enroll_prospectos.ts
 *
 * Detecta pacientes con "1era vez" / "consulta" en agenda_appointments
 * que NO tienen turno de tratamiento posterior → los inscribe en el workflow
 * "Prospectos - 1ra Consulta" (ID determinístico).
 *
 * Fuentes de candidatos:
 *   A) agenda_appointments: type='consulta' importados del Google Calendar
 *   B) Lista manual de nombres provistos por el médico (Jan–Feb 2025)
 *
 * Flags:
 *   --dry-run    Solo muestra qué se haría (default)
 *   --enroll     Escribe a Supabase
 *   --source-a   Solo agenda_appointments (default: ambas)
 *   --source-b   Solo lista manual
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/enroll_prospectos.ts --dry-run
 *   npx ts-node --transpile-only scripts/enroll_prospectos.ts --enroll
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

const PROSPECT_WORKFLOW_ID = '11111111-0000-0000-0000-000000000001';
const STAGE_CONSULTA_REALIZADA = '11111111-0001-0000-0000-000000000001';
const STAGE_CONVERTIDO = '11111111-0001-0000-0000-000000000007';
const STAGE_NO_INTERESADO = '11111111-0001-0000-0000-000000000008';

// ── Manual list (from Jan–Feb 2025 first-time consultations) ──────────────────
// These were provided by the doctor from memory/records.
// Format: { name, date, interest }

interface ManualProspect {
    name: string;
    date: string;  // YYYY-MM-DD
    interest?: string;
    notes?: string;
}

const MANUAL_PROSPECTS: ManualProspect[] = [
    // Jan 2025
    { name: 'Nicolas Grimberg',      date: '2025-01-07', interest: 'carillas' },
    { name: 'Luciana Perrone',       date: '2025-01-08', interest: 'ortodoncia' },
    { name: 'Agustina Mochi',        date: '2025-01-09', interest: 'ortodoncia' },
    { name: 'Ingrid',                date: '2025-01-09', interest: 'blanqueamiento' },
    { name: 'Guillermo Posse',       date: '2025-01-10', interest: 'implantes' },
    { name: 'Fabian Frick',          date: '2025-01-13', interest: 'implantes' },
    { name: 'Maximiliano Miranda',   date: '2025-01-13', interest: 'implantes' },
    { name: 'Sabina Ferreyra',       date: '2025-01-14', interest: 'carillas' },
    { name: 'Franco Sunsundegui',    date: '2025-01-15', interest: 'ortodoncia' },
    { name: 'Gisele Politi',         date: '2025-01-16', interest: 'carillas' },
    { name: 'Daniela Ramos',         date: '2025-01-17', interest: 'carillas' },
    { name: 'Carolina Malvicino',    date: '2025-01-17', interest: 'carillas' },
    { name: 'Florencia Roumec',      date: '2025-01-20', interest: 'ortodoncia' },
    { name: 'Valentina Vallejos',    date: '2025-01-21', interest: 'carillas' },
    { name: 'Carla Gehrke',          date: '2025-01-22', interest: 'ortodoncia' },
    { name: 'Ariel Rodriguez',       date: '2025-01-22', interest: 'implantes' },
    { name: 'Gonzalo Lucero',        date: '2025-01-23', interest: 'ortodoncia' },
    { name: 'Romina Crespo',         date: '2025-01-24', interest: 'carillas' },
    { name: 'Adriana Cacciacane',    date: '2025-01-27', interest: 'carillas' },
    { name: 'Claudia Acchiardi',     date: '2025-01-27', interest: 'carillas' },
    { name: 'Gabriela Castillo',     date: '2025-01-27', interest: 'ortodoncia' },
    { name: 'Ana Ferrari',           date: '2025-01-28', interest: 'carillas' },
    { name: 'Santiago Lopez',        date: '2025-01-29', interest: 'ortodoncia' },
    { name: 'Matias Collazo',        date: '2025-01-30', interest: 'implantes' },
    { name: 'Juan Ignacio Roumec',   date: '2025-01-31', interest: 'ortodoncia' },
    // Feb 2025
    { name: 'Martina Albornoz',      date: '2025-02-03', interest: 'carillas' },
    { name: 'Diego Mendez',          date: '2025-02-04', interest: 'implantes' },
    { name: 'Micaela Suarez',        date: '2025-02-05', interest: 'ortodoncia' },
    { name: 'Ileana Duarte',         date: '2025-02-06', interest: 'blanqueamiento' },
    { name: 'Natalia Barros',        date: '2025-02-07', interest: 'carillas' },
    { name: 'Lucas Fernandez',       date: '2025-02-10', interest: 'implantes' },
    { name: 'Vanesa Gutierrez',      date: '2025-02-11', interest: 'carillas' },
    { name: 'Paula Trujillo',        date: '2025-02-12', interest: 'ortodoncia' },
    { name: 'Roberto Britos',        date: '2025-02-13', interest: 'implantes' },
    { name: 'Silvana Cano',          date: '2025-02-14', interest: 'carillas' },
    { name: 'Hernan Blanco',         date: '2025-02-17', interest: 'ortodoncia' },
    { name: 'Tamara Solis',          date: '2025-02-18', interest: 'blanqueamiento' },
    { name: 'Eduardo Paz',           date: '2025-02-19', interest: 'implantes' },
    { name: 'Lorena Gimenez',        date: '2025-02-20', interest: 'carillas' },
    { name: 'Alberto Gomez',         date: '2025-02-21', interest: 'implantes' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str: string): string {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Patient {
    id_paciente: string;
    nombre: string;
    apellido: string;
    email: string | null;
    normFull: string;
    normNombre: string;
    normApellido: string;
}

function findPatient(searchName: string, patients: Patient[]): Patient | null {
    const normName = normalize(searchName);
    for (const p of patients) {
        const nParts = p.normNombre.split(/\s+/).filter(x => x.length >= 3);
        const aParts = p.normApellido.split(/\s+/).filter(x => x.length >= 3);
        if (nParts.length === 0 || aParts.length === 0) continue;
        const hasNombre = nParts.some(part => normName.includes(part));
        const hasApellido = aParts.some(part => normName.includes(part));
        if (hasNombre && hasApellido) return p;
    }
    return null;
}

interface EnrollCandidate {
    source: 'agenda' | 'manual';
    patient_id: string;
    patient_name: string;
    patient_email: string | null;
    consulta_date: string;
    interest?: string;
    has_treatment: boolean;  // already has a real treatment in another workflow
    already_enrolled: boolean;
    reason_skip?: string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const doEnroll = args.includes('--enroll');
    const onlySourceA = args.includes('--source-a');
    const onlySourceB = args.includes('--source-b');
    const useSourceA = !onlySourceB;
    const useSourceB = !onlySourceA;

    console.log(`\n🔵 Modo: ${doEnroll ? 'INSCRIPCIÓN → Supabase' : 'DRY RUN (sin escritura)'}`);
    if (!doEnroll) console.log('   Tip: pasar --enroll para inscribir pacientes reales.\n');

    // Load all patients
    console.log('🔌 Cargando pacientes desde Supabase...');
    const { data: patientsRaw, error: pErr } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, email')
        .eq('is_deleted', false);

    if (pErr) { console.error('❌', pErr.message); process.exit(1); }

    const patients: Patient[] = (patientsRaw || []).map(p => ({
        ...p,
        normFull: normalize(`${p.nombre} ${p.apellido}`),
        normNombre: normalize(p.nombre || ''),
        normApellido: normalize(p.apellido || ''),
    }));
    console.log(`✅ ${patients.length} pacientes cargados`);

    // Load existing prospect enrollments (avoid double-enrollment)
    const { data: existingProspects } = await supabase
        .from('patient_treatments')
        .select('patient_id, current_stage_id, status')
        .eq('workflow_id', PROSPECT_WORKFLOW_ID);

    const enrolledPatientIds = new Set((existingProspects || []).map(r => r.patient_id));
    const convertedOrLost = new Set(
        (existingProspects || [])
            .filter(r => r.current_stage_id === STAGE_CONVERTIDO || r.current_stage_id === STAGE_NO_INTERESADO)
            .map(r => r.patient_id)
    );

    // Load patient_ids that have real treatments (other workflows)
    const { data: treatmentRows } = await supabase
        .from('patient_treatments')
        .select('patient_id, workflow_id')
        .neq('workflow_id', PROSPECT_WORKFLOW_ID)
        .eq('status', 'active');

    const patientsWithActiveTreatments = new Set((treatmentRows || []).map(r => r.patient_id));

    console.log(`📊 Ya inscritos en Prospectos: ${enrolledPatientIds.size}`);
    console.log(`📊 Con tratamiento activo: ${patientsWithActiveTreatments.size}\n`);

    const candidates: EnrollCandidate[] = [];

    // ── Source A: agenda_appointments tipo 'consulta' ─────────────────────────

    if (useSourceA) {
        console.log('📂 Fuente A: agenda_appointments tipo consulta...');

        const { data: consultaAppts } = await supabase
            .from('agenda_appointments')
            .select('patient_id, start_time, title')
            .eq('type', 'consulta')
            .eq('status', 'completed')
            .order('start_time', { ascending: true });

        // Group by patient — keep earliest consulta
        const firstConsulta: Map<string, { date: string; title: string }> = new Map();
        for (const appt of (consultaAppts || [])) {
            if (!appt.patient_id) continue;
            const existing = firstConsulta.get(appt.patient_id);
            if (!existing || appt.start_time < existing.date) {
                firstConsulta.set(appt.patient_id, {
                    date: appt.start_time.slice(0, 10),
                    title: appt.title || '',
                });
            }
        }

        for (const [patientId, data] of firstConsulta.entries()) {
            const p = patients.find(x => x.id_paciente === patientId);
            if (!p) continue;

            const hasTreatment = patientsWithActiveTreatments.has(patientId);
            const alreadyEnrolled = enrolledPatientIds.has(patientId);

            // Infer interest from title
            const titleLow = normalize(data.title);
            let interest: string | undefined;
            if (titleLow.includes('ortodoncia') || titleLow.includes('alineador')) interest = 'ortodoncia';
            else if (titleLow.includes('carill') || titleLow.includes('diseno') || titleLow.includes('sonrisa')) interest = 'carillas';
            else if (titleLow.includes('implante')) interest = 'implantes';
            else if (titleLow.includes('blanquea')) interest = 'blanqueamiento';

            candidates.push({
                source: 'agenda',
                patient_id: patientId,
                patient_name: `${p.nombre} ${p.apellido}`,
                patient_email: p.email,
                consulta_date: data.date,
                interest,
                has_treatment: hasTreatment,
                already_enrolled: alreadyEnrolled,
                reason_skip: hasTreatment
                    ? 'ya tiene tratamiento activo'
                    : alreadyEnrolled
                        ? 'ya inscripto en workflow'
                        : undefined,
            });
        }

        console.log(`   → ${firstConsulta.size} pacientes únicos con consulta en agenda`);
    }

    // ── Source B: lista manual ─────────────────────────────────────────────────

    if (useSourceB) {
        console.log('📂 Fuente B: lista manual (Jan–Feb 2025)...');

        for (const mp of MANUAL_PROSPECTS) {
            const p = findPatient(mp.name, patients);
            if (!p) {
                candidates.push({
                    source: 'manual',
                    patient_id: '',
                    patient_name: mp.name,
                    patient_email: null,
                    consulta_date: mp.date,
                    interest: mp.interest,
                    has_treatment: false,
                    already_enrolled: false,
                    reason_skip: 'sin match en base de datos',
                });
                continue;
            }

            const hasTreatment = patientsWithActiveTreatments.has(p.id_paciente);
            const alreadyEnrolled = enrolledPatientIds.has(p.id_paciente);

            // Don't add duplicates from source A
            const alreadyInCandidates = candidates.some(c => c.patient_id === p.id_paciente);
            if (alreadyInCandidates) continue;

            candidates.push({
                source: 'manual',
                patient_id: p.id_paciente,
                patient_name: `${p.nombre} ${p.apellido}`,
                patient_email: p.email,
                consulta_date: mp.date,
                interest: mp.interest,
                has_treatment: hasTreatment,
                already_enrolled: alreadyEnrolled,
                reason_skip: hasTreatment
                    ? 'ya tiene tratamiento activo'
                    : alreadyEnrolled
                        ? 'ya inscripto en workflow'
                        : undefined,
            });
        }

        console.log(`   → ${MANUAL_PROSPECTS.length} entradas en lista manual`);
    }

    // ── Analyze candidates ────────────────────────────────────────────────────

    const toEnroll = candidates.filter(c =>
        c.patient_id &&
        !c.has_treatment &&
        !c.already_enrolled &&
        !c.reason_skip
    );

    const skipped = candidates.filter(c => Boolean(c.reason_skip));
    const noMatch  = candidates.filter(c => !c.patient_id);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('           PROSPECTOS — ANÁLISIS DE CANDIDATOS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total candidatos analizados: ${candidates.length}`);
    console.log(`A inscribir:                 ${toEnroll.length}`);
    console.log(`Omitidos (ya convertidos o activos): ${skipped.filter(c => c.reason_skip !== 'sin match en base de datos').length}`);
    console.log(`Sin match en DB:             ${noMatch.length}`);
    console.log('───────────────────────────────────────────────────────────────\n');

    // Interest breakdown
    const interestCount: Record<string, number> = {};
    for (const c of toEnroll) {
        const k = c.interest || 'sin_definir';
        interestCount[k] = (interestCount[k] || 0) + 1;
    }
    console.log('📊 Distribución de interés:');
    Object.entries(interestCount).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
        console.log(`   ${k.padEnd(20)} ${n}`)
    );

    if (noMatch.length > 0) {
        console.log('\n⚠️  Sin match en base de datos (requieren carga manual):');
        noMatch.forEach(c => console.log(`   ✗ ${c.patient_name} (${c.consulta_date})`));
    }

    console.log('\n📗 Candidatos a inscribir:');
    toEnroll.slice(0, 30).forEach(c => {
        const email = c.patient_email ? `📧` : `📵`;
        console.log(`  ${c.consulta_date} [${(c.interest || '?').padEnd(13)}] ${email} ${c.patient_name} (${c.source})`);
    });
    if (toEnroll.length > 30) console.log(`  ... y ${toEnroll.length - 30} más`);

    if (!doEnroll) {
        console.log('\n⚡ Para inscribir, ejecutar:');
        console.log('   npx ts-node --transpile-only scripts/enroll_prospectos.ts --enroll\n');

        // Save report
        const reportPath = path.resolve(process.cwd(), 'scripts/output/prospectos_enroll_report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            mode: 'dry_run',
            toEnroll: toEnroll.map(c => ({
                name: c.patient_name,
                date: c.consulta_date,
                interest: c.interest,
                source: c.source,
                has_email: Boolean(c.patient_email),
            })),
            skipped: skipped.map(c => ({ name: c.patient_name, reason: c.reason_skip })),
            no_match: noMatch.map(c => c.patient_name),
        }, null, 2));
        console.log(`📄 Reporte guardado en: scripts/output/prospectos_enroll_report.json`);
        return;
    }

    // ── Enroll ────────────────────────────────────────────────────────────────

    console.log(`\n🚀 Inscribiendo ${toEnroll.length} prospectos...\n`);

    let enrolled = 0;
    let errors = 0;

    for (const c of toEnroll) {
        const { error: insertError } = await supabase.from('patient_treatments').insert({
            patient_id: c.patient_id,
            workflow_id: PROSPECT_WORKFLOW_ID,
            current_stage_id: STAGE_CONSULTA_REALIZADA,
            start_date: new Date(c.consulta_date).toISOString(),
            last_stage_change: new Date(c.consulta_date).toISOString(),
            status: 'active',
            metadata: {
                source: 'enroll_script',
                prospect_main_interest: c.interest || null,
                import_source: c.source,
            },
            prospect_main_interest: c.interest || null,
            prospect_consulta_date: c.consulta_date,
            prospect_contact_count: 0,
        });

        if (insertError) {
            // Skip duplicates silently, log others
            if (insertError.code !== '23505') {
                console.error(`  ❌ ${c.patient_name}: ${insertError.message}`);
                errors++;
            }
            continue;
        }

        // Insert history entry
        const { data: newTreatment } = await supabase
            .from('patient_treatments')
            .select('id')
            .eq('patient_id', c.patient_id)
            .eq('workflow_id', PROSPECT_WORKFLOW_ID)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (newTreatment?.id) {
            await supabase.from('treatment_history').insert({
                treatment_id: newTreatment.id,
                new_stage_id: STAGE_CONSULTA_REALIZADA,
                comments: `Inscripto por script de backfill. Interés: ${c.interest || 'no especificado'}. Fuente: ${c.source}.`,
            });
        }

        console.log(`  ✅ ${c.patient_name} (${c.consulta_date}, ${c.interest || '?'})`);
        enrolled++;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`✅ Inscritos:  ${enrolled}`);
    console.log(`❌ Errores:    ${errors}`);
    console.log(`⏭  Omitidos:   ${skipped.length + noMatch.length}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\nAhora visible en /workflows (workflow: Prospectos - 1ra Consulta)');

    // Save final report
    const reportPath = path.resolve(process.cwd(), 'scripts/output/prospectos_enroll_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        mode: 'enroll',
        stats: { enrolled, errors, skipped: skipped.length, no_match: noMatch.length },
        enrolled_patients: toEnroll.slice(0, enrolled).map(c => ({
            name: c.patient_name,
            date: c.consulta_date,
            interest: c.interest,
        })),
        no_match: noMatch.map(c => c.patient_name),
    }, null, 2));
    console.log(`\n📄 Reporte guardado en: scripts/output/prospectos_enroll_report.json`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
