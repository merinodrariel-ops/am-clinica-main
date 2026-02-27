/**
 * Script masivo para:
 * 1. Crear carpetas estándar en Drive para todos los pacientes que no la tienen
 * 2. Buscar presentaciones sueltas en PACIENTES root y moverlas a la subcarpeta PRESENTACION
 *
 * Ejecutar en modo DRY RUN (solo muestra qué haría):
 *   npx tsx scripts/bulk-create-drive-folders.ts
 *
 * Ejecutar en modo REAL:
 *   npx tsx scripts/bulk-create-drive-folders.ts --execute
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = !process.argv.includes('--execute');
const VERBOSE = process.argv.includes('--verbose');

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const PACIENTES_ROOT = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';
const LOOSE_FILE_LOG_LIMIT = 40;
const MOVE_SAMPLE_LIMIT = 30;

function getAuth() {
    return new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
}

const drive = google.drive({ version: 'v3', auth: getAuth() });

const DRY_RUN_PREFIX = 'DRY_RUN_ID:';

function buildDryRunId(parentId: string, name: string): string {
    const parentPart = parentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-18) || 'root';
    const namePart = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'folder';
    return `${DRY_RUN_PREFIX}${parentPart}:${namePart}`;
}

function isDryRunId(value: string): boolean {
    return value.startsWith(DRY_RUN_PREFIX);
}

function normalizeLooseName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
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

async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
    if (DRY_RUN && isDryRunId(parentId)) {
        // Parent simulado: no consultar Drive API.
        return buildDryRunId(parentId, name);
    }

    // Check if exists
    const existing = await drive.files.list({
        q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name)',
    });

    if (existing.data.files && existing.data.files.length > 0) {
        return existing.data.files[0].id!;
    }

    if (DRY_RUN) return buildDryRunId(parentId, name);

    const created = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });

    return created.data.id!;
}

async function getFolderWebViewLink(folderId: string): Promise<string | null> {
    if (DRY_RUN && isDryRunId(folderId)) return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
    try {
        const file = await drive.files.get({
            fileId: folderId,
            supportsAllDrives: true,
            fields: 'webViewLink',
        });
        return file.data.webViewLink || null;
    } catch {
        return null;
    }
}

async function moveFileToFolder(fileId: string, newParentId: string): Promise<void> {
    if (DRY_RUN) return;
    try {
        const file = await drive.files.get({
            fileId: fileId,
            fields: 'parents'
        });
        const currentParents = file.data.parents?.join(',') || '';

        await drive.files.update({
            fileId,
            supportsAllDrives: true,
            enforceSingleParent: true,
            addParents: newParentId,
            removeParents: currentParents,
            fields: 'id',
        });
    } catch (err: any) {
        throw new Error(`Error en moveFileToFolder: ${err.message}`);
    }
}

interface PatientRow {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    link_historia_clinica: string | null;
}

async function main() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(DRY_RUN ? '  DRY RUN — No se harán cambios' : '  EJECUTANDO — Se crearán carpetas reales');
    console.log(`${'='.repeat(60)}\n`);

    // 1. Fetch all patients
    const { data: patients, error } = await sb
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_historia_clinica')
        .order('apellido');

    if (error || !patients) {
        console.error('Error fetching patients:', error);
        return;
    }

    // 2. Filter: only patients with usable name data and no existing folder
    const validPatients = patients.filter((p: PatientRow) => {
        const nombre = (p.nombre || '').trim();
        const apellido = (p.apellido || '').trim();
        // Must have both nombre AND apellido, each at least 2 chars
        if (nombre.length < 2 || apellido.length < 2) return false;
        // Skip obvious test data
        if (apellido.toLowerCase().includes('paciente') || nombre.toLowerCase().includes('paciente')) return false;
        if (apellido.toLowerCase() === 'test' || nombre.toLowerCase() === 'test') return false;
        return true;
    }) as PatientRow[];

    // 3. Deduplicate by normalized name (keep first occurrence)
    const seen = new Map<string, PatientRow>();
    const duplicates: PatientRow[] = [];
    for (const p of validPatients) {
        const key = getPatientFolderName(p.apellido || '', p.nombre || '');
        if (!seen.has(key)) {
            seen.set(key, p);
        } else {
            duplicates.push(p);
        }
    }

    const uniquePatients = Array.from(seen.values());
    const needsFolder = uniquePatients.filter(p => !p.link_historia_clinica);
    const hasFolder = uniquePatients.filter(p => p.link_historia_clinica);

    console.log(`Total en DB: ${patients.length}`);
    console.log(`Válidos (nombre+apellido): ${validPatients.length}`);
    console.log(`Únicos (deduplicados): ${uniquePatients.length}`);
    console.log(`Duplicados ignorados: ${duplicates.length}`);
    console.log(`Ya tienen carpeta: ${hasFolder.length}`);
    console.log(`Necesitan carpeta: ${needsFolder.length}`);
    console.log();

    // 4. Index existing folders in PACIENTES ROOT to detect pre-existing presentations
    console.log('Indexando carpetas existentes en Drive...');
    let existingDriveFolders: { id: string; name: string }[] = [];
    let pageToken: string | undefined;

    do {
        const res = await drive.files.list({
            q: `'${PACIENTES_ROOT}' in parents and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageSize: 200,
            pageToken,
        });

        const files = res.data.files || [];
        // We want both folders and non-folders (presentations might be files at root)
        existingDriveFolders.push(...files.map(f => ({ id: f.id!, name: f.name!, mimeType: f.mimeType || '' })) as any);
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    console.log(`  Encontrados ${existingDriveFolders.length} items en PACIENTES root\n`);

    // Separate into folders and loose files
    const FOLDER_MIME = 'application/vnd.google-apps.folder';
    const rootFolders = (existingDriveFolders as any[]).filter(f => f.mimeType === FOLDER_MIME);
    const rootLooseFiles = (existingDriveFolders as any[]).filter(f => f.mimeType !== FOLDER_MIME);

    const rootFoldersByName = new Map(rootFolders.map(f => [f.name, f.id]));

    console.log(`  ${rootFolders.length} carpetas, ${rootLooseFiles.length} archivos sueltos`);

    // 5. Identify loose presentations that match patient names
    if (rootLooseFiles.length > 0) {
        console.log('\n--- ARCHIVOS SUELTOS EN RAÍZ (presentaciones del sistema anterior) ---');
        const mimeCount = new Map<string, number>();
        for (const file of rootLooseFiles) {
            mimeCount.set(file.mimeType, (mimeCount.get(file.mimeType) || 0) + 1);
        }

        const mimeSummary = Array.from(mimeCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([mime, count]) => `${count}× ${mime}`)
            .join(' | ');

        console.log(`  Resumen MIME: ${mimeSummary}`);

        const sample = rootLooseFiles.slice(0, LOOSE_FILE_LOG_LIMIT);
        for (const file of sample) {
            console.log(`  📄 ${file.name} (${file.mimeType})`);
        }

        if (rootLooseFiles.length > LOOSE_FILE_LOG_LIMIT) {
            console.log(`  ... +${rootLooseFiles.length - LOOSE_FILE_LOG_LIMIT} archivos sueltos adicionales`);
        }
    }

    // 6. Create folders for patients that need them
    console.log(`\n--- CREACIÓN DE CARPETAS (${needsFolder.length} pacientes) ---\n`);

    let created = 0;
    let linkedExisting = 0;
    let createdNew = 0;
    let skipped = 0;
    let moved = 0;
    let matchedPatients = 0;
    let ambiguousMatches = 0;
    const moveSamples: string[] = [];
    const claimedLooseFileIds = new Set<string>();
    const ambiguousMatchesRows: any[] = [];
    const errors: string[] = [];

    for (const patient of needsFolder) {
        const folderName = getPatientFolderName(patient.apellido || '', patient.nombre || '');

        try {
            // Check if mother folder already exists in Drive (but not linked in DB)
            const existingId = rootFoldersByName.get(folderName);

            let motherFolderId: string;
            if (existingId) {
                motherFolderId = existingId;
                linkedExisting++;
                if (VERBOSE) {
                    console.log(`  📁 ${folderName} — ya existe en Drive, vinculando`);
                }
            } else {
                motherFolderId = await findOrCreateFolder(PACIENTES_ROOT, folderName);
                createdNew++;
                if (VERBOSE) {
                    console.log(`  📁 ${folderName} — ${DRY_RUN ? 'se crearía' : 'creada'}`);
                }
            }

            // Create standard subfolders
            const subfolders = [
                `${folderName} - FOTO & VIDEO`,
                `${folderName} - PRESENTACION`,
                `${folderName} - PRESUPUESTO`,
            ];

            let presentationFolderId: string | null = null;

            for (const subName of subfolders) {
                const subId = await findOrCreateFolder(motherFolderId, subName);
                if (subName.includes('PRESENTACION')) {
                    presentationFolderId = subId;
                }
            }

            // Update patient record with folder URL
            const folderUrl = await getFolderWebViewLink(motherFolderId);
            if (folderUrl && !DRY_RUN) {
                await sb
                    .from('pacientes')
                    .update({ link_historia_clinica: folderUrl })
                    .eq('id_paciente', patient.id_paciente);
            }

            // Look for loose presentations matching this patient name
            // Presentations are usually named like "APELLIDO, Nombre" or similar
            if (presentationFolderId) {
                const matchingFiles = rootLooseFiles.filter(f => {
                    if (claimedLooseFileIds.has(f.id)) return false;
                    const fName = normalizeLooseName(f.name);
                    const pNombre = normalizeLooseName(patient.nombre || '');
                    const pApellido = normalizeLooseName(patient.apellido || '');
                    return (
                        fName.includes(pApellido) && fName.includes(pNombre) ||
                        fName === normalizeLooseName(folderName)
                    );
                });

                if (matchingFiles.length > 1) {
                    ambiguousMatches++;
                    ambiguousMatchesRows.push({
                        patient_id: patient.id_paciente,
                        patient_name: folderName,
                        matches: matchingFiles.map(f => f.name).join(' | ')
                    });
                }
                if (matchingFiles.length > 0) matchedPatients++;

                for (const file of matchingFiles) {
                    claimedLooseFileIds.add(file.id);
                    if (VERBOSE) {
                        console.log(`    ↳ Moviendo "${file.name}" → PRESENTACION`);
                    }
                    if (moveSamples.length < MOVE_SAMPLE_LIMIT) {
                        moveSamples.push(`${file.name} -> ${folderName}`);
                    }
                    await moveFileToFolder(file.id, presentationFolderId);
                    moved++;
                }
            }

            created++;

            // Rate limiting: pause every 10 patients to avoid Google API quota
            if (created % 10 === 0) {
                if (VERBOSE) {
                    console.log(`  ... ${created}/${needsFolder.length} procesados, pausando 2s...`);
                } else {
                    console.log(`  Progreso: ${created}/${needsFolder.length} | movidas: ${moved} | errores: ${errors.length}`);
                }
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            const msg = `Error con ${folderName}: ${err instanceof Error ? err.message : err}`;
            console.error(`  ❌ ${msg}`);
            errors.push(msg);
            skipped++;
        }
    }

    // 7. Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('  RESUMEN');
    console.log(`${'='.repeat(60)}`);
    console.log(`  Carpetas creadas/vinculadas: ${created}`);
    console.log(`  - Nuevas: ${createdNew}`);
    console.log(`  - Ya existentes (solo link DB): ${linkedExisting}`);
    console.log(`  Presentaciones movidas: ${moved}`);
    console.log(`  Pacientes con matches: ${matchedPatients}`);
    console.log(`  Pacientes con >1 match: ${ambiguousMatches}`);
    console.log(`  Archivos sueltos no asignados: ${rootLooseFiles.length - claimedLooseFileIds.size}`);
    console.log(`  Errores: ${errors.length}`);
    if (moveSamples.length > 0) {
        console.log('\n  Muestras de movimientos:');
        for (const sample of moveSamples) {
            console.log(`    - ${sample}`);
        }
        if (moved > moveSamples.length) {
            console.log(`    ... +${moved - moveSamples.length} movimientos adicionales`);
        }
    }
    if (errors.length > 0) {
        console.log('\n  Errores detallados:');
        errors.forEach(e => console.log(`    - ${e}`));
    }

    // 8. Export report
    if (ambiguousMatchesRows.length > 0) {
        const reportPath = 'scripts/output/ambiguous_presentations.json';
        const fs = require('fs');
        const path = require('path');
        const dir = path.dirname(reportPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(ambiguousMatchesRows, null, 2));
        console.log(`\n📄 Reporte de ambigüedades exportado a: ${reportPath}`);
    }
    if (DRY_RUN) {
        console.log('\n  ⚠️  Esto fue un DRY RUN. Para ejecutar de verdad:');
        console.log('     npx tsx scripts/bulk-create-drive-folders.ts --execute');
    }
    console.log();
}

main().catch(console.error);
