import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentPhotoSave, normalizeFileEditState, serializeFileEditState } from './photo-studio/edit-state';

test('saving a previous photo cannot mark the newly selected photo as saved', () => {
    const edited = normalizeFileEditState({ brightness: 135, rotation: 450 });
    assert.equal(edited.rotation, 90);
    assert.equal(isCurrentPhotoSave('before', edited, 'after', edited), false);
    assert.equal(isCurrentPhotoSave('before', edited, null, edited), false);
});

test('an edit made while saving stays dirty until that exact revision is saved', () => {
    const sent = normalizeFileEditState({ brightness: 120 });
    const latest = normalizeFileEditState({ brightness: 140 });
    assert.equal(isCurrentPhotoSave('photo', sent, 'photo', latest), false);
    assert.equal(isCurrentPhotoSave('photo', latest, 'photo', latest), true);
});

test('editing, serializing and restoring retains drawings and text with adjustments', () => {
    const state = normalizeFileEditState({
        rotation: -450,
        brightness: 87,
        drawShapes: [{ id: 'shape', color: 'cyan', closed: false, points: [{ x: 0.1, y: 0.4, smooth: true }] }],
        textAnnotations: [{ id: 'label', text: 'Antes', x: 0.1, y: 0.2, color: 'white', width: 0.5, fontSize: 24, align: 'center' }],
    });
    const restored = normalizeFileEditState(JSON.parse(serializeFileEditState(state)));
    assert.deepEqual(restored, state);
    const changedText = structuredClone(restored);
    changedText.textAnnotations[0].text = 'Después';
    assert.equal(isCurrentPhotoSave('photo', state, 'photo', changedText), false);
    assert.equal(state.textAnnotations[0].text, 'Antes');
});
