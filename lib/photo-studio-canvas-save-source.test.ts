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

    const closeStart = source.indexOf('if (isDirty && !confirm');
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
