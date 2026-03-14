import { getDriveClient } from '../lib/google-drive.ts';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function moveFolderContents(drive: any, sourceFolderId: string, targetMotherFolderId: string) {
    console.log(`Moving contents of ${sourceFolderId} to variants in ${targetMotherFolderId}...`);
    
    // List source children (subfolders)
    const subfolders = await drive.files.list({
        q: `'${sourceFolderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });

    for (const folder of subfolders.data.files || []) {
        console.log(`  Checking subfolder: ${folder.name} (${folder.id})`);
        
        // Find existing subfolder in target mother by fuzzy name (e.g. "PRESENTACION")
        const type = folder.name.replace(/[\[\]]/g, '').trim();
        const existing = await drive.files.list({
            q: `name contains '${type.split(' ')[0]}' and '${targetMotherFolderId}' in parents and trashed = false`,
            fields: 'files(id, name)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        const targetSubfolderId = existing.data.files?.[0]?.id;

        if (targetSubfolderId && targetSubfolderId !== folder.id) {
            console.log(`    Mergin contents of ${folder.name} into existing ${existing.data.files[0].name} (${targetSubfolderId})`);
            const files = await drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: 'files(id, name)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });
            for (const f of files.data.files || []) {
                console.log(`      Moving file: ${f.name}`);
                await drive.files.update({
                    fileId: f.id,
                    addParents: targetSubfolderId,
                    removeParents: folder.id,
                    supportsAllDrives: true
                });
            }
        } else if (!targetSubfolderId) {
            console.log(`    Moving whole subfolder ${folder.name} to target mother...`);
            await drive.files.update({
                fileId: folder.id,
                addParents: targetMotherFolderId,
                removeParents: sourceFolderId,
                supportsAllDrives: true
            });
        }
    }
}

async function fixPatient(lastname: string, targetMotherId: string, sourceMotherId: string, patientSupabaseId: string) {
    const drive = getDriveClient();
    console.log(`\n=== FIXING ${lastname} ===`);
    
    // 1. Move contents from source to target
    await moveFolderContents(drive, sourceMotherId, targetMotherId);
    
    // 2. Find orphan slides for this lastname
    console.log(`Searching for orphan slides for ${lastname}...`);
    const slides = await drive.files.list({
        q: `name contains '${lastname}' and mimeType = 'application/vnd.google-apps.presentation' and trashed = false`,
        fields: 'files(id, name, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });
    
    // Get target [PRESENTACION] folder
    const targetSub = await drive.files.list({
        q: `name contains 'PRESENTACION' and '${targetMotherId}' in parents and trashed = false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });
    const presentationFolderId = targetSub.data.files?.[0]?.id;

    if (presentationFolderId) {
        for (const s of slides.data.files || []) {
            if (!s.parents?.includes(presentationFolderId)) {
                console.log(`  Moving slide "${s.name}" to ${presentationFolderId}`);
                await drive.files.update({
                    fileId: s.id,
                    addParents: presentationFolderId,
                    removeParents: s.parents?.join(','),
                    supportsAllDrives: true
                });
            }
        }
    }

    // 3. Mark source mother folder as obsolete (since trashing might fail)
    console.log(`Marking folder ${sourceMotherId} as OBSOLETE`);
    try {
        const meta = await drive.files.get({ fileId: sourceMotherId, fields: 'name' });
        await drive.files.update({
            fileId: sourceMotherId,
            requestBody: { name: `[OBSOLETO] ${meta.data.name}` },
            supportsAllDrives: true
        });
    } catch (e) { console.error('Failed to rename source folder', e); }
    
    // 4. Update Supabase with link_historia_clinica to TARGET
    console.log(`Updating Supabase patient ${patientSupabaseId} to point to ${targetMotherId}`);
    await supabase.from('pacientes').update({
        link_historia_clinica: `https://drive.google.com/drive/folders/${targetMotherId}`
    }).eq('id_paciente', patientSupabaseId);
}

async function main() {
    // Maria Eugenia Molina
    await fixPatient('Molina', '14d4REXk0KpIwk3oSJiqj-1XH4Ovgug1J', '1zSoyy9-1b-6AomO4lpOWV0HDFc00Coiu', 'e06ce9fa-b333-466d-8dc8-93663a7ecbed');
    
    // Analia Kobal
    await fixPatient('Kobal', '17JwTp5dkAGaEW6E-AZlGa4hzz9uyBDSm', '1Iq5jhb5P1990e_0vH5H8s3dZKSVeZ-Dm', '37604344-9844-4860-911b-cc951c33beec');
    
    console.log('\nDONE.');
}

main().catch(console.error);
