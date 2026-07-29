import test from 'node:test';
import assert from 'node:assert/strict';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { getPendingEditedPhotoIds } from './photo-studio-selection-reconciliation';

function file(id: string, parentName: string, mimeType = 'image/jpeg'): DriveFile {
    return {
        id,
        name: `${id}.jpg`,
        mimeType,
        parentName,
        webViewLink: `https://drive.google.com/open?id=${id}`,
        createdTime: '2026-07-28T12:00:00.000Z',
    };
}

test('reconciles only explicitly edited images outside Selección', () => {
    const files = [
        file('edited-in-fotos', '[FOTOS] ROMINA, Dávila'),
        file('edited-in-selection', '[Selección] ROMINA, Dávila'),
        file('unedited-in-fotos', '[FOTOS] ROMINA, Dávila'),
        file('edited-non-image', '[DOCUMENTOS] ROMINA, Dávila', 'application/pdf'),
    ];

    const pending = getPendingEditedPhotoIds(
        files,
        new Set(['edited-in-fotos', 'edited-in-selection', 'edited-non-image'])
    );

    assert.deepEqual(pending, ['edited-in-fotos']);
});

test('recognizes legacy Redes and unaccented Seleccion folder names', () => {
    const pending = getPendingEditedPhotoIds(
        [
            file('redes', 'Redes'),
            file('seleccion', '[Seleccion] ROMINA, Dávila'),
        ],
        new Set(['redes', 'seleccion'])
    );

    assert.deepEqual(pending, []);
});
