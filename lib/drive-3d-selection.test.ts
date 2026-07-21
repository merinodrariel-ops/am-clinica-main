import assert from 'node:assert/strict';
import test from 'node:test';
import { toggle3DSelection, canOpenPair, resolveSelectionPair, MAX_3D_SELECTION } from './drive-3d-selection';

test('selects up to two models', () => {
    let sel: string[] = [];
    sel = toggle3DSelection(sel, 'a');
    assert.deepEqual(sel, ['a']);
    sel = toggle3DSelection(sel, 'b');
    assert.deepEqual(sel, ['a', 'b']);
});

test('toggling an already-selected model deselects it', () => {
    const sel = toggle3DSelection(['a', 'b'], 'a');
    assert.deepEqual(sel, ['b']);
});

test('selecting a third drops the oldest (FIFO)', () => {
    const sel = toggle3DSelection(['a', 'b'], 'c');
    assert.deepEqual(sel, ['b', 'c']);
});

test('canOpenPair only when exactly two are selected', () => {
    assert.equal(canOpenPair([]), false);
    assert.equal(canOpenPair(['a']), false);
    assert.equal(canOpenPair(['a', 'b']), true);
});

test('resolveSelectionPair returns the two files in selection order', () => {
    const files = [{ id: 'a', name: 'sup' }, { id: 'b', name: 'inf' }, { id: 'c', name: 'x' }];
    const pair = resolveSelectionPair(['b', 'a'], files);
    assert.deepEqual(pair, [{ id: 'b', name: 'inf' }, { id: 'a', name: 'sup' }]);
});

test('resolveSelectionPair returns null if a file is missing or count wrong', () => {
    const files = [{ id: 'a', name: 'sup' }];
    assert.equal(resolveSelectionPair(['a'], files), null);
    assert.equal(resolveSelectionPair(['a', 'z'], files), null);
});

test('MAX is two', () => {
    assert.equal(MAX_3D_SELECTION, 2);
});
