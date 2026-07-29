import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');

test('Photo Studio sends selected photos and canvases to the direct web publisher', () => {
    assert.match(source, /import PublicCasePublishModal from '\.\/PublicCasePublishModal';/);
    assert.match(source, /async function handlePrepareMixedCasePublish\(\)/);
    assert.match(source, /const selectedPhotos = imageFiles\.filter\(item => selectedIds\.has\(item\.id\)\)/);
    assert.match(source, /const selectedCanvases = canvases\.filter\(canvas => selectedCanvasIds\.includes\(canvas\.id\)\)/);
    assert.match(source, /setPublicCaseFiles\(\[\.\.\.selectedPhotos, \.\.\.canvasFiles\]\)/);
    assert.match(source, /<PublicCasePublishModal[\s\S]*files=\{publicCaseFiles\}/);
});

test('the Photo Studio web action does not download WebP files', () => {
    assert.doesNotMatch(source, /handleWebDownload/);
    assert.doesNotMatch(source, /descargada'} para web/);
});

test('mixed selection is preserved when choosing photos and canvases', () => {
    const photoSelect = source.slice(
        source.indexOf('function handleThumbnailSelect'),
        source.indexOf('function handleMouseDown'),
    );
    const canvasSelect = source.slice(
        source.indexOf('function handleCanvasThumbnailSelect'),
        source.indexOf('function openCanvasThumbnailContextMenu'),
    );
    assert.doesNotMatch(photoSelect, /setSelectedCanvasIds\(\[\]\)/);
    assert.doesNotMatch(canvasSelect, /clearMultiSelection\(\)/);
});

const publisherSource = readFileSync('components/patients/drive/PublicCasePublishModal.tsx', 'utf8');

test('the publisher opens the case-writing assistant before explicit publication', () => {
    assert.match(publisherSource, /fetch\('\/api\/clinical-cases\/assistant'/);
    assert.match(publisherSource, /El asistente completa español e inglés; nada se publica hasta que pulses Publicar ahora/);
    assert.match(publisherSource, /fetch\('\/api\/clinical-cases'/);
});

test('the pre-publication dashboard supports ordered photos and Drive metadata sync', () => {
    assert.match(publisherSource, /Orden de publicación/);
    assert.match(publisherSource, /draggable/);
    assert.match(publisherSource, /onDrop=\{\(\) => reorderPhotos\(file\.id\)\}/);
    assert.match(publisherSource, /Mejorar metadata y renombrar en Drive/);
    assert.match(publisherSource, /renameDriveFileAction\(file\.id, newName\)/);
    assert.doesNotMatch(publisherSource, /Relato largo para repartir/);
});

test('case publication targets the bilingual before-after galleries', () => {
    const routeSource = readFileSync('app/api/clinical-cases/route.ts', 'utf8');
    const assistantSource = readFileSync('app/api/clinical-cases/assistant/route.ts', 'utf8');
    assert.match(routeSource, /publicUrl: 'https:\/\/www\.amesteticadental\.com\/casos-antes-y-despues'/);
    assert.match(routeSource, /englishUrl: 'https:\/\/www\.amesteticadental\.com\/en\/before-after'/);
    assert.match(routeSource, /translations: \{/);
    assert.match(assistantSource, /titleEn/);
    assert.match(assistantSource, /photoDescriptionsEn/);
    assert.match(publisherSource, /translation: \{ title: nextTitleEn, description: nextDescriptionEn \}/);
});
