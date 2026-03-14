import { getDriveClient } from '../lib/google-drive.ts';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const PACIENTES_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

async function consolidatePatient(lastname: string, firstname: string, variants: string[]) {
    const drive = getDriveClient();
    console.log(`\n--- Consolidating Patient: ${lastname}, ${firstname} ---`);

    const allFolders: any[] = [];
    for (const v of variants) {
        const res = await drive.files.list({
            q: `name contains '${v}' and mimeType = 'application/vnd.google-apps.folder' and '${PACIENTES_ROOT_FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name, parents)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });
        allFolders.push(...(res.data.files || []));
    }

    // Deduplicate folders by ID
    const uniqueFolders = Array.from(new Map(allFolders.map(f => [f.id, f])).values());
    console.log(`Found ${uniqueFolders.length} potential mother folders:`);
    uniqueFolders.forEach(f => console.log(`- ${f.name} (${f.id})`));

    if (uniqueFolders.length === 0) {
        console.log('No folders found.');
        return;
    }

    // Pick canonical (the one matching the app format: UPPERCASE LASTNAME, Proper Name)
    const canonicalName = `${lastname.toUpperCase()}, ${firstname.charAt(0).toUpperCase() + firstname.slice(1).toLowerCase()}`;
    let canonical = uniqueFolders.find(f => f.name === canonicalName);
    
    if (!canonical) {
        canonical = uniqueFolders[0]; // Fallback to first one
        console.log(`Canonical format not found exactly. Using ${canonical.name} as base.`);
    } else {
        console.log(`Canonical folder identified: ${canonical.name} (${canonical.id})`);
    }

    // For each other folder, move its children (subfolders) to canonical
    for (const folder of uniqueFolders) {
        if (folder.id === canonical.id) continue;
        console.log(`Merging ${folder.name} into ${canonical.id}...`);

        const children = await drive.files.list({
            q: `'${folder.id}' in parents and trashed = false`,
            fields: 'files(id, name)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        for (const child of children.data.files || []) {
            console.log(`  Moving ${child.name} to canonical...`);
            // Check if canonical already has a folder with same name
            const existing = await drive.files.list({
                q: `name = '${child.name.replace(/'/g, "\\'")}' and '${canonical.id}' in parents and trashed = false`,
                fields: 'files(id)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });

            if (existing.data.files?.[0]) {
                console.log(`  Target folder already has "${child.name}". Merging sub-sub-folders...`);
                // Move contents of child to existing
                const subChildren = await drive.files.list({
                    q: `'${child.id}' in parents and trashed = false`,
                    fields: 'files(id, name)',
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                });
                for (const sub of subChildren.data.files || []) {
                    await drive.files.update({
                        fileId: sub.id!,
                        addParents: existing.data.files[0].id!,
                        removeParents: child.id!,
                        supportsAllDrives: true
                    });
                }
                // Trash the empty sub-sub-folder
                await drive.files.update({ fileId: child.id!, requestBody: { trashed: true }, supportsAllDrives: true });
            } else {
                // Move child to canonical
                await drive.files.update({
                    fileId: child.id!,
                    addParents: canonical.id!,
                    removeParents: folder.id!,
                    supportsAllDrives: true
                });
            }
        }

        // Trash the now-empty extra mother folder
        console.log(`Trashing empty folder ${folder.name}...`);
        await drive.files.update({ fileId: folder.id!, requestBody: { trashed: true }, supportsAllDrives: true });
    }

    // NOW: Look for ORPHAN Slides in the Root
    console.log(`Searching for orphan Slides for ${lastname}...`);
    const orphans = await drive.files.list({
        // Search in Root (no parents or parent is My Drive or PACIENTES_ROOT)
        // Actually search generically
        q: `name contains '${lastname}' and mimeType = 'application/vnd.google-apps.presentation' and trashed = false`,
        fields: 'files(id, name, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });

    // Ensure [PRESENTACION] subfolder exists in canonical
    const subfolders = await drive.files.list({
        q: `name contains 'PRESENTACION' and '${canonical.id}' in parents and trashed = false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });
    let presentationFolderId = subfolders.data.files?.[0]?.id;

    if (!presentationFolderId) {
        console.log('Creating [PRESENTACION] folder in canonical...');
        const res = await drive.files.create({
            requestBody: {
                name: `[PRESENTACION] ${canonical.name}`,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [canonical.id!]
            },
            fields: 'id',
            supportsAllDrives: true
        });
        presentationFolderId = res.data.id!;
    }

    for (const orphan of orphans.data.files || []) {
        // If it's already in the presentation folder, skip
        if (orphan.parents?.includes(presentationFolderId!)) continue;
        
        console.log(`Moving orphan slide "${orphan.name}" (${orphan.id}) to [PRESENTACION] folder...`);
        const currentParents = orphan.parents?.join(',');
        await drive.files.update({
            fileId: orphan.id!,
            addParents: presentationFolderId!,
            removeParents: currentParents || undefined,
            supportsAllDrives: true
        });
    }
}

async function main() {
    // Maria Eugenia Molina
    await consolidatePatient('Molina', 'Maria Eugenia', ['Molina', 'Eugenia']);
    
    // Analia Kobal
    await consolidatePatient('Kobal', 'Analia', ['Kobal', 'Analia', 'Ana Lia']);
}

main().catch(console.error);
