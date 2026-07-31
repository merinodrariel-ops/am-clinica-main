import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');

test('canvas status stays saving while the debounced write is pending', () => {
    const scheduling = source.indexOf('setCanvasSaving(true);', source.indexOf('// ── Auto-save active canvas'));
    const timeout = source.indexOf('saveTimerRef.current = setTimeout', scheduling);
    assert.ok(scheduling > -1);
    assert.ok(timeout > scheduling);
});

test('closing and switching canvases flush the exact active document', () => {
    assert.ok(source.includes('async function persistCanvasDocument'));
    const switchStart = source.indexOf('async function handleActivateCanvas');
    const switchEnd = source.indexOf('function handleCanvasThumbnailSelect', switchStart);
    assert.ok(source.slice(switchStart, switchEnd).includes('await persistCanvasDocument(activeCanvas)'));

    const closeStart = source.lastIndexOf('onClick={async () => {', source.indexOf('await flushPhotoStateSave();'));
    const closeEnd = source.indexOf('className=', closeStart);
    const closeHandler = source.slice(closeStart, closeEnd);
    assert.ok(closeHandler.includes('await flushPhotoStateSave()'));
    assert.ok(closeHandler.includes('await persistCanvasDocument(activeCanvas)'));
    assert.ok(closeHandler.includes('onClose()'));
});

test('manual export reuses the same durable canvas persistence path', () => {
    const saveStart = source.indexOf('async function handleSaveToDrive');
    const saveEnd = source.indexOf('if (!file || !activeFile)', saveStart);
    assert.ok(source.slice(saveStart, saveEnd).includes(
        'canvasLayersForSave = await persistCanvasDocument(activeCanvas)',
    ));
});

test('photo save materializes active crop and background edits before export', () => {
    const saveStart = source.indexOf('async function handleSaveToDrive');
    const saveEnd = source.indexOf('if (!file || !activeFile)', saveStart);
    const saveBlock = source.slice(saveStart, saveEnd);

    assert.match(saveBlock, /croppedUrl = await handleConfirmCrop\(\)/);
    assert.match(saveBlock, /photoSourceUrl = await handleConfirmBg\(\)/);
    assert.match(saveBlock, /exportToBlob\(photoSourceUrl, photoExportRotation\)/);
});

test('background confirmation exports the edited pixel canvas, not the stale image URL', () => {
    const confirmStart = source.indexOf('async function handleConfirmBg');
    const confirmEnd = source.indexOf('function handleUndoBgRemoval', confirmStart);
    const confirmBlock = source.slice(confirmStart, confirmEnd);

    assert.match(confirmBlock, /const editedCanvas = offscreenCanvasRef\.current/);
    assert.match(confirmBlock, /ctx\.drawImage\(editedCanvas \?\? img!/);
    assert.match(confirmBlock, /return newUrl/);
});
