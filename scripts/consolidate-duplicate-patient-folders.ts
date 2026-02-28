/**
 * Consolidates duplicate patient mother folders under PACIENTES root.
 *
 * Safety defaults:
 * - Dry run by default (no writes)
 * - Only consolidates groups with exactly ONE linked folder in DB
 * - Skips groups where DB has more than one patient with same normalized full name
 *
 * Usage:
 *   npx tsx scripts/consolidate-duplicate-patient-folders.ts
 *   npx tsx scripts/consolidate-duplicate-patient-folders.ts --execute
 *   npx tsx scripts/consolidate-duplicate-patient-folders.ts --execute --limit=50
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const EXECUTE = process.argv.includes('--execute');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

interface PatientRow {
  id_paciente: string;
  nombre: string | null;
  apellido: string | null;
  link_historia_clinica: string | null;
}

interface DriveFolder {
  id: string;
  name: string;
  createdTime?: string;
  webViewLink?: string;
}

interface GroupReport {
  normalizedName: string;
  folderNames: string[];
  totalFolders: number;
  linkedFolders: number;
  dbPatientsWithSameName: number;
  action: 'candidate' | 'executed' | 'skipped';
  reason?: string;
  keepFolderId?: string;
  keepFolderName?: string;
  extraFolderIds: string[];
  movedChildrenCount: number;
  updatedPatientLinksCount: number;
  trashedFoldersCount: number;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizePatientFullName(apellido: string | null, nombre: string | null): string {
  const a = normalizeName(apellido || '');
  const n = normalizeName(nombre || '');
  if (a && n) return `${a}, ${n}`;
  return a || n || 'PACIENTE';
}

function folderIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  if (idMatch?.[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;
  return null;
}

function folderUrlFromId(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function getAuth() {
  const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;
  const oauthRedirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oauth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret, oauthRedirectUri);
    oauth2Client.setCredentials({ refresh_token: oauthRefreshToken });
    return oauth2Client;
  }

  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

async function listAllPatientRootFolders(drive: ReturnType<typeof google.drive>): Promise<DriveFolder[]> {
  const results: DriveFolder[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken, files(id,name,createdTime,webViewLink)',
      pageSize: 1000,
      pageToken,
    });

    for (const file of res.data.files || []) {
      if (!file.id || !file.name) continue;
      results.push({
        id: file.id,
        name: file.name,
        createdTime: file.createdTime || undefined,
        webViewLink: file.webViewLink || undefined,
      });
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return results;
}

async function listChildren(drive: ReturnType<typeof google.drive>, folderId: string) {
  const children: Array<{ id: string; name: string; parents: string[] }> = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken, files(id,name,parents)',
      pageSize: 1000,
      pageToken,
    });

    for (const file of res.data.files || []) {
      if (!file.id) continue;
      children.push({
        id: file.id,
        name: file.name || 'Sin nombre',
        parents: (file.parents || []).filter(Boolean) as string[],
      });
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return children;
}

async function moveAllChildrenToFolder(
  drive: ReturnType<typeof google.drive>,
  sourceFolderId: string,
  targetFolderId: string
): Promise<number> {
  if (sourceFolderId === targetFolderId) return 0;

  const children = await listChildren(drive, sourceFolderId);
  let moved = 0;

  for (const child of children) {
    const removeParents = child.parents.join(',');
    if (!removeParents) continue;

    await drive.files.update({
      fileId: child.id,
      supportsAllDrives: true,
      enforceSingleParent: true,
      addParents: targetFolderId,
      removeParents,
      fields: 'id',
    });

    moved += 1;
  }

  return moved;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const drive = google.drive({ version: 'v3', auth: getAuth() });

  const { data: patients, error: patientsError } = await supabase
    .from('pacientes')
    .select('id_paciente, nombre, apellido, link_historia_clinica')
    .eq('is_deleted', false);

  if (patientsError || !patients) {
    throw new Error(patientsError?.message || 'No se pudieron cargar pacientes');
  }

  const patientRows = patients as PatientRow[];

  const dbNameCount = new Map<string, number>();
  for (const patient of patientRows) {
    const key = normalizePatientFullName(patient.apellido, patient.nombre);
    dbNameCount.set(key, (dbNameCount.get(key) || 0) + 1);
  }

  const linkedFolderToPatients = new Map<string, PatientRow[]>();
  for (const patient of patientRows) {
    const linkedFolderId = folderIdFromUrl(patient.link_historia_clinica);
    if (!linkedFolderId) continue;
    const existing = linkedFolderToPatients.get(linkedFolderId) || [];
    existing.push(patient);
    linkedFolderToPatients.set(linkedFolderId, existing);
  }

  const rootFolders = await listAllPatientRootFolders(drive);
  const groupsByName = new Map<string, DriveFolder[]>();
  for (const folder of rootFolders) {
    const key = normalizeName(folder.name);
    const existing = groupsByName.get(key) || [];
    existing.push(folder);
    groupsByName.set(key, existing);
  }

  const duplicateGroups = [...groupsByName.entries()].filter(([, folders]) => folders.length > 1);

  let processedGroups = 0;
  let candidateGroups = 0;
  let executedGroups = 0;
  let movedChildrenCount = 0;
  let updatedLinksCount = 0;
  let trashedFoldersCount = 0;

  const report: GroupReport[] = [];

  for (const [normalizedName, folders] of duplicateGroups) {
    if (LIMIT > 0 && processedGroups >= LIMIT) break;
    processedGroups += 1;

    const linkedFolders = folders.filter((folder) => linkedFolderToPatients.has(folder.id));
    const dbCount = dbNameCount.get(normalizedName) || 0;

    const baseReport: GroupReport = {
      normalizedName,
      folderNames: [...new Set(folders.map((folder) => folder.name))],
      totalFolders: folders.length,
      linkedFolders: linkedFolders.length,
      dbPatientsWithSameName: dbCount,
      action: 'skipped',
      extraFolderIds: [],
      movedChildrenCount: 0,
      updatedPatientLinksCount: 0,
      trashedFoldersCount: 0,
    };

    if (dbCount > 1) {
      baseReport.reason = 'nombre_duplicado_en_db';
      report.push(baseReport);
      continue;
    }

    if (linkedFolders.length !== 1) {
      baseReport.reason = linkedFolders.length === 0 ? 'sin_carpeta_linkeada' : 'mas_de_una_carpeta_linkeada';
      report.push(baseReport);
      continue;
    }

    const keepFolder = linkedFolders[0];
    const extraFolders = folders.filter((folder) => folder.id !== keepFolder.id);

    baseReport.action = EXECUTE ? 'executed' : 'candidate';
    baseReport.keepFolderId = keepFolder.id;
    baseReport.keepFolderName = keepFolder.name;
    baseReport.extraFolderIds = extraFolders.map((folder) => folder.id);
    candidateGroups += 1;

    if (EXECUTE) {
      let hasExecutionErrors = false;
      for (const extraFolder of extraFolders) {
        try {
          const moved = await moveAllChildrenToFolder(drive, extraFolder.id, keepFolder.id);
          movedChildrenCount += moved;
          baseReport.movedChildrenCount += moved;

          const linkedPatients = linkedFolderToPatients.get(extraFolder.id) || [];
          const canonicalUrl = keepFolder.webViewLink || folderUrlFromId(keepFolder.id);

          for (const patient of linkedPatients) {
            const { error: updateError } = await supabase
              .from('pacientes')
              .update({ link_historia_clinica: canonicalUrl })
              .eq('id_paciente', patient.id_paciente);

            if (!updateError) {
              updatedLinksCount += 1;
              baseReport.updatedPatientLinksCount += 1;
            }
          }

          await drive.files.update({
            fileId: extraFolder.id,
            supportsAllDrives: true,
            requestBody: { trashed: true },
            fields: 'id',
          });

          trashedFoldersCount += 1;
          baseReport.trashedFoldersCount += 1;
        } catch (error) {
          hasExecutionErrors = true;
          const msg = error instanceof Error ? error.message : String(error);
          baseReport.reason = baseReport.reason
            ? `${baseReport.reason}; error_extra_${extraFolder.id}: ${msg}`
            : `error_extra_${extraFolder.id}: ${msg}`;
        }
      }

      if (!hasExecutionErrors) {
        executedGroups += 1;
      }
    }

    report.push(baseReport);
  }

  const reportDir = path.join('scripts', 'output');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const fileName = `duplicate_patient_folders_report_${EXECUTE ? 'execute' : 'dry_run'}.json`;
  const reportPath = path.join(reportDir, fileName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const skippedGroups = report.filter((row) => row.action === 'skipped').length;

  console.log('\n=== CONSOLIDACION DUPLICADOS PACIENTES ===');
  console.log(`Modo: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`Total carpetas root: ${rootFolders.length}`);
  console.log(`Grupos duplicados detectados: ${duplicateGroups.length}`);
  console.log(`Grupos procesados: ${processedGroups}${LIMIT > 0 ? ` (limit=${LIMIT})` : ''}`);
  console.log(`Candidatos seguros: ${candidateGroups}`);
  console.log(`Grupos salteados: ${skippedGroups}`);

  if (EXECUTE) {
    console.log(`Grupos consolidados: ${executedGroups}`);
    console.log(`Hijos movidos: ${movedChildrenCount}`);
    console.log(`Links de pacientes actualizados: ${updatedLinksCount}`);
    console.log(`Carpetas duplicadas enviadas a papelera: ${trashedFoldersCount}`);
  }

  console.log(`Reporte: ${reportPath}`);

  if (!EXECUTE) {
    console.log('\nPara ejecutar cambios reales:');
    console.log('npx tsx scripts/consolidate-duplicate-patient-folders.ts --execute');
  }
}

main().catch((error) => {
  console.error('Error en consolidacion de duplicados:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
