import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
    join(process.cwd(), 'components/patients/drive/PhotoStudioModal.tsx'),
    'utf8'
);

test('photo studio thumbnail reorder persists the first photo as cover', () => {
    assert.doesNotMatch(
        source,
        /saveFotosOrderAction\(patientId,\s*folderId,\s*nextOrder\)/,
        'Photo Studio must not save thumbnail order without coverFileId'
    );
    assert.match(
        source,
        /saveFotosOrderAction\(patientId,\s*folderId,\s*orderToSave,\s*coverFileId\)/,
        'Photo Studio should persist the first thumbnail id as foto_perfil_url'
    );
    assert.match(
        source,
        /onSaved\(\{\s*silent:\s*true,\s*coverFileId:/,
        'Photo Studio should report the saved cover back to the patient file grid'
    );
});

test('photo studio thumbnail reorder refreshes the parent grid after saving', () => {
    assert.match(
        source,
        /onSaved\(\{\s*silent:\s*true\s*\}\)/,
        'Photo Studio should refresh PatientDriveTab after order changes so the cover badge is reflected'
    );
});

test('clean active photos are materialized before opening AirDrop', () => {
    assert.match(
        source,
        /if \(!isDirty && !canvasActive\) \{[\s\S]*?driveFileId: targetFile\.id,[\s\S]*?file: await fetchOriginalAsFile\(targetFile\)/,
        'The active original must include a File because navigator.share cannot use a Drive id'
    );
});
