import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getBatchActionTargetIds,
    updatePhotoGridSelection,
    type PhotoGridSelectionInput,
} from './drive-photo-selection';

const orderedPhotoIds = ['foto-1', 'foto-2', 'foto-3', 'foto-4', 'foto-5'];

function input(overrides: Partial<PhotoGridSelectionInput>): PhotoGridSelectionInput {
    return {
        orderedIds: orderedPhotoIds,
        selectedIds: [],
        anchorId: null,
        clickedId: 'foto-1',
        additive: false,
        range: false,
        checkbox: false,
        ...overrides,
    };
}

test('cmd or ctrl click toggles individual photos without opening preview', () => {
    const selected = updatePhotoGridSelection(input({
        selectedIds: ['foto-1'],
        clickedId: 'foto-3',
        additive: true,
    }));

    assert.deepEqual(selected.selectedIds, ['foto-1', 'foto-3']);
    assert.equal(selected.anchorId, 'foto-3');
    assert.equal(selected.shouldOpenPreview, false);
});

test('shift click selects the range from the last selection anchor', () => {
    const selected = updatePhotoGridSelection(input({
        selectedIds: ['foto-2'],
        anchorId: 'foto-2',
        clickedId: 'foto-5',
        range: true,
    }));

    assert.deepEqual(selected.selectedIds, ['foto-2', 'foto-3', 'foto-4', 'foto-5']);
    assert.equal(selected.anchorId, 'foto-2');
    assert.equal(selected.shouldOpenPreview, false);
});

test('plain click opens preview and preserves the current batch selection', () => {
    const selected = updatePhotoGridSelection(input({
        selectedIds: ['foto-2', 'foto-4'],
        anchorId: 'foto-2',
        clickedId: 'foto-3',
    }));

    assert.deepEqual(selected.selectedIds, ['foto-2', 'foto-4']);
    assert.equal(selected.anchorId, 'foto-2');
    assert.equal(selected.shouldOpenPreview, true);
});

test('checkbox click removes the last selected photo and clears the anchor', () => {
    const selected = updatePhotoGridSelection(input({
        selectedIds: ['foto-4'],
        anchorId: 'foto-4',
        clickedId: 'foto-4',
        checkbox: true,
    }));

    assert.deepEqual(selected.selectedIds, []);
    assert.equal(selected.anchorId, null);
    assert.equal(selected.shouldOpenPreview, false);
});

test('batch action uses selected ids first and falls back to the clicked photo', () => {
    assert.deepEqual(getBatchActionTargetIds(['foto-1', 'foto-4'], 'foto-2'), ['foto-1', 'foto-4']);
    assert.deepEqual(getBatchActionTargetIds([], 'foto-2'), ['foto-2']);
});
