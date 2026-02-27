/**
 * Diagnóstico completo de acceso a Google Drive
 * Verifica que la service account tenga acceso a todas las carpetas configuradas
 *
 * Ejecutar: npx tsx scripts/diagnose-drive-access.ts
 */

import 'dotenv/config';
import { google } from 'googleapis';

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Todas las carpetas que usa la app
const FOLDERS_TO_CHECK: Record<string, string> = {
  'GOOGLE_DRIVE_FOLDER_ADMIN': process.env.GOOGLE_DRIVE_FOLDER_ADMIN || '',
  'GOOGLE_DRIVE_FOLDER_RECEPCION': process.env.GOOGLE_DRIVE_FOLDER_RECEPCION || '',
  'GOOGLE_DRIVE_FOLDER_PACIENTES': process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '',
  'PACIENTES_ROOT (hardcoded fallback)': '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti',
  'ORTODONCIA_ROOT (hardcoded)': '13LCOTm1tyH8QWw_0N5qTADiDkCKUZFpF',
};

// Template IDs usados
const TEMPLATES_TO_CHECK: Record<string, string> = {
  'CONTRACT_TEMPLATE (hardcoded)': '11HPtw303cEzTCITOwPqmJLxxpxIB6-1up0dMjuW15zc',
};

async function main() {
  console.log('=== DIAGNÓSTICO DE GOOGLE DRIVE ===\n');

  // 1. Check credentials
  console.log('1. CREDENCIALES');
  console.log(`   Service Account Email: ${SA_EMAIL || 'NO CONFIGURADO'}`);
  console.log(`   Private Key: ${SA_KEY ? 'Configurada (' + SA_KEY.length + ' chars)' : 'NO CONFIGURADA'}`);

  if (!SA_EMAIL || !SA_KEY) {
    console.error('\n   ERROR: Credenciales no configuradas. No se puede continuar.');
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: SA_EMAIL,
    key: SA_KEY,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
  });

  const drive = google.drive({ version: 'v3', auth });

  // 2. Test basic auth
  console.log('\n2. TEST DE AUTENTICACIÓN');
  try {
    const about = await drive.about.get({ fields: 'user' });
    console.log(`   Autenticado como: ${about.data.user?.emailAddress}`);
    console.log(`   Display name: ${about.data.user?.displayName}`);
  } catch (err) {
    console.error(`   ERROR de autenticación: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 3. Check each folder
  console.log('\n3. ACCESO A CARPETAS');
  console.log('   ' + '-'.repeat(80));

  for (const [label, folderId] of Object.entries(FOLDERS_TO_CHECK)) {
    if (!folderId) {
      console.log(`   ${label}`);
      console.log(`     Estado: NO CONFIGURADO (env var vacía)`);
      console.log(`     Acción: Necesitas configurar esta variable`);
      console.log('   ' + '-'.repeat(80));
      continue;
    }

    try {
      const file = await drive.files.get({
        fileId: folderId,
        supportsAllDrives: true,
        fields: 'id, name, mimeType, webViewLink, owners, permissions, shared, driveId',
      });

      const isFolder = file.data.mimeType === 'application/vnd.google-apps.folder';

      console.log(`   ${label}`);
      console.log(`     ID: ${folderId}`);
      console.log(`     Nombre: ${file.data.name}`);
      console.log(`     Tipo: ${isFolder ? 'Carpeta' : file.data.mimeType}`);
      console.log(`     URL: ${file.data.webViewLink}`);
      console.log(`     Shared Drive: ${file.data.driveId || 'No (My Drive de alguien)'}`);
      console.log(`     Estado: OK - ACCESO VERIFICADO`);

      // Try to list contents if it's a folder
      if (isFolder) {
        const contents = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          fields: 'files(id, name, mimeType)',
          pageSize: 5,
        });
        const count = contents.data.files?.length || 0;
        console.log(`     Contenido: ${count} items (mostrando max 5)`);
        contents.data.files?.forEach(f => {
          const icon = f.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
          console.log(`       ${icon} ${f.name}`);
        });
      }

      // Try to check permissions
      try {
        const perms = await drive.permissions.list({
          fileId: folderId,
          supportsAllDrives: true,
          fields: 'permissions(emailAddress, role, type)',
        });
        const saPermission = perms.data.permissions?.find(
          p => p.emailAddress === SA_EMAIL
        );
        if (saPermission) {
          console.log(`     Permiso SA: ${saPermission.role} (explícito)`);
        } else {
          console.log(`     Permiso SA: Heredado o via Shared Drive`);
        }
      } catch {
        console.log(`     Permisos: No se pueden listar (acceso limitado)`);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ${label}`);
      console.log(`     ID: ${folderId}`);
      console.log(`     Estado: ERROR - SIN ACCESO`);
      console.log(`     Error: ${msg}`);
      console.log(`     Acción: Compartir esta carpeta con ${SA_EMAIL}`);
    }
    console.log('   ' + '-'.repeat(80));
  }

  // 4. Check templates
  console.log('\n4. ACCESO A TEMPLATES');
  console.log('   ' + '-'.repeat(80));

  for (const [label, fileId] of Object.entries(TEMPLATES_TO_CHECK)) {
    try {
      const file = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'id, name, mimeType, webViewLink',
      });
      console.log(`   ${label}`);
      console.log(`     Nombre: ${file.data.name}`);
      console.log(`     Tipo: ${file.data.mimeType}`);
      console.log(`     Estado: OK - ACCESO VERIFICADO`);
    } catch (err) {
      console.log(`   ${label}`);
      console.log(`     ID: ${fileId}`);
      console.log(`     Estado: ERROR - SIN ACCESO`);
      console.log(`     Acción: Compartir con ${SA_EMAIL}`);
    }
    console.log('   ' + '-'.repeat(80));
  }

  // 5. Check what the SA can see at top level
  console.log('\n5. ARCHIVOS/CARPETAS COMPARTIDOS CON LA SERVICE ACCOUNT (top 15)');
  try {
    const shared = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners",
      fields: 'files(id, name, webViewLink)',
      pageSize: 15,
      orderBy: 'modifiedTime desc',
    });

    if (!shared.data.files?.length) {
      console.log('   La SA no es dueña de ninguna carpeta (normal si todo está compartido)');
    } else {
      shared.data.files.forEach(f => {
        console.log(`   📁 ${f.name} → ${f.id}`);
      });
    }

    // Also check shared with me
    const sharedWithMe = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false and sharedWithMe=true",
      fields: 'files(id, name, webViewLink)',
      pageSize: 15,
      orderBy: 'modifiedTime desc',
    });

    console.log(`\n   Carpetas compartidas con la SA (top 15):`);
    if (!sharedWithMe.data.files?.length) {
      console.log('   Ninguna carpeta compartida explícitamente');
    } else {
      sharedWithMe.data.files.forEach(f => {
        console.log(`   📁 ${f.name} → ${f.id}`);
      });
    }
  } catch (err) {
    console.error(`   Error listando archivos: ${err instanceof Error ? err.message : err}`);
  }

  // 6. Summary
  console.log('\n=== RESUMEN DE ACCIONES NECESARIAS ===');
  console.log(`
Para que todo funcione correctamente:

1. Ve a Google Drive (la cuenta donde están los archivos de pacientes)
2. Busca cada carpeta raíz que necesita la app
3. Click derecho → Compartir → Agregar: ${SA_EMAIL}
4. Dale permisos de "Editor"
5. Copia el ID de la carpeta de la URL:
   https://drive.google.com/drive/folders/ESTE_ES_EL_ID
6. Ponlo en .env.local:
   GOOGLE_DRIVE_FOLDER_PACIENTES=el_id_aqui
   GOOGLE_DRIVE_FOLDER_RECEPCION=el_id_aqui
`);
}

main().catch(console.error);
