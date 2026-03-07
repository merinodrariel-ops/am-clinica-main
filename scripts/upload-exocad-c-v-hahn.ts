
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import {
    ensureStandardPatientFolders,
    getDriveClient,
    listFolderFiles
} from '../lib/google-drive';
import { Readable } from 'stream';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const patientId = '54223681-2a97-49d9-8453-4284d624f0d2';
    const filePath = '/Users/am/Downloads/Hahn,Carolina.html';

    console.log(`Checking patient ${patientId}...`);
    const { data: patient, error: pError } = await supabase
        .from('pacientes')
        .select('nombre, apellido, link_historia_clinica')
        .eq('id_paciente', patientId)
        .single();

    if (pError || !patient) {
        console.error('Patient not found:', pError);
        return;
    }

    console.log(`Patient: ${patient.nombre} ${patient.apellido}`);

    // 1. Ensure folders exist
    console.log('Ensuring Google Drive folders exist...');
    const folderResult = await ensureStandardPatientFolders(
        patient.apellido,
        patient.nombre,
        patient.link_historia_clinica || undefined
    );

    if (folderResult.error) {
        console.error('Error ensuring folders:', folderResult.error);
        return;
    }

    const motherFolderId = folderResult.motherFolderId!;
    console.log(`Mother folder ID: ${motherFolderId}`);

    // 2. Find [PRESENTACION] folder
    const drive = getDriveClient();
    const subfolders = await drive.files.list({
        q: `'${motherFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
    });

    const presentacionFolder = subfolders.data.files?.find(f => f.name?.includes('PRESENTACION'));

    if (!presentacionFolder) {
        console.error('PRESENTACION folder not found');
        return;
    }

    const targetFolderId = presentacionFolder.id!;
    console.log(`Target folder [PRESENTACION]: ${targetFolderId}`);

    // 3. Upload the file
    console.log(`Uploading ${filePath}...`);
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const response = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
            name: fileName,
            parents: [targetFolderId],
            mimeType: 'text/html',
        },
        media: {
            mimeType: 'text/html',
            body: Readable.from(fileContent),
        },
        fields: 'id, webViewLink',
    });

    console.log(`File uploaded successfully! ID: ${response.data.id}`);
    console.log(`View Link: ${response.data.webViewLink}`);

    // 4. Update Supabase if needed
    if (!patient.link_historia_clinica && folderResult.motherFolderUrl) {
        await supabase
            .from('pacientes')
            .update({ link_historia_clinica: folderResult.motherFolderUrl })
            .eq('id_paciente', patientId);
        console.log('Updated patient link_historia_clinica in Supabase');
    }
}

run().catch(console.error);
