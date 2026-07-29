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
    assert.match(publisherSource, /El asistente completa el borrador; nada se publica hasta que pulses Publicar ahora/);
    assert.match(publisherSource, /fetch\('\/api\/clinical-cases'/);
});
