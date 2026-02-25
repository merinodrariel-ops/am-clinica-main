/**
 * import_calendar_to_agenda.ts
 *
 * Importa los eventos del Google Calendar como historial en agenda_appointments.
 * Esto permite ver el historial completo de turnos por paciente en el portal
 * y en la vista de agenda de la app.
 *
 * Importa:
 *   Bucket A (354 eventos) → status='completed'  (turnos reales confirmados)
 *   Bucket B ( 26 eventos) → status='completed'  (probables turnos reales)
 *   Bucket D ( 38 eventos) → status='cancelled'  (turnos cancelados)
 *
 * No importa:
 *   Bucket C (reuniones, admin, etc.)
 *   Bucket E (recordatorios primitivos del staff)
 *
 * Flags:
 *   --dry-run    Solo muestra qué se importaría (default)
 *   --import     Escribe a Supabase
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/import_calendar_to_agenda.ts --dry-run
 *   npx ts-node --transpile-only scripts/import_calendar_to_agenda.ts --import
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str: string): string {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Patient {
    id_paciente: string;
    nombre: string;
    apellido: string;
    normFull: string;
    normNombre: string;
    normApellido: string;
}

function findPatientMatch(extractedName: string, patients: Patient[]): { patient: Patient; confidence: 'high' | 'medium' } | null {
    if (!extractedName || extractedName.trim().length < 3) return null;
    const normName = normalize(extractedName);
    const matches: Array<{ patient: Patient; score: number }> = [];

    for (const p of patients) {
        const nParts = p.normNombre.split(/\s+/).filter(x => x.length >= 3);
        const aParts = p.normApellido.split(/\s+/).filter(x => x.length >= 3);
        if (nParts.length === 0 || aParts.length === 0) continue;
        const nomeIn = nParts.some(part => normName.includes(part));
        const apellIn = aParts.some(part => normName.includes(part));
        if (nomeIn && apellIn) {
            const score = nParts.filter(p => normName.includes(p)).length + aParts.filter(p => normName.includes(p)).length;
            matches.push({ patient: p, score });
        }
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.score - a.score || a.patient.normFull.length - b.patient.normFull.length);
    return { patient: matches[0].patient, confidence: matches.length === 1 ? 'high' : 'medium' };
}

// ── Treatment → appointment_type mapping ─────────────────────────────────────

function mapTreatmentToType(treatment: string): 'consulta' | 'tratamiento' | 'control' | 'urgencia' | 'otro' {
    const t = treatment.toLowerCase();
    if (t.includes('consulta') || t.includes('diagnóstico') || t.includes('diagnostico')) return 'consulta';
    if (t.includes('control')) return 'control';
    if (t.includes('urgencia') || t.includes('dolor')) return 'urgencia';
    if (t === 'otros' || t === 'otro') return 'otro';
    return 'tratamiento'; // limpieza, botox, carillas, blanqueamiento, implantes, etc.
}

// Clean up calendar event title for display
function cleanTitle(summary: string): string {
    return summary
        .replace(/^(CANCELADO|CANCELO|CANCELA)\s*/i, '')
        .replace(/\b(CONFIRMO|CONF\.?|CONFIRMADO)\b/gi, '')
        .replace(/[-–]\s*(Dr\.?\s*Ariel\s*Merino)\s*$/i, '')
        .replace(/\bariel\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FilteredEvent {
    calendarName: string;
    date: string;
    summary: string;
    description: string;
    treatment: string;
    duration_min: number;
    bucket: string;
    score: number;
    extractedName?: string;
    signals: string[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--import');

    const outputDir = path.resolve(process.cwd(), 'scripts/output');
    const filteredPath = path.join(outputDir, 'calendar_filtered.json');
    const agendaReportPath = path.join(outputDir, 'calendar_agenda_import_report.json');

    if (!fs.existsSync(filteredPath)) {
        console.error('❌ calendar_filtered.json not found. Run filter_calendar_for_import.ts first.');
        process.exit(1);
    }

    console.log(`\n🔵 Mode: ${dryRun ? 'DRY RUN (no writes)' : 'IMPORT → agenda_appointments'}`);
    if (dryRun) console.log('   Tip: pass --import flag to actually write records.\n');

    // Load events from all relevant buckets
    const filtered = JSON.parse(fs.readFileSync(filteredPath, 'utf-8'));
    const eventsA: FilteredEvent[] = (filtered.buckets.A_import ?? []).map((e: FilteredEvent) => ({ ...e, agendaStatus: 'completed' }));
    const eventsB: FilteredEvent[] = (filtered.buckets.B_review ?? []).map((e: FilteredEvent) => ({ ...e, agendaStatus: 'completed' }));
    const eventsD: FilteredEvent[] = (filtered.buckets.D_cancelled ?? []).map((e: FilteredEvent) => ({ ...e, agendaStatus: 'cancelled' }));

    const allEvents = [...eventsA, ...eventsB, ...eventsD];
    // Sort by date DESC (most recent first, for duplicate handling)
    allEvents.sort((a, b) => b.date.localeCompare(a.date));

    console.log(`📂 Bucket A: ${eventsA.length}  |  Bucket B: ${eventsB.length}  |  Bucket D (cancelled): ${eventsD.length}`);
    console.log(`📂 Total to process: ${allEvents.length} events\n`);

    // Load patients from Supabase
    console.log('🔌 Loading patients from Supabase...');
    const { data: patientsData, error: pErr } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido')
        .eq('is_deleted', false);

    if (pErr) { console.error('❌ Failed to load patients:', pErr.message); process.exit(1); }

    const patients: Patient[] = (patientsData || []).map(p => ({
        ...p,
        normFull: normalize(`${p.nombre} ${p.apellido}`),
        normNombre: normalize(p.nombre || ''),
        normApellido: normalize(p.apellido || ''),
    }));
    console.log(`✅ Loaded ${patients.length} patients`);

    // Find Dr. Ariel Merino's profile ID (optional — for doctor_id field)
    const { data: doctorProfile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', '%ariel%merino%')
        .maybeSingle();
    const doctorId = doctorProfile?.id ?? null;
    if (doctorId) {
        console.log(`✅ Doctor encontrado: ${doctorProfile?.full_name} (${doctorId})`);
    } else {
        console.log('⚠️  No se encontró perfil del Dr. Ariel Merino — doctor_id será null');
    }
    console.log('');

    // ── Process events ────────────────────────────────────────────────────────

    const today = new Date().toISOString();
    const stats = { matched: 0, unmatched: 0, imported: 0, skipped_duplicate: 0, error: 0 };
    const importedRows: object[] = [];
    const unmatchedRows: object[] = [];

    for (const event of allEvents) {
        // Extract name candidates
        const nameCandidates: string[] = [];
        if (event.extractedName && event.extractedName.trim().length > 3) {
            nameCandidates.push(event.extractedName);
        }
        const parenMatch = event.summary.match(/\(([^)]{4,})\)/);
        if (parenMatch) {
            const pName = parenMatch[1].trim();
            if (/^[A-ZÁÉÍÓÚÑÜ]/.test(pName)) nameCandidates.push(pName);
        }

        // Find patient match
        let match = null;
        for (const candidate of nameCandidates) {
            const m = findPatientMatch(candidate, patients);
            if (m) { match = m; break; }
        }

        if (!match) {
            stats.unmatched++;
            unmatchedRows.push({ date: event.date, summary: event.summary, extractedName: event.extractedName });
            continue;
        }

        stats.matched++;

        const startTime = new Date(event.date);
        const endTime = new Date(startTime.getTime() + (event.duration_min || 60) * 60 * 1000);
        const agendaStatus = (event as unknown as { agendaStatus: string }).agendaStatus || 'completed';
        const appointmentType = mapTreatmentToType(event.treatment);
        const cleanedTitle = cleanTitle(event.summary);

        if (dryRun) {
            importedRows.push({
                date: event.date.split('T')[0],
                patient: `${match.patient.nombre} ${match.patient.apellido}`,
                title: cleanedTitle,
                type: appointmentType,
                status: agendaStatus,
                duration: `${event.duration_min}min`,
                confidence: match.confidence,
            });
            continue;
        }

        // Check for duplicate (same patient + same start_time)
        const { data: existing } = await supabase
            .from('agenda_appointments')
            .select('id')
            .eq('patient_id', match.patient.id_paciente)
            .eq('start_time', startTime.toISOString())
            .maybeSingle();

        if (existing) {
            stats.skipped_duplicate++;
            continue;
        }

        // Insert
        const { error } = await supabase.from('agenda_appointments').insert({
            patient_id: match.patient.id_paciente,
            doctor_id: doctorId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            title: cleanedTitle || `Turno ${event.treatment}`,
            status: agendaStatus,
            type: appointmentType,
            notes: [
                `Importado desde Google Calendar (${event.calendarName}).`,
                event.description ? `Notas originales: ${event.description.slice(0, 200)}` : null,
            ].filter(Boolean).join('\n'),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        if (error) {
            stats.error++;
            console.error(`  ❌ Error insertando ${cleanedTitle}: ${error.message}`);
        } else {
            stats.imported++;
            importedRows.push({
                date: event.date.split('T')[0],
                patient: `${match.patient.nombre} ${match.patient.apellido}`,
                title: cleanedTitle,
                type: appointmentType,
                status: agendaStatus,
            });
        }
    }

    // ── Print results ─────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('           AGENDA HISTORY IMPORT RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total events:        ${allEvents.length}`);
    console.log(`Patient matches:     ${stats.matched} (${((stats.matched / allEvents.length) * 100).toFixed(1)}%)`);
    console.log(`No match found:      ${stats.unmatched}`);
    if (!dryRun) {
        console.log(`Imported:            ${stats.imported}`);
        console.log(`Skipped (duplicate): ${stats.skipped_duplicate}`);
        console.log(`Errors:              ${stats.error}`);
    }
    console.log('───────────────────────────────────────────────────────────────');

    // Appointment type breakdown
    if (dryRun && importedRows.length > 0) {
        console.log('\n📊 Tipo de turno (lo que se importaría):');
        const typeMap: Record<string, number> = {};
        (importedRows as Array<{ type: string }>).forEach(r => { typeMap[r.type] = (typeMap[r.type] || 0) + 1; });
        Object.entries(typeMap).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${t.padEnd(15)} ${n}`));

        console.log('\n📗 MUESTRA (primeros 20 a importar):');
        (importedRows as Array<{ date: string; patient: string; title: string; type: string; status: string; confidence: string }>)
            .slice(0, 20)
            .forEach(r => {
                const conf = r.confidence === 'medium' ? ' ⚠️' : '';
                console.log(`  ${r.date} [${r.type}] ${r.status === 'cancelled' ? '❌ ' : '✅ '}${r.patient}${conf} — "${r.title}"`);
            });
    }

    if (!dryRun) {
        console.log(`\n✅ ${stats.imported} turnos históricos importados a agenda_appointments.`);
        if (stats.error > 0) console.log(`⚠️  ${stats.error} errores — revisar output.`);
    }

    // Save report
    fs.writeFileSync(agendaReportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        mode: dryRun ? 'dry_run' : 'import',
        stats,
        imported: importedRows,
        unmatched: unmatchedRows,
    }, null, 2));
    console.log(`\n📄 Reporte guardado en: ${agendaReportPath}`);

    if (dryRun) {
        console.log('\n⚡ Listo para importar. Ejecutar con --import para escribir a Supabase:');
        console.log('   npx ts-node --transpile-only scripts/import_calendar_to_agenda.ts --import');
    }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
