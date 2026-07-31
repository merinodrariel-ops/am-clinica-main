import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/patients/drive/PhotoStudioModal.tsx', import.meta.url),
    'utf8',
);

test('Cmd/Ctrl+Z always uses the global editor history', () => {
    const shortcutBlock = source.slice(
        source.indexOf('// Keyboard shortcut: Cmd/Ctrl+Z'),
        source.indexOf('// Keyboard shortcut: Cmd+C'),
    );

    assert.match(shortcutBlock, /handleUndo\(\)/);
    assert.doesNotMatch(shortcutBlock, /handleUndoLastDrawPoint\(\)/);
    assert.match(shortcutBlock, /\['range', 'checkbox', 'radio', 'button', 'color'\]\.includes\(input\.type\)/);
});

test('horizontal wheel movement pans instead of zooming', () => {
    const wheelBlock = source.slice(
        source.indexOf('const wheelHandler = (e: WheelEvent)'),
        source.indexOf('// Non-passive touch handlers'),
    );

    assert.match(wheelBlock, /Math\.abs\(e\.deltaX\) > Math\.abs\(e\.deltaY\)/);
    assert.match(wheelBlock, /e\.shiftKey/);
    assert.match(wheelBlock, /setPanX/);
    assert.match(wheelBlock, /if \(horizontalDelta !== 0\)/);
});

test('photo snapshots preserve pixel edits, adjustments, drawings, and text together', () => {
    const captureBlock = source.slice(
        source.indexOf('function capturePhotoSnapshot'),
        source.indexOf('function pushHistory'),
    );

    for (const field of [
        'imageUrl',
        'rotation',
        'brightness',
        'bgDone',
        'bgColor',
        'hasTransparentBg',
        'drawShapes',
        'currentPoints',
        'textAnnotations',
    ]) {
        assert.match(captureBlock, new RegExp(`\\b${field}\\b`));
    }
});

test('undo and redo restore drawings and text as part of the same snapshot', () => {
    const undoRedoBlock = source.slice(
        source.indexOf('function handleUndo'),
        source.indexOf('async function handleRemoveBg'),
    );

    assert.equal(
        undoRedoBlock.match(/setDrawShapes\(structuredClone\(snap\.drawShapes\)\)/g)?.length,
        2,
    );
    assert.equal(
        undoRedoBlock.match(/setTextAnnotations\(structuredClone\(snap\.textAnnotations\)\)/g)?.length,
        2,
    );
});
