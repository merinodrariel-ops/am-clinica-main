
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.local first, then .env
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });


// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for admin tasks

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Validates if a string is a valid UUID.
 */
function isValidUuid(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 1: BACKUP DE SEGURIDAD');
    console.log('───────────────────────────');

    // 1. Fetch all patients
    console.log('Fetching all patients...');
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

        if (error) {
            console.error('Error fetching patients:', error);
            process.exit(1);
        }

        if (data) {
            allPatients = [...allPatients, ...data];
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                from += pageSize;
            }
        } else {
            hasMore = false;
        }
    }

    const patients = allPatients;

    if (!patients || patients.length === 0) {
        console.log('No patients found.');
        process.exit(0);
    }

    console.log(`Found ${patients.length} patients.`);

    // 2. Backup
    const dateStr = new Date().toISOString().split('T')[0];
    const backupFileName = `backup_pacientes_${dateStr}.json`;
    const backupPath = path.join(process.cwd(), backupFileName);

    fs.writeFileSync(backupPath, JSON.stringify(patients, null, 2));
    console.log(`Backup saved to: ${backupPath}`);
    console.log('Backup completo.');
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 2: ANÁLISIS DE DUPLICADOS');
    console.log('───────────────────────────────');

    // Helper to normalize strings for comparison
    const normalize = (s: string | null) => s ? s.toLowerCase().trim() : '';
    const normalizePhone = (s: string | null) => s ? s.replace(/\D/g, '') : '';

    // Data structures for grouping
    const groups: Record<string, any[]> = {};

    // Grouping
    patients.forEach(p => {
        const normName = normalize(p.nombre);
        const normSurname = normalize(p.apellido);

        if (!normName || !normSurname) return;

        // Primary key: Normalized Name + Surname
        // We group by Name+Surname first. This is safer now because 
        // we have massive duplicates with identical names.
        const key = `${normName}|${normSurname}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    });

    // Sub-segmenting or combining groups based on DNI/Email if necessary?
    // Actually, users' instruction "Nombre completo + Teléfono" suggests 
    // that if names match but phones are different, they might be different.
    // However, if we have 151 records with same name, they are duplicates.

    const finalGroups = Object.values(groups).filter(g => g.length > 1);



    const duplicateGroups: any[][] = finalGroups;

    console.log(`Found ${duplicateGroups.length} groups of duplicates.`);
    console.log('');



    console.log('═══════════════════════════════════════════════════════════');
    console.log('PASO 3 & 4: DETERMINAR QUÉ CONSERVAR Y REPORTE');
    console.log('──────────────────────────────────────────────');

    // Relational data counts
    const fetchCounts = async (table: string, idField: string) => {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase.from(table).select(idField).range(from, from + pageSize - 1);
            if (error) break;
            if (data) {
                allData = [...allData, ...data];
                if (data.length < pageSize) hasMore = false;
                else from += pageSize;
            } else hasMore = false;
        }

        const counts: Record<string, number> = {};
        allData.forEach((r: any) => {
            const id = r[idField];
            counts[id] = (counts[id] || 0) + 1;
        });
        return counts;
    };

    console.log('Checking related data (movements, history, plans)...');
    const movementCounts = await fetchCounts('caja_recepcion_movimientos', 'paciente_id');
    const clinicalCounts = await fetchCounts('historia_clinica', 'paciente_id');
    const planCounts = await fetchCounts('planes_tratamiento', 'paciente_id');

    interface ReportRow {
        DNI: string;
        Nombre: string;
        'Duplicados Encontrados': string;
        'Conservar (ID)': string;
        'Eliminar (IDs)': string;
    }

    const reportData: ReportRow[] = [];
    const allLoserIds: string[] = [];

    for (const group of duplicateGroups) {
        // 1. Calculate Score
        const scored = group.map(p => {
            const id = p.id_paciente;
            let score = 0;

            // Fields score
            Object.keys(p).forEach(k => {
                if (p[k] !== null && p[k] !== '' && p[k] !== undefined) score++;
            });

            // Activity score (Value historical data highly)
            const hasMovements = (movementCounts[id] || 0) > 0;
            const hasClinical = (clinicalCounts[id] || 0) > 0;
            const hasPlans = (planCounts[id] || 0) > 0;

            // Weight activity heavily - if they have clinical history or payments, they are likely the "real" one
            if (hasMovements) score += 100;
            if (hasClinical) score += 200;
            if (hasPlans) score += 150;

            return { ...p, _score: score, _hasActivity: hasMovements || hasClinical || hasPlans };
        });

        // 2. Sort
        scored.sort((a, b) => {
            // 1. Activity + Completeness
            if (b._score !== a._score) return b._score - a._score;

            // 2. Recency (Tie-breaker)
            const dateA = new Date(a.updated_at || a.created_at || a.fecha_alta || 0).getTime();
            const dateB = new Date(b.updated_at || b.created_at || b.fecha_alta || 0).getTime();
            return dateB - dateA;
        });

        const winner = scored[0];
        const losers = scored.slice(1);

        allLoserIds.push(...losers.map(l => l.id_paciente));

        reportData.push({
            DNI: winner.documento || '(Sin DNI)',
            Nombre: `${winner.nombre} ${winner.apellido}`,
            'Duplicados Encontrados': `${group.length} registros`,
            'Conservar (ID)': winner.id_paciente,
            'Eliminar (IDs)': losers.map(l => l.id_paciente.substring(0, 8)).join(', ') // Short IDs for table display
        });
    }

    // Final Summary
    console.log(`\nTotal de registros a eliminar: ${allLoserIds.length}\n`);

    // Show First 20 as Table for Preview
    const preview = reportData.slice(0, 20);
    console.table(preview);

    if (reportData.length > 20) {
        console.log(`... y ${reportData.length - 20} grupos más.`);
    }

    // Save detailed migration script (SQL)
    const sql = `-- MIGRACION: ELIMINACION DE DUPLICADOS PACIENTES
-- Generado: ${new Date().toLocaleString()}
-- Total a eliminar: ${allLoserIds.length}

BEGIN;

-- Marcar como eliminados (Soft delete preferible primero para seguridad)
UPDATE pacientes 
SET is_deleted = true, 
    deleted_at = now(), 
    delete_reason = 'Limpieza de duplicados masiva'
WHERE id_paciente IN (
  ${allLoserIds.filter(isValidUuid).map(id => `'${id}'`).join(',\n  ')}
);

-- O eliminacion fisica si el usuario confirma:
-- DELETE FROM pacientes WHERE id_paciente IN (...);

COMMIT;
`;

    const sqlPath = path.join(process.cwd(), `delete_duplicates_${dateStr}.sql`);
    fs.writeFileSync(sqlPath, sql);
    console.log(`\nScript SQL de eliminación generado en: ${sqlPath}`);

    const reportPath = path.join(process.cwd(), `reporte_duplicados_${dateStr}.csv`);
    const csvContent = "DNI,Nombre,Duplicados,Conservar_ID,Eliminar_IDs\n" +
        reportData.map(r => `${r.DNI},"${r.Nombre}",${r['Duplicados Encontrados']},${r['Conservar (ID)']},"${r['Eliminar (IDs)']}"`).join('\n');
    fs.writeFileSync(reportPath, csvContent);
    console.log(`Reporte CSV completo guardado en: ${reportPath}`);
}

main().catch(console.error);
