/**
 * Creates missing "... - PRESENTACION" subfolders inside patient mother folders.
 *
 * Dry run (default):
 *   npx tsx scripts/create-missing-presentation-subfolders.ts
 *
 * Execute real creation:
 *   npx tsx scripts/create-missing-presentation-subfolders.ts --execute
 *
 * Optional filters:
 *   --limit=100
 *   --patient-id=<uuid>
 *   --verbose
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const DRY_RUN = !process.argv.includes('--execute');
const VERBOSE = process.argv.includes('--verbose');

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const patientIdArg = process.argv.find((arg) => arg.startsWith('--patient-id='));

const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
const PATIENT_ID = patientIdArg ? patientIdArg.slice('--patient-id='.length).trim() : null;

interface PatientRow {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    link_historia_clinica: string | null;
}

interface CreatedRecord {
    patient_id: string;
    patient_name: string;
    mother_folder_id: string;
    presentation_folder_name: string;
    presentation_folder_id?: string;
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

function getPatientFolderName(apellido: string, nombre: string): string {
    const cleanApellido = (apellido || '').toUpperCase().trim();
    const cleanNombre = (nombre || '').trim();
    const formattedNombre = cleanNombre
        ? cleanNombre.charAt(0).toUpperCase() + cleanNombre.slice(1).toLowerCase()
        : '';
    if (cleanApellido && formattedNombre) return `${cleanApellido}, ${formattedNombre}`;
    if (cleanApellido) return cleanApellido;
    if (formattedNombre) return formattedNombre;
    return 'PACIENTE';
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
    console.log(DRY_RUN ? 'DRY RUN - no se crearan carpetas' : 'EJECUCION REAL - se crearan carpetas');
    console.log(`${'='.repeat(64)}\n`);

    let query = supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_historia_clinica')
        .eq('is_deleted', false)
        .not('link_historia_clinica', 'is', null)
        .order('apellido', { ascending: true });

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
    if (PATIENT_ID) console.log(`Filtro patient-id: ${PATIENT_ID}`);
    if (LIMIT > 0) console.log(`Filtro limit: ${LIMIT}`);
    console.log();

    let scanned = 0;
    let alreadyHad = 0;
    let missingDetected = 0;
    let createdCount = 0;
    let skippedNoMotherId = 0;
    const errors: string[] = [];
    const createdRecords: CreatedRecord[] = [];

    for (const patient of patients as PatientRow[]) {
        scanned += 1;
        const patientLabel = getPatientLabel(patient.apellido, patient.nombre);
        const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica);

        if (!motherFolderId) {
            skippedNoMotherId += 1;
            continue;
        }

        try {
            const subfoldersRes = await drive.files.list({
                q: `'${motherFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                fields: 'files(id, name)',
                pageSize: 200,
            });

            const subfolders = subfoldersRes.data.files || [];
            const hasPresentation = subfolders.some((f) =>
                (f.name || '').toUpperCase().includes('PRESENTACION')
            );

            if (hasPresentation) {
                alreadyHad += 1;
                continue;
            }

            missingDetected += 1;

            const baseName = getPatientFolderName(patient.apellido || '', patient.nombre || '');
            const presentationFolderName = `${baseName} - PRESENTACION`;

            let createdId: string | undefined;
            if (!DRY_RUN) {
                const created = await drive.files.create({
                    supportsAllDrives: true,
                    requestBody: {
                        name: presentationFolderName,
                        mimeType: 'application/vnd.google-apps.folder',
                        parents: [motherFolderId],
                    },
                    fields: 'id',
                });
                createdId = created.data.id || undefined;
                createdCount += 1;
            }

            createdRecords.push({
                patient_id: patient.id_paciente,
                patient_name: patientLabel,
                mother_folder_id: motherFolderId,
                presentation_folder_name: presentationFolderName,
                presentation_folder_id: createdId,
                dry_run: DRY_RUN,
            });

            if (VERBOSE) {
                console.log(
                    `  ${DRY_RUN ? '[DRY]' : '[CREATED]'} ${patientLabel} -> ${presentationFolderName}`
                );
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${patientLabel}: ${message}`);
            console.error(`  [ERROR] ${patientLabel}: ${message}`);
        }
    }

    const reportDir = path.join('scripts', 'output');
    const reportPath = path.join(reportDir, 'created_missing_presentation_subfolders.json');

    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(createdRecords, null, 2));

    console.log(`\n${'='.repeat(64)}`);
    console.log('RESUMEN');
    console.log(`${'='.repeat(64)}`);
    console.log(`Pacientes escaneados: ${scanned}`);
    console.log(`Ya tenian PRESENTACION: ${alreadyHad}`);
    console.log(`Con PRESENTACION faltante: ${missingDetected}`);
    console.log(`Carpetas creadas: ${createdCount}`);
    console.log(`Sin mother folder id valido: ${skippedNoMotherId}`);
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
        console.log('npx tsx scripts/create-missing-presentation-subfolders.ts --execute');
    }

    console.log();
}

main().catch((err) => {
    console.error('Fallo inesperado:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
