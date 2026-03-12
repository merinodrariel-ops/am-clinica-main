/**
 * sync-drive-presentations.ts
 * 
 * Synchronizes Google Drive presentations with the Supabase patient database.
 * 
 * Runs in the correct order to avoid the "ordering gap":
 *   1. PART C: Link orphan Drive folders to patients without link_historia_clinica
 *   2. PART A: Scan [PRESENTACION] subfolders for slides → update link_google_slides
 *   3. PART B: Match stray presentation files in root to patients → move + link
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/sync-drive-presentations.ts          # dry-run
 *   npx ts-node --transpile-only scripts/sync-drive-presentations.ts --run    # apply changes
 */

import { google, drive_v3 } from 'googleapis';

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ─── Config ────────────────────────────────────────────────────────────
const PACIENTES_ROOT = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';
const DRY_RUN = !process.argv.includes('--run');

const PRESENTATION_MIME_TYPES = new Set([
    'application/vnd.google-apps.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
]);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Google Auth ───────────────────────────────────────────────────────
function getAuth() {
    const authMode = (process.env.GOOGLE_DRIVE_AUTH_MODE || 'auto').toLowerCase();
    const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
    const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;

    const preferredServiceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const preferredServiceKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (authMode === 'service_account') {
        if (!preferredServiceEmail || !preferredServiceKey) {
            throw new Error('GOOGLE_DRIVE_AUTH_MODE=service_account pero faltan GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY.');
        }

        return new google.auth.GoogleAuth({
            credentials: { client_email: preferredServiceEmail, private_key: preferredServiceKey },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    }

    if (authMode === 'oauth' && (!oauthClientId || !oauthClientSecret || !oauthRefreshToken)) {
        throw new Error('GOOGLE_DRIVE_AUTH_MODE=oauth pero faltan GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN.');
    }

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

// ─── Helpers ───────────────────────────────────────────────────────────
function extractFolderIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch?.[1]) return folderMatch[1];
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (idMatch?.[1]) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;
    return null;
}

function normalizePatientName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

interface PatientRecord {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    link_historia_clinica: string | null;
    link_google_slides: string | null;
}

// ─── Main ──────────────────────────────────────────────────────────────
async function run() {
    console.log(`\n🔄 Sincronización Drive ↔ Base de Datos`);
    console.log(`   DRY_RUN: ${DRY_RUN}\n`);

    const drive = getDrive();

    // 1. Load all patients
    console.log('📦 Cargando pacientes...');
    const { data: patients, error: dbError } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_historia_clinica, link_google_slides')
        .eq('is_deleted', false);

    if (dbError || !patients) {
        console.error('Error cargando pacientes:', dbError?.message);
        process.exit(1);
    }

    console.log(`   ${patients.length} pacientes cargados.\n`);

    // Build lookup maps
    const patientsByNormalizedName = new Map<string, PatientRecord>();
    for (const p of patients) {
        const apellido = normalizePatientName(p.apellido || '');
        const nombre = normalizePatientName(p.nombre || '');
        if (apellido && nombre) {
            patientsByNormalizedName.set(`${apellido}::${nombre}`, p);
            const firstName = nombre.split(' ')[0];
            if (firstName) {
                const shortKey = `${apellido}::${firstName}`;
                if (!patientsByNormalizedName.has(shortKey)) {
                    patientsByNormalizedName.set(shortKey, p);
                }
            }
        }
    }

    const stats = {
        foldersLinked: 0,
        slidesLinkedFromSubfolders: 0,
        slidesLinkedFromStrayFiles: 0,
        strayFilesMoved: 0,
        errors: 0,
    };

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1 (was Part C): Link orphan folders to patients FIRST
    // This ensures all patients have link_historia_clinica BEFORE we
    // try to scan their subfolders for slides.
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══ PASO 1: Vincular carpetas huérfanas a pacientes sin link ═══\n');

    // List all folders in root
    const rootFolders: Array<{ id: string; name: string }> = [];
    let pageToken: string | undefined;

    do {
        const res: any = await drive.files.list({
            q: `'${PACIENTES_ROOT}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'nextPageToken, files(id, name)',
            pageToken,
            pageSize: 200,
        });

        for (const f of res.data.files || []) {
            if (f.id && f.name) {
                rootFolders.push({ id: f.id, name: f.name });
            }
        }
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    const foldersByNormalizedName = new Map<string, typeof rootFolders[0]>();
    for (const folder of rootFolders) {
        const normalized = normalizePatientName(folder.name);
        foldersByNormalizedName.set(normalized, folder);
    }

    const patientsWithoutFolder = patients.filter((p: any) => !p.link_historia_clinica);
    console.log(`   ${patientsWithoutFolder.length} pacientes sin carpeta Drive.\n`);

    for (const patient of patientsWithoutFolder) {
        const apellido = normalizePatientName(patient.apellido || '');
        const nombre = normalizePatientName(patient.nombre || '');
        if (!apellido) continue;

        const searchKey = `${apellido} ${nombre}`;
        const matchedFolder = foldersByNormalizedName.get(searchKey);

        if (matchedFolder) {
            const folderUrl = `https://drive.google.com/drive/folders/${matchedFolder.id}`;
            console.log(`   🔗 ${patient.apellido}, ${patient.nombre} → ${matchedFolder.name}`);

            if (!DRY_RUN) {
                await supabase
                    .from('pacientes')
                    .update({ link_historia_clinica: folderUrl })
                    .eq('id_paciente', patient.id_paciente);
            }
            // Update the in-memory record so Step 2 can use it
            patient.link_historia_clinica = folderUrl;
            stats.foldersLinked++;
        }
    }

    console.log(`\n   Paso 1: ${stats.foldersLinked} carpetas vinculadas.\n`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2 (was Part A): Scan existing patient folders for slides
    // Now includes patients that were JUST linked in Step 1.
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══ PASO 2: Escanear subcarpetas [PRESENTACION] existentes ═══\n');

    const patientsWithFolder = patients.filter((p: any) => p.link_historia_clinica);
    const patientsNeedingSlides = patientsWithFolder.filter((p: any) => !p.link_google_slides);

    console.log(`   ${patientsWithFolder.length} pacientes con carpeta Drive`);
    console.log(`   ${patientsNeedingSlides.length} necesitan link_google_slides\n`);

    let batchCount = 0;
    for (const patient of patientsNeedingSlides) {
        batchCount++;
        if (batchCount % 20 === 0) {
            console.log(`   ... procesados ${batchCount}/${patientsNeedingSlides.length}`);
        }

        const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica);
        if (!motherFolderId) continue;

        try {
            const subRes: any = await drive.files.list({
                q: `'${motherFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                fields: 'files(id, name)',
            });

            const presentationFolder = (subRes.data.files || []).find((f: any) =>
                f.name?.includes('PRESENTACION') || f.name?.startsWith('[PRESENTACION]')
            );

            if (!presentationFolder?.id) continue;

            const filesRes: any = await drive.files.list({
                q: `'${presentationFolder.id}' in parents and trashed=false`,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                fields: 'files(id, name, mimeType, webViewLink)',
                orderBy: 'createdTime desc',
            });

            const slides = (filesRes.data.files || []).filter((f: any) =>
                PRESENTATION_MIME_TYPES.has(f.mimeType || '')
            );

            if (slides.length > 0 && slides[0].webViewLink) {
                console.log(`   ✅ ${patient.apellido}, ${patient.nombre} → ${slides[0].name}`);

                if (!DRY_RUN) {
                    await supabase
                        .from('pacientes')
                        .update({ link_google_slides: slides[0].webViewLink })
                        .eq('id_paciente', patient.id_paciente);
                }
                patient.link_google_slides = slides[0].webViewLink!;
                stats.slidesLinkedFromSubfolders++;
            }
        } catch (e: unknown) {
            stats.errors++;
        }
    }

    console.log(`\n   Paso 2: ${stats.slidesLinkedFromSubfolders} slides vinculados desde subcarpetas.\n`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3 (was Part B): Match stray presentation files in root
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══ PASO 3: Vincular archivos sueltos en raíz a pacientes ═══\n');

    const strayFiles: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }> = [];
    pageToken = undefined;

    do {
        const res: any = await drive.files.list({
            q: `'${PACIENTES_ROOT}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
            pageToken,
            pageSize: 200,
        });

        for (const f of res.data.files || []) {
            if (f.id && f.name) {
                strayFiles.push({
                    id: f.id,
                    name: f.name,
                    mimeType: f.mimeType || '',
                    webViewLink: f.webViewLink || undefined,
                });
            }
        }
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    console.log(`   ${strayFiles.length} archivos sueltos en raíz.\n`);

    const presentationFiles = strayFiles.filter((f: any) => PRESENTATION_MIME_TYPES.has(f.mimeType));
    console.log(`   ${presentationFiles.length} son presentaciones.\n`);

    for (const file of presentationFiles) {
        const matchedPatient = matchFileToPatient(file.name, patientsByNormalizedName);

        if (!matchedPatient) continue;

        const motherFolderId = extractFolderIdFromUrl(matchedPatient.link_historia_clinica);
        if (!motherFolderId) continue;

        try {
            const subRes: any = await drive.files.list({
                q: `'${motherFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                fields: 'files(id, name)',
            });

            const presentationFolder = (subRes.data.files || []).find((f: any) =>
                f.name?.includes('PRESENTACION') || f.name?.startsWith('[PRESENTACION]')
            );

            if (!presentationFolder?.id) continue;

            console.log(`   📁 "${file.name}" → ${matchedPatient.apellido}, ${matchedPatient.nombre} [PRESENTACION]`);

            if (!DRY_RUN) {
                await drive.files.update({
                    fileId: file.id,
                    supportsAllDrives: true,
                    addParents: presentationFolder.id,
                    removeParents: PACIENTES_ROOT,
                    fields: 'id, webViewLink',
                });
                stats.strayFilesMoved++;

                if (!matchedPatient.link_google_slides && file.webViewLink) {
                    await supabase
                        .from('pacientes')
                        .update({ link_google_slides: file.webViewLink })
                        .eq('id_paciente', matchedPatient.id_paciente);
                    stats.slidesLinkedFromStrayFiles++;
                }
            } else {
                stats.strayFilesMoved++;
                if (!matchedPatient.link_google_slides) stats.slidesLinkedFromStrayFiles++;
            }
        } catch (e: unknown) {
            stats.errors++;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 Resumen de sincronización:`);
    console.log(`   🔗 Carpetas vinculadas a pacientes:       ${stats.foldersLinked}`);
    console.log(`   ✅ Slides vinculados desde subcarpetas:  ${stats.slidesLinkedFromSubfolders}`);
    console.log(`   📁 Archivos sueltos movidos:             ${stats.strayFilesMoved}`);
    console.log(`   🔗 Slides vinculados de archivos sueltos: ${stats.slidesLinkedFromStrayFiles}`);
    console.log(`   ❌ Errores:                               ${stats.errors}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Save report
    const reportPath = path.join(process.cwd(), 'scripts', 'output', 'drive-sync-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        dry_run: DRY_RUN,
        stats,
    }, null, 2));
    console.log(`📄 Reporte guardado en: ${reportPath}`);

    if (DRY_RUN) {
        console.log(`\n💡 Ejecutá con --run para aplicar los cambios.\n`);
    }

    console.log('🏁 Sincronización completada.\n');
}

function matchFileToPatient(
    fileName: string,
    patientMap: Map<string, PatientRecord>
): PatientRecord | null {
    let cleanName = fileName
        .replace(/\.(pptx?|key)$/i, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/\s*copy\s*$/i, '')
        .trim();

    if (cleanName.includes(',')) {
        const commaIdx = cleanName.indexOf(',');
        const apellido = normalizePatientName(cleanName.substring(0, commaIdx));
        const nombre = normalizePatientName(cleanName.substring(commaIdx + 1));

        if (apellido && nombre) {
            const match = patientMap.get(`${apellido}::${nombre}`)
                || patientMap.get(`${apellido}::${nombre.split(' ')[0]}`);
            if (match) return match;
        }
    }

    const words = cleanName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        const apellido = normalizePatientName(words[words.length - 1]);
        const nombre = normalizePatientName(words.slice(0, -1).join(' '));
        const match = patientMap.get(`${apellido}::${nombre}`)
            || patientMap.get(`${apellido}::${nombre.split(' ')[0]}`);
        if (match) return match;

        const apellido2 = normalizePatientName(words[0]);
        const nombre2 = normalizePatientName(words.slice(1).join(' '));
        const match2 = patientMap.get(`${apellido2}::${nombre2}`)
            || patientMap.get(`${apellido2}::${nombre2.split(' ')[0]}`);
        if (match2) return match2;
    }

    return null;
}

run().catch(console.error);
