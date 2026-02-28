/**
 * audit-drive-patient-folders.ts
 * 
 * Scans the patient root folder in Google Drive and classifies every child item:
 *   ✅  Valid patient folder   – matches "APELLIDO, Nombre" pattern AND has a DB match
 *   ⚠️  Orphan patient folder  – looks like a patient folder but no DB record
 *   📄  Stray patient file     – file that looks like it belongs to a patient (Phase 2 sync)
 *   ❌  Junk item              – files/folders that don't belong in patient root
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/audit-drive-patient-folders.ts          # dry-run
 *   npx ts-node --transpile-only scripts/audit-drive-patient-folders.ts --run    # archive junk
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ─── Config ────────────────────────────────────────────────────────────
const PACIENTES_ROOT = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';
const ARCHIVE_FOLDER_NAME = '_ARCHIVO - No Pacientes';
const DRY_RUN = !process.argv.includes('--run');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Google Auth ───────────────────────────────────────────────────────
function getAuth() {
    const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
    const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;

    if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
        const oauth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
        oauth2Client.setCredentials({ refresh_token: oauthRefreshToken });
        return oauth2Client;
    }

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        throw new Error('Google Drive auth not configured.');
    }

    return new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
}

function getDrive() {
    return google.drive({ version: 'v3', auth: getAuth() });
}

// ─── Pattern Matching ──────────────────────────────────────────────────
function looksLikePatientName(name: string): boolean {
    const stripped = name.replace(/^\[.*?\]\s*/, '').trim();
    // "Apellido, Nombre" pattern (any case)
    if (/^[A-Za-záéíóúñüÁÉÍÓÚÑÜ\s']+,\s*.+$/.test(stripped)) return true;
    // "Nombre Apellido" pattern (at least 2 words, all letters)
    const words = stripped.split(/\s+/);
    if (words.length >= 2 && words.every(w => /^[A-Za-záéíóúñüÁÉÍÓÚÑÜ'.]+$/.test(w))) return true;
    return false;
}

function extractPatientKey(folderName: string): { apellido: string; nombre: string } | null {
    const stripped = folderName.replace(/^\[.*?\]\s*/, '');
    const commaIndex = stripped.indexOf(',');
    if (commaIndex < 0) return null;

    const apellido = stripped.substring(0, commaIndex).trim().toUpperCase();
    const nombre = stripped.substring(commaIndex + 1).trim().toUpperCase();

    if (!apellido || !nombre) return null;
    return { apellido, nombre };
}

// ─── Types ─────────────────────────────────────────────────────────────
interface DriveItem {
    id: string;
    name: string;
    mimeType: string;
    isFolder: boolean;
}

type Classification = 'valid_patient' | 'orphan_patient' | 'stray_patient_file' | 'junk';

interface ClassifiedItem extends DriveItem {
    classification: Classification;
    matchedPatientId?: string;
    reason?: string;
}

// ─── Main ──────────────────────────────────────────────────────────────
async function run() {
    console.log(`\n🔍 Auditoría de carpetas de pacientes en Google Drive`);
    console.log(`   DRY_RUN: ${DRY_RUN}\n`);

    const drive = getDrive();

    // 1. Load all patients from DB
    console.log('📦 Cargando pacientes de la base de datos...');
    const { data: patients, error: dbError } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_historia_clinica')
        .eq('is_deleted', false);

    if (dbError) {
        console.error('Error cargando pacientes:', dbError.message);
        process.exit(1);
    }

    const patientMap = new Map<string, typeof patients[0]>();
    for (const p of patients || []) {
        const key = `${(p.apellido || '').toUpperCase().trim()}::${(p.nombre || '').toUpperCase().trim()}`;
        patientMap.set(key, p);
    }
    console.log(`   ${patientMap.size} pacientes cargados.\n`);

    // 2. List ALL items in root
    console.log('📂 Escaneando carpeta raíz de pacientes...');
    const allItems: DriveItem[] = [];
    let pageToken: string | undefined;

    do {
        const res = await drive.files.list({
            q: `'${PACIENTES_ROOT}' in parents and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageToken,
            pageSize: 200,
        });

        for (const f of res.data.files || []) {
            if (f.id && f.name) {
                allItems.push({
                    id: f.id,
                    name: f.name,
                    mimeType: f.mimeType || 'unknown',
                    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
                });
            }
        }
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    console.log(`   ${allItems.length} items encontrados.\n`);

    // 3. Classify
    console.log('🏷️  Clasificando items...');
    const classified: ClassifiedItem[] = [];

    for (const item of allItems) {
        if (item.name === ARCHIVE_FOLDER_NAME) continue;

        // --- FOLDERS ---
        if (item.isFolder) {
            const key = extractPatientKey(item.name);
            if (key) {
                const dbKey = `${key.apellido}::${key.nombre}`;
                const match = patientMap.get(dbKey) || findPartialMatch(patientMap, key);

                if (match) {
                    classified.push({ ...item, classification: 'valid_patient', matchedPatientId: match.id_paciente });
                } else {
                    classified.push({ ...item, classification: 'orphan_patient', reason: `Sin match en DB: ${key.apellido}, ${key.nombre}` });
                }
            } else if (looksLikePatientName(item.name)) {
                classified.push({ ...item, classification: 'orphan_patient', reason: 'Formato paciente sin coma o match' });
            } else {
                classified.push({ ...item, classification: 'junk', reason: 'Carpeta no es de paciente' });
            }
            continue;
        }

        // --- FILES ---
        if (looksLikePatientName(item.name)) {
            classified.push({ ...item, classification: 'stray_patient_file', reason: 'Archivo con nombre de paciente (sync en Fase 2)' });
        } else {
            classified.push({ ...item, classification: 'junk', reason: 'Archivo suelto no relacionado a paciente' });
        }
    }

    // 4. Summary
    const valid = classified.filter(c => c.classification === 'valid_patient');
    const orphans = classified.filter(c => c.classification === 'orphan_patient');
    const stray = classified.filter(c => c.classification === 'stray_patient_file');
    const junk = classified.filter(c => c.classification === 'junk');

    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Pacientes válidos:     ${valid.length}`);
    console.log(`   ⚠️  Huérfanos:             ${orphans.length}`);
    console.log(`   📄 Archivos de paciente:  ${stray.length} (se sincronizan en Fase 2)`);
    console.log(`   ❌ Basura a archivar:      ${junk.length}`);

    if (orphans.length > 0) {
        console.log(`\n⚠️  Carpetas huérfanas:`);
        for (const o of orphans) {
            console.log(`   - "${o.name}" → ${o.reason}`);
        }
    }

    if (junk.length > 0) {
        console.log(`\n❌ Items basura (a mover a archivo):`);
        for (const j of junk) {
            console.log(`   - "${j.name}" (${j.isFolder ? 'carpeta' : 'archivo'}) → ${j.reason}`);
        }
    }

    // 5. Save report
    const reportPath = path.join(process.cwd(), 'scripts', 'output', 'drive-audit-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        total_items: allItems.length,
        summary: { valid: valid.length, orphans: orphans.length, stray_files: stray.length, junk: junk.length },
        details: {
            orphans: orphans.map(o => ({ id: o.id, name: o.name, reason: o.reason })),
            stray_patient_files: stray.map(s => ({ id: s.id, name: s.name, mimeType: s.mimeType })),
            junk: junk.map(j => ({ id: j.id, name: j.name, isFolder: j.isFolder, reason: j.reason })),
        }
    }, null, 2));
    console.log(`\n📄 Reporte guardado en: ${reportPath}`);

    // 6. Move junk items
    if (junk.length > 0 && !DRY_RUN) {
        console.log(`\n🚚 Moviendo ${junk.length} items basura...`);

        let archiveFolderId: string;
        const existingArchive = await drive.files.list({
            q: `name='${ARCHIVE_FOLDER_NAME}' and '${PACIENTES_ROOT}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id)',
        });

        if (existingArchive.data.files && existingArchive.data.files.length > 0) {
            archiveFolderId = existingArchive.data.files[0].id!;
        } else {
            const newArchive = await drive.files.create({
                supportsAllDrives: true,
                requestBody: {
                    name: ARCHIVE_FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [PACIENTES_ROOT],
                },
                fields: 'id',
            });
            archiveFolderId = newArchive.data.id!;
        }

        let moved = 0;
        for (const j of junk) {
            try {
                await drive.files.update({
                    fileId: j.id,
                    supportsAllDrives: true,
                    addParents: archiveFolderId,
                    removeParents: PACIENTES_ROOT,
                    fields: 'id',
                });
                moved++;
                console.log(`   ✓ Movido: "${j.name}"`);
            } catch (e: any) {
                console.error(`   ✗ Error: "${j.name}": ${e.message}`);
            }
        }

        console.log(`\n✅ ${moved}/${junk.length} items movidos a "${ARCHIVE_FOLDER_NAME}"`);
    } else if (junk.length > 0) {
        console.log(`\n💡 Ejecutá con --run para mover los ${junk.length} items basura.`);
    }

    console.log('\n🏁 Auditoría completada.\n');
}

function findPartialMatch(
    patientMap: Map<string, any>,
    key: { apellido: string; nombre: string }
): any | undefined {
    for (const [mapKey, p] of patientMap.entries()) {
        const [mapApellido] = mapKey.split('::');
        if (mapApellido === key.apellido) {
            const pNombre = (p.nombre || '').toUpperCase().trim();
            const firstName = key.nombre.split(' ')[0];
            const pFirstName = pNombre.split(' ')[0];
            if (pFirstName && firstName && (pFirstName.startsWith(firstName) || firstName.startsWith(pFirstName))) {
                return p;
            }
        }
    }
    return undefined;
}

run().catch(console.error);
