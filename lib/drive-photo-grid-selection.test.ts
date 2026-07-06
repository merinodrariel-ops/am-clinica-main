import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getContextMenuSelection,
    updatePhotoGridSelection,
    type PhotoGridSelectionInput,
} from './drive-photo-grid-selection';

const orderedIds = ['foto-1', 'foto-2', 'foto-3', 'foto-4', 'foto-5'];

function selectionInput(overrides: Partial<PhotoGridSelectionInput>): PhotoGridSelectionInput {
    return {
        orderedIds,
        selectedIds: [],
        anchorId: null,
        clickedId: 'foto-1',
        additive: false,
        range: false,
        checkbox: false,
        ...overrides,
    };
}

test('cmd or ctrl click toggles a photo and does not open preview', () => {
    const result = updatePhotoGridSelection(selectionInput({
        selectedIds: ['foto-1'],
        clickedId: 'foto-3',
        additive: true,
    }));

    assert.deepEqual(result.selectedIds, ['foto-1', 'foto-3']);
    assert.equal(result.anchorId, 'foto-3');
    assert.equal(result.shouldOpenPreview, false);
});

test('shift click selects a contiguous range from the anchor', () => {
    const result = updatePhotoGridSelection(selectionInput({
        selectedIds: ['foto-2'],
        anchorId: 'foto-2',
        clickedId: 'foto-5',
        range: true,
    }));

    assert.deepEqual(result.selectedIds, ['foto-2', 'foto-3', 'foto-4', 'foto-5']);
    assert.equal(result.anchorId, 'foto-2');
    assert.equal(result.shouldOpenPreview, false);
});

test('plain click opens preview without destroying an existing selection', () => {
    const result = updatePhotoGridSelection(selectionInput({
        selectedIds: ['foto-2', 'foto-4'],
        anchorId: 'foto-2',
        clickedId: 'foto-3',
    }));

    assert.deepEqual(result.selectedIds, ['foto-2', 'foto-4']);
    assert.equal(result.anchorId, 'foto-2');
    assert.equal(result.shouldOpenPreview, true);
});

test('right click on an already selected photo keeps the selected group', () => {
    const result = getContextMenuSelection({
        orderedIds,
        selectedIds: ['foto-2', 'foto-4'],
        clickedId: 'foto-4',
    });

    assert.deepEqual(result.selectedIds, ['foto-2', 'foto-4']);
    assert.equal(result.anchorId, 'foto-4');
});

test('right click on an unselected photo selects only that photo', () => {
    const result = getContextMenuSelection({
        orderedIds,
        selectedIds: ['foto-2', 'foto-4'],
        clickedId: 'foto-5',
    });

    assert.deepEqual(result.selectedIds, ['foto-5']);
    assert.equal(result.anchorId, 'foto-5');
});
