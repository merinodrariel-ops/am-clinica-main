
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── Union-Find con path compression ─────────────────────────────────────────

class UnionFind {
    private parent: Map<string, string> = new Map();

    find(id: string): string {
        if (!this.parent.has(id)) this.parent.set(id, id);
        const root = this.parent.get(id)!;
        if (root !== id) {
            this.parent.set(id, this.find(root)); // path compression
        }
        return this.parent.get(id)!;
    }

    union(a: string, b: string): void {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) this.parent.set(ra, rb);
    }

    isGrouped(id: string): boolean {
        if (!this.parent.has(id)) return false;
        return this.find(id) !== id;
    }

    getGroups(allIds: string[]): Map<string, string[]> {
        allIds.forEach(id => this.find(id));
        const groups = new Map<string, string[]>();
        allIds.forEach(id => {
            const root = this.find(id);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root)!.push(id);
        });
        // Filtrar a grupos con 2+ miembros
        for (const [k, v] of groups) {
            if (v.length < 2) groups.delete(k);
        }
        return groups;
    }
}

// ─── Helpers puros ────────────────────────────────────────────────────────────

const removeDiacritics = (s: string): string =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeStr = (s: string | null | undefined): string =>
    s ? removeDiacritics(s.toLowerCase().trim()) : '';

const tokenSort = (s: string): string =>
    s.split(/\s+/).filter(Boolean).sort().join(' ');

const normalizePhone = (s: string | null | undefined): string =>
    s ? s.replace(/\D/g, '') : '';

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    if (a.length > b.length) [a, b] = [b, a]; // a = el más corto
    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let j = 1; j <= b.length; j++) {
        const curr = [j];
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
        }
        prev = curr;
    }
    return prev[a.length];
}

