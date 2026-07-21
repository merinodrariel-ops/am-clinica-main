import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');

test('removed-background canvas layers stay local until the user explicitly saves', () => {
    assert.doesNotMatch(source, /Guardando recorte en Drive/);
    assert.match(source, /Fondo de capa eliminado\. Se guardará solamente cuando guardes el lienzo/);
    assert.match(source, /materializeCanvasLayersForSave\(activeCanvas\)/);
    assert.match(source, /uploadCanvasLayerAssetAction/);
});

test('edited outputs in the bottom rail drag by Drive id instead of their thumbnail pixels', () => {
    assert.match(
        source,
        /editedOutputFiles\.map[\s\S]*?draggable[\s\S]*?preparePhotoStudioCanvasDrag\(event\.dataTransfer, editedFile\.id\)/,
    );
    assert.match(
        source,
        /src=\{editedFile\.thumbnailLink\}[\s\S]*?draggable=\{false\}[\s\S]*?pointer-events-none/,
    );
});
