/**
 * Moves presentation files that are directly inside each patient mother folder
 * into the standard "... - PRESENTACION" subfolder.
 *
 * Dry run (default):
 *   npx tsx scripts/move-misplaced-presentations.ts
 *
 * Execute real moves:
 *   npx tsx scripts/move-misplaced-presentations.ts --execute
 *
 * Optional filters:
 *   --since=2026-02-15   (only patients created on/after date)
 *   --limit=100          (max patients to scan)
 *   --patient-id=<uuid>  (scan one specific patient)
 *   --verbose            (log every move)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const DRY_RUN = !process.argv.includes('--execute');
const VERBOSE = process.argv.includes('--verbose');

const sinceArg = process.argv.find((arg) => arg.startsWith('--since='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const patientIdArg = process.argv.find((arg) => arg.startsWith('--patient-id='));

const SINCE = sinceArg ? sinceArg.slice('--since='.length).trim() : null;
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
const PATIENT_ID = patientIdArg ? patientIdArg.slice('--patient-id='.length).trim() : null;

const PRESENTATION_MIME_TYPES = new Set([
    'application/vnd.google-apps.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
]);

interface PatientRow {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    fecha_alta: string | null;
    link_historia_clinica: string | null;
}

interface MoveRecord {
    patient_id: string;
    patient_name: string;
    file_id: string;
    file_name: string;
    from_folder_id: string;
    to_folder_id: string;
    dry_run: boolean;
}

function extractFolderIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch?.[1]) return folderMatch[1];
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (idMatch?.[1]) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;
    return null;
}

function getPatientLabel(apellido: string | null, nombre: string | null): string {
    const a = (apellido || '').trim();
    const n = (nombre || '').trim();
    if (a && n) return `${a}, ${n}`;
    return a || n || 'Paciente sin nombre';
}

function getAuth() {
    return new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
}

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const drive = google.drive({ version: 'v3', auth: getAuth() });

    console.log(`\n${'='.repeat(64)}`);
    console.log(DRY_RUN ? 'DRY RUN - no se moveran archivos' : 'EJECUCION REAL - se moveran archivos');
    console.log(`${'='.repeat(64)}\n`);

    let query = supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, fecha_alta, link_historia_clinica')
        .eq('is_deleted', false)
        .not('link_historia_clinica', 'is', null)
        .order('fecha_alta', { ascending: true });

    if (SINCE) {
        query = query.gte('fecha_alta', SINCE);
    }

    if (PATIENT_ID) {
        query = query.eq('id_paciente', PATIENT_ID);
    }

    if (LIMIT > 0 && Number.isFinite(LIMIT)) {
        query = query.limit(LIMIT);
    }

    const { data: patients, error } = await query;

    if (error || !patients) {
        console.error('Error consultando pacientes:', error?.message || error);
        process.exit(1);
    }

    console.log(`Pacientes a escanear: ${patients.length}`);
    if (SINCE) console.log(`Filtro since: ${SINCE}`);
    if (PATIENT_ID) console.log(`Filtro patient-id: ${PATIENT_ID}`);
    if (LIMIT > 0) console.log(`Filtro limit: ${LIMIT}`);
    console.log();

    let scanned = 0;
    let withPresentationFolder = 0;
    let patientsWithMisplaced = 0;
    let movedCount = 0;
    let skippedNoMotherId = 0;
    let skippedNoPresentationFolder = 0;
    const errors: string[] = [];
    const movedRecords: MoveRecord[] = [];

    for (const patient of patients as PatientRow[]) {
        scanned += 1;
        const patientLabel = getPatientLabel(patient.apellido, patient.nombre);
        const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica);

        if (!motherFolderId) {
            skippedNoMotherId += 1;
            if (VERBOSE) {
                console.log(`- ${patientLabel}: link_historia_clinica sin folder id valido`);
            }
            continue;
        }

        try {
            const children = await drive.files.list({
                q: `'${motherFolderId}' in parents and trashed=false`,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                fields: 'files(id, name, mimeType, parents)',
                pageSize: 200,
            });

            const files = children.data.files || [];
            const presentationFolder = files.find(
                (f) => f.mimeType === 'application/vnd.google-apps.folder' && (f.name || '').includes('PRESENTACION')
            );

            if (!presentationFolder?.id) {
                skippedNoPresentationFolder += 1;
                if (VERBOSE) {
                    console.log(`- ${patientLabel}: no tiene subcarpeta PRESENTACION`);
                }
                continue;
            }

            withPresentationFolder += 1;

            const misplaced = files.filter((f) => {
                if (!f.id || !f.name) return false;
                return PRESENTATION_MIME_TYPES.has(f.mimeType || '');
            });

            if (misplaced.length === 0) {
                if (VERBOSE) {
                    console.log(`- ${patientLabel}: sin presentaciones sueltas`);
                }
                continue;
            }

            patientsWithMisplaced += 1;

            for (const file of misplaced) {
                const fileId = file.id!;
                const fileName = file.name || 'Sin nombre';
                const currentParents = (file.parents || []).join(',');

                if (!DRY_RUN) {
                    await drive.files.update({
                        fileId,
                        supportsAllDrives: true,
                        enforceSingleParent: true,
                        addParents: presentationFolder.id,
                        removeParents: currentParents,
                        fields: 'id',
                    });
                }

                movedCount += 1;
                movedRecords.push({
                    patient_id: patient.id_paciente,
                    patient_name: patientLabel,
                    file_id: fileId,
                    file_name: fileName,
                    from_folder_id: motherFolderId,
                    to_folder_id: presentationFolder.id,
                    dry_run: DRY_RUN,
                });

                if (VERBOSE) {
                    console.log(
                        `  ${DRY_RUN ? '[DRY]' : '[MOVED]'} ${patientLabel} | ${fileName} -> ${presentationFolder.name}`
                    );
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${patientLabel}: ${message}`);
            console.error(`  [ERROR] ${patientLabel}: ${message}`);
        }
    }

    const reportDir = path.join('scripts', 'output');
    const reportPath = path.join(reportDir, 'moved_misplaced_presentations.json');

    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(movedRecords, null, 2));

    console.log(`\n${'='.repeat(64)}`);
    console.log('RESUMEN');
    console.log(`${'='.repeat(64)}`);
    console.log(`Pacientes escaneados: ${scanned}`);
    console.log(`Con subcarpeta PRESENTACION: ${withPresentationFolder}`);
    console.log(`Con presentaciones sueltas: ${patientsWithMisplaced}`);
    console.log(`Presentaciones ${DRY_RUN ? 'a mover' : 'movidas'}: ${movedCount}`);
    console.log(`Sin mother folder id valido: ${skippedNoMotherId}`);
    console.log(`Sin subcarpeta PRESENTACION: ${skippedNoPresentationFolder}`);
    console.log(`Errores: ${errors.length}`);
    console.log(`Reporte: ${reportPath}`);

    if (errors.length > 0) {
        console.log('\nErrores detallados:');
        errors.slice(0, 30).forEach((e) => console.log(`- ${e}`));
        if (errors.length > 30) {
            console.log(`... +${errors.length - 30} errores adicionales`);
        }
    }

    if (DRY_RUN) {
        console.log('\nPara ejecutar en modo real:');
        console.log('npx tsx scripts/move-misplaced-presentations.ts --execute');
    }

    console.log();
}

main().catch((err) => {
    console.error('Fallo inesperado:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