const fullNormName = (p: any): string =>
    normalizeStr(`${p.nombre ?? ''} ${p.apellido ?? ''}`).trim();

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const fetchCounts = async (table: string, idField: string): Promise<Record<string, number>> => {
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
        const { data, error } = await supabase.from(table).select(idField).range(from, from + pageSize - 1);
        if (error) break;
        if (data) {
            allData = [...allData, ...data];
            hasMore = data.length === pageSize;
            from += pageSize;
        } else {
            hasMore = false;
        }
    }
    const counts: Record<string, number> = {};
    allData.forEach((r: any) => {
        const id = r[idField];
        counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AutoPass = 'A' | 'B' | 'C' | 'D';

interface GroupMeta {
    pass: AutoPass;
    matchKey: string;
}

interface ManualReviewCase {
    pass: AutoPass | 'E' | 'safety';
    reason: string;
    patients: any[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 1: BACKUP DE SEGURIDAD');
    console.log('───────────────────────────');

    // Fetch todos los pacientes activos
    let allPatients: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('pacientes')
            .select('*')
            .eq('is_deleted', false)
            .range(from, from + pageSize - 1);

        if (error) { console.error('Error fetching:', error); process.exit(1); }
        if (data) {
            allPatients = [...allPatients, ...data];
            hasMore = data.length === pageSize;
            from += pageSize;
        } else {
            hasMore = false;
        }
    }

    console.log(`Total pacientes activos: ${allPatients.length}`);

    const dateStr = new Date().toISOString().split('T')[0];
    const backupPath = path.join(process.cwd(), `backup_pacientes_fuzzy_${dateStr}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(allPatients, null, 2));
    console.log(`Backup guardado en: ${backupPath}`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 2: CARGA DE DATOS DE ACTIVIDAD');
    console.log('───────────────────────────────────');

    const clinicalCounts = await fetchCounts('historia_clinica', 'paciente_id');
    const planCounts = await fetchCounts('planes_tratamiento', 'paciente_id');
    const movementCounts = await fetchCounts('caja_recepcion_movimientos', 'paciente_id');
    console.log(`  Historia clínica: ${Object.keys(clinicalCounts).length} pacientes con registros`);
    console.log(`  Planes tratamiento: ${Object.keys(planCounts).length} pacientes con registros`);
    console.log(`  Movimientos caja: ${Object.keys(movementCounts).length} pacientes con registros`);

    // ─── Setup ────────────────────────────────────────────────────────────────

    const patientMap = new Map<string, any>();
    allPatients.forEach(p => patientMap.set(p.id_paciente, p));

    const allIds = allPatients.map(p => p.id_paciente);
    const uf = new UnionFind();
    allIds.forEach(id => uf.find(id)); // pre-registrar todos

    const groupMeta = new Map<string, GroupMeta>();
    const manualReviewQueue: ManualReviewCase[] = [];

    // Chequeo de seguridad: si ambos tienen DNIs distintos → diferentes personas
    // Si ambos tienen historia clínica → revisión manual
    function safetyCheck(a: any, b: any): { safe: boolean; reason?: string } {
        const dniA = (a.documento ?? '').trim();
        const dniB = (b.documento ?? '').trim();
        if (dniA && dniB && normalizeStr(dniA) !== normalizeStr(dniB)) {
            return { safe: false, reason: `DNI distintos: ${dniA} vs ${dniB}` };
        }
        if ((clinicalCounts[a.id_paciente] ?? 0) > 0 && (clinicalCounts[b.id_paciente] ?? 0) > 0) {
            return { safe: false, reason: 'Ambos tienen historia clínica' };
        }
        return { safe: true };
    }

    // Función genérica para procesar grupos de una pasada
    function processAutoGroup(ids: string[], pass: AutoPass, matchKey: string): void {
        if (ids.length < 2) return;
        for (let i = 1; i < ids.length; i++) {
            const a = patientMap.get(ids[0])!;
            const b = patientMap.get(ids[i])!;
            const check = safetyCheck(a, b);
            if (!check.safe) {
                if (check.reason?.startsWith('Ambos tienen')) {
                    manualReviewQueue.push({ pass: 'safety', reason: `Pasada ${pass}: ${check.reason}`, patients: [a, b] });
                }
                // DNI distintos → silenciar (son personas distintas)
                continue;
            }
            uf.union(ids[0], ids[i]);
            const root = uf.find(ids[0]);
            if (!groupMeta.has(root)) groupMeta.set(root, { pass, matchKey });
        }
    }

    // ─── Construcción de índices O(n) ─────────────────────────────────────────

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 3: CONSTRUCCIÓN DE ÍNDICES');
    console.log('────────────────────────────────');

    const emailIndex = new Map<string, string[]>();
    const phoneIndex = new Map<string, string[]>();
    const nameIndex = new Map<string, string[]>();
    const tokenNameIndex = new Map<string, string[]>();

    for (const p of allPatients) {
        const id = p.id_paciente;

        const email = normalizeStr(p.email ?? '');
        if (email && email.includes('@')) {
            if (!emailIndex.has(email)) emailIndex.set(email, []);
            emailIndex.get(email)!.push(id);
        }

        const phone = normalizePhone(p.whatsapp);
        if (phone.length >= 7) {
            if (!phoneIndex.has(phone)) phoneIndex.set(phone, []);
            phoneIndex.get(phone)!.push(id);
        }

        const name = fullNormName(p);
        if (name.length >= 4) {
            if (!nameIndex.has(name)) nameIndex.set(name, []);
            nameIndex.get(name)!.push(id);

            const token = tokenSort(name);
            if (!tokenNameIndex.has(token)) tokenNameIndex.set(token, []);
            tokenNameIndex.get(token)!.push(id);
        }
    }

    // ─── Pasadas A-D (alta confianza) ─────────────────────────────────────────

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 4: PASADAS DE ALTA CONFIANZA (A-D)');
    console.log('─────────────────────────────────────────');

    // Pasada A: mismo email
    let passACount = 0;
    for (const [email, ids] of emailIndex) {
        if (ids.length > 1) { processAutoGroup(ids, 'A', email); passACount++; }
    }
    console.log(`  Pasada A (email):           ${passACount} grupos candidatos`);

    // Pasada B: mismo teléfono
    let passBCount = 0;
    for (const [phone, ids] of phoneIndex) {
        if (ids.length > 1) { processAutoGroup(ids, 'B', phone); passBCount++; }
    }
    console.log(`  Pasada B (teléfono):        ${passBCount} grupos candidatos`);

    // Pasada C: mismo nombre sin tildes
    let passCCount = 0;
    for (const [name, ids] of nameIndex) {
        if (ids.length > 1) { processAutoGroup(ids, 'C', name); passCCount++; }
    }
    console.log(`  Pasada C (nombre sin tilde):${passCCount} grupos candidatos`);

    // Pasada D: token-sort (captura nombre/apellido invertidos)
    let passDCount = 0;
    for (const [token, ids] of tokenNameIndex) {
        if (ids.length > 1) { processAutoGroup(ids, 'D', token); passDCount++; }
    }
    console.log(`  Pasada D (token-sort):      ${passDCount} grupos candidatos`);

    // ─── Pasada E: Levenshtein (revisión manual) ──────────────────────────────

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 5: PASADA E — FUZZY (LEVENSHTEIN ≤ 2)');
    console.log('───────────────────────────────────────────');

    // Solo pacientes NO agrupados, bucketeados por primeras 3 letras del nombre normalizado
    const prefixBuckets = new Map<string, string[]>();
    for (const p of allPatients) {
        if (uf.isGrouped(p.id_paciente)) continue;
        const name = fullNormName(p);
        if (name.length < 4) continue;
        const prefix = name.slice(0, 3);
        if (!prefixBuckets.has(prefix)) prefixBuckets.set(prefix, []);
        prefixBuckets.get(prefix)!.push(p.id_paciente);
    }

    let passECount = 0;
    for (const [, ids] of prefixBuckets) {
        if (ids.length < 2) continue;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                // Saltar si ya están agrupados entre sí
                if (uf.find(ids[i]) === uf.find(ids[j])) continue;

                const a = patientMap.get(ids[i])!;
                const b = patientMap.get(ids[j])!;

                // Chequeo de seguridad antes: DNIs distintos = personas distintas, no mostrar
                const dniA = (a.documento ?? '').trim();
                const dniB = (b.documento ?? '').trim();
                if (dniA && dniB && normalizeStr(dniA) !== normalizeStr(dniB)) continue;

                const nameA = fullNormName(a);
                const nameB = fullNormName(b);
                const dist = levenshtein(nameA, nameB);

                if (dist > 0 && dist <= 2) {
                    manualReviewQueue.push({
                        pass: 'E',
                        reason: `Levenshtein ${dist}: "${nameA}" ↔ "${nameB}"`,
                        patients: [a, b]
                    });
                    passECount++;
                }
            }
        }
    }
    console.log(`  Casos para revisión manual: ${passECount}`);

    // ─── Resolución de grupos: winner/losers ──────────────────────────────────

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 6: SELECCIÓN DE GANADORES');
    console.log('──────────────────────────────');

    function scorePatient(p: any): number {
        let score = 0;
        Object.values(p).forEach(v => { if (v !== null && v !== undefined && v !== '') score++; });
        if ((clinicalCounts[p.id_paciente] ?? 0) > 0) score += 200;
        if ((planCounts[p.id_paciente] ?? 0) > 0) score += 150;
        if ((movementCounts[p.id_paciente] ?? 0) > 0) score += 100;
        return score;
    }

    const autoDeleteGroups = uf.getGroups(allIds);
    const loserIds: string[] = [];

    interface ReportRow {
        Pasada: string;
        Nombre_Ganador: string;
        DNI: string;
        Email: string;
        Registros: number;
        ID_Ganador: string;
        IDs_Eliminados: string;
    }
    const reportRows: ReportRow[] = [];

    for (const [rootId, memberIds] of autoDeleteGroups) {
        const members = memberIds.map(id => patientMap.get(id)!);
        const scored = members
            .map(p => ({ ...p, _score: scorePatient(p) }))
            .sort((a, b) => {
                if (b._score !== a._score) return b._score - a._score;
                const dA = new Date(a.updated_at ?? a.created_at ?? a.fecha_alta ?? 0).getTime();
                const dB = new Date(b.updated_at ?? b.created_at ?? b.fecha_alta ?? 0).getTime();
                return dB - dA;
            });

        const winner = scored[0];
        const losers = scored.slice(1);
        losers.forEach(l => loserIds.push(l.id_paciente));

        const meta = groupMeta.get(uf.find(rootId)) ?? groupMeta.get(rootId);
        reportRows.push({
            Pasada: meta?.pass ?? '?',
            Nombre_Ganador: `${winner.nombre ?? ''} ${winner.apellido ?? ''}`.trim(),
            DNI: winner.documento ?? '(sin DNI)',
            Email: winner.email ?? '',
            Registros: memberIds.length,
            ID_Ganador: winner.id_paciente,
            IDs_Eliminados: losers.map(l => l.id_paciente.substring(0, 8)).join(' | '),
        });
    }

    console.log(`  Grupos de auto-borrado:  ${autoDeleteGroups.size}`);
    console.log(`  Registros a eliminar:    ${loserIds.length}`);
    console.log(`  Casos revisión manual:   ${manualReviewQueue.length}`);

    // ─── Preview en consola ───────────────────────────────────────────────────

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PREVIEW (primeros 20 grupos auto-borrado)');
    console.log('─────────────────────────────────────────');
    console.table(reportRows.slice(0, 20).map(r => ({
        Pas: r.Pasada,
        Nombre: r.Nombre_Ganador,
        DNI: r.DNI,
        N: r.Registros,
        Eliminar: r.IDs_Eliminados.substring(0, 40),
    })));

    if (reportRows.length > 20) console.log(`... y ${reportRows.length - 20} grupos más.`);

    // ─── Generar SQL ──────────────────────────────────────────────────────────

    if (loserIds.length > 0) {
        const sql = `-- MIGRACIÓN: DEPURACIÓN FUZZY DE DUPLICADOS
-- Generado: ${new Date().toLocaleString()}
-- Total a soft-delete: ${loserIds.length}
-- Pasadas aplicadas: A (email), B (teléfono), C (tildes), D (token-sort)
-- REVISAR antes de ejecutar. Ejecutar en Supabase SQL editor.

BEGIN;

UPDATE pacientes
SET is_deleted    = true,
    deleted_at    = now(),
    delete_reason = 'Limpieza de duplicados fuzzy - auto'
WHERE id_paciente IN (
  ${loserIds.map(id => `'${id}'`).join(',\n  ')}
);

COMMIT;
`;
        const sqlPath = path.join(process.cwd(), `delete_duplicates_fuzzy_${dateStr}.sql`);
        fs.writeFileSync(sqlPath, sql);
        console.log(`\n✓ SQL de auto-borrado: ${sqlPath}`);
    } else {
        console.log('\n✓ No se encontraron duplicados de alta confianza para auto-borrar.');
    }

    // ─── Generar CSV de revisión manual ───────────────────────────────────────

    if (manualReviewQueue.length > 0) {
        const csvHeader = 'Pasada,Motivo,ID_A,Nombre_A,DNI_A,Email_A,ID_B,Nombre_B,DNI_B,Email_B';
        const csvLines = manualReviewQueue.map(c => {
            const [a, b] = c.patients;
            const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
            return [
                c.pass,
                esc(c.reason),
                a.id_paciente,
                esc(`${a.nombre ?? ''} ${a.apellido ?? ''}`.trim()),
                a.documento ?? '',
                a.email ?? '',
                b.id_paciente,
                esc(`${b.nombre ?? ''} ${b.apellido ?? ''}`.trim()),
                b.documento ?? '',
                b.email ?? '',
            ].join(',');
        });
        const csvPath = path.join(process.cwd(), `reporte_revision_manual_${dateStr}.csv`);
        fs.writeFileSync(csvPath, [csvHeader, ...csvLines].join('\n'));
        console.log(`✓ CSV revisión manual:  ${csvPath}`);
    } else {
        console.log('✓ No hay casos que requieran revisión manual.');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('COMPLETADO. Próximos pasos:');
    console.log('  1. Revisar el CSV de revisión manual');
    console.log('  2. Ejecutar el SQL en Supabase SQL Editor si todo se ve correcto');
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
