import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');
const fabricCanvasStageSource = readFileSync('components/patients/drive/FabricCanvasStage.tsx', 'utf8');
const canvasActionSource = readFileSync('app/actions/patient-canvases.ts', 'utf8');

test('canvas status stays saving while the debounced write is pending', () => {
    const scheduling = source.indexOf('setCanvasSaving(true);', source.indexOf('// ── Auto-save active canvas'));
    const timeout = source.indexOf('saveTimerRef.current = setTimeout', scheduling);
    assert.ok(scheduling > -1);
    assert.ok(timeout > scheduling);
});

test('canvas autosave reports persistence errors instead of failing silently', () => {
    const autosaveStart = source.indexOf('// ── Auto-save active canvas');
    const autosaveEnd = source.indexOf('const [canvasSelectedId', autosaveStart);
    const autosaveBlock = source.slice(autosaveStart, autosaveEnd);

    assert.match(autosaveBlock, /if \(result\.error\) throw new Error\(result\.error\)/);
    assert.match(autosaveBlock, /No se pudo guardar el lienzo editable/);
});

test('new canvas creation never falls back to a disposable local document', () => {
    const createStart = source.indexOf('async function handleNewCanvas');
    const createEnd = source.indexOf('async function handleDeleteCanvasDocuments', createStart);
    const createBlock = source.slice(createStart, createEnd);

    assert.doesNotMatch(createBlock, /temp-/);
    assert.match(createBlock, /No se pudo crear un lienzo guardable/);
});

test('canvas save rejects an update that matched no persisted document', () => {
    const saveStart = canvasActionSource.indexOf('export async function savePatientCanvasAction');
    const saveEnd = canvasActionSource.indexOf('/** Delete a canvas */', saveStart);
    const saveBlock = canvasActionSource.slice(saveStart, saveEnd);

    assert.match(saveBlock, /\.select\('id'\)/);
    assert.match(saveBlock, /if \(!data\)/);
    assert.match(saveBlock, /El lienzo ya no existe/);
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

test('black background confirmation uses absolute black pixels', () => {
    const confirmStart = source.indexOf('async function handleConfirmBg');
    const confirmEnd = source.indexOf('function handleUndoBgRemoval', confirmStart);
    const confirmBlock = source.slice(confirmStart, confirmEnd);

    assert.match(confirmBlock, /bgColor === 'white' \? '#ffffff' : '#000000'/);
    assert.doesNotMatch(confirmBlock, /#111111/);
});

test('fabric canvas stage renders black canvas backgrounds as absolute black', () => {
    assert.match(fabricCanvasStageSource, /bgColor === 'black' \? '#000000' : bgColor/);
    assert.doesNotMatch(fabricCanvasStageSource, /bgColor === 'black' \? '#111111' : bgColor/);
});
