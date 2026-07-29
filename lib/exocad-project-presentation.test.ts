import test from 'node:test';
import assert from 'node:assert/strict';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { buildExocadProjectPresentations } from './exocad-project-presentation';

function driveFile(overrides: Partial<DriveFile> & Pick<DriveFile, 'id' | 'name' | 'mimeType'>): DriveFile {
    return {
        webViewLink: `https://drive.google.com/open?id=${overrides.id}`,
        createdTime: '2026-07-28T12:00:00.000Z',
        ...overrides,
    };
}

test('uses the clinic display name without renaming the technical project file', () => {
    const project = driveFile({
        id: 'project-1',
        name: 'ab19f3.dentalproject',
        mimeType: 'application/octet-stream',
        relativePath: 'Caso 1/ab19f3.dentalproject',
        appProperties: { amClinicExocadDisplayName: 'Ariel Merino — Encerado' },
    });

    const [presentation] = buildExocadProjectPresentations([project]);
    assert.equal(presentation.displayName, 'Ariel Merino — Encerado');
    assert.equal(presentation.project.name, 'ab19f3.dentalproject');
});

test('pairs HTML and JPG previews by project folder and filename tokens', () => {
    const project = driveFile({
        id: 'project-2',
        name: 'caso-ariel-encerado.dentalproject',
        mimeType: 'application/octet-stream',
        relativePath: 'Caso Ariel/caso-ariel-encerado.dentalproject',
    });
    const html = driveFile({
        id: 'html-2',
        name: 'caso-ariel-encerado.html',
        mimeType: 'text/html',
        relativePath: 'Caso Ariel/HTML/caso-ariel-encerado.html',
    });
    const image = driveFile({
        id: 'image-2',
        name: 'caso-ariel-encerado.jpg',
        mimeType: 'image/jpeg',
        relativePath: 'Caso Ariel/caso-ariel-encerado.jpg',
    });
    const unrelatedImage = driveFile({
        id: 'image-other',
        name: 'fotografia-frente.jpg',
        mimeType: 'image/jpeg',
        relativePath: 'FOTOS/fotografia-frente.jpg',
    });

    const [presentation] = buildExocadProjectPresentations([project, html, image, unrelatedImage]);
    assert.equal(presentation.htmlPreview?.id, html.id);
    assert.equal(presentation.imagePreview?.id, image.id);
});

test('does not attach an unrelated patient photo as a project preview', () => {
    const project = driveFile({
        id: 'project-3',
        name: '8f31ca.dentalproject',
        mimeType: 'application/octet-stream',
        relativePath: 'EXOCAD/8f31ca.dentalproject',
    });
    const photo = driveFile({
        id: 'photo-3',
        name: 'sonrisa-frente.jpg',
        mimeType: 'image/jpeg',
        relativePath: 'FOTOS/sonrisa-frente.jpg',
    });

    const [presentation] = buildExocadProjectPresentations([project, photo]);
    assert.equal(presentation.imagePreview, undefined);
});
