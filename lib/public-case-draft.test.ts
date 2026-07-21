import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrivePhotoFileName, buildPublicCaseDraft, slugifyCaseTitle, splitLongPhotoDescription } from './public-case-draft';

test('slugifyCaseTitle creates a stable SEO slug', () => {
    assert.equal(
        slugifyCaseTitle('Christensen, Victoria - Gingivectomía Láser + Micro Diseño'),
        'christensen-victoria-gingivectomia-laser-micro-diseno'
    );
});

test('buildPublicCaseDraft preserves photo order and per-photo descriptions', () => {
    const draft = buildPublicCaseDraft({
        patientName: 'Christensen, Victoria',
        title: 'Christensen Victoria - gingivectomía láser y microdiseño',
        caseDescription: 'Caso con gingivectomía láser, limpieza y microdiseño en resina.',
        photos: [
            {
                id: 'drive-1',
                name: 'foto-antes.jpg',
                description: 'Foto intraoral del antes',
            },
            {
                id: 'drive-2',
                name: 'foto-laser.jpg',
                description: 'Maxilar superior con láser contorneando la encía',
            },
        ],
    });

    assert.equal(draft.slug, 'christensen-victoria-gingivectomia-laser-y-microdiseno');
    assert.equal(draft.photoCount, 2);
    assert.equal(draft.photos[0].order, 1);
    assert.equal(draft.photos[0].fileName, '01-foto-intraoral-del-antes.jpg');
    assert.equal(draft.photos[0].caption, 'Foto intraoral del antes');
    assert.equal(draft.photos[1].order, 2);
    assert.equal(draft.photos[1].caption, 'Maxilar superior con láser contorneando la encía');
    assert.equal(draft.photos[1].driveDownloadPath, '/api/drive/file/drive-2');
    assert.match(draft.photos[0].cloudinaryPendingPath, /^casos\/christensen-victoria/);
    assert.match(draft.caseTsSnippet, /fotos: \[/);
    assert.match(draft.caseTsSnippet, /Foto intraoral del antes/);
});

test('buildDrivePhotoFileName preserves extension and prefixes order', () => {
    assert.equal(
        buildDrivePhotoFileName(12, 'Antes y después final con gingivectomía', 'Diapositiva 62.PNG'),
        '12-antes-y-despues-final-con-gingivectomia.PNG'
    );
});

test('splitLongPhotoDescription maps a long clinical narration to photo slots', () => {
    const descriptions = splitLongPhotoDescription(
        'La foto 1 es una foto intraoral del antes. La foto 2 es sin gingivectomía láser. La foto doce es el antes y después final.',
        12
    );

    assert.equal(descriptions[0], 'La foto 1 es una foto intraoral del antes.');
    assert.equal(descriptions[1], 'La foto 2 es sin gingivectomía láser.');
    assert.equal(descriptions[11], 'La foto doce es el antes y después final.');
});

test('splitLongPhotoDescription handles numbered lines after the first photo marker', () => {
    const descriptions = splitLongPhotoDescription(
        [
            'Foto 1: foto intraoral del antes.',
            '2. Sin gingivectomía láser y sin limpieza.',
            '3) Maxilar superior con mitad de gingivectomía y mitad sin gingivectomía.',
            '4: Labios en sonrisa del antes.',
        ].join('\n'),
        4
    );

    assert.equal(descriptions[0], 'Foto 1: foto intraoral del antes.');
    assert.equal(descriptions[1], '2. Sin gingivectomía láser y sin limpieza.');
    assert.equal(descriptions[2], '3) Maxilar superior con mitad de gingivectomía y mitad sin gingivectomía.');
    assert.equal(descriptions[3], '4: Labios en sonrisa del antes.');
});
