export interface PhotoGridSelectionInput {
    orderedIds: string[];
    selectedIds: string[];
    anchorId: string | null;
    clickedId: string;
    additive: boolean;
    range: boolean;
    checkbox: boolean;
}

export interface PhotoGridSelectionResult {
    selectedIds: string[];
    anchorId: string | null;
    shouldOpenPreview: boolean;
}

export interface PhotoGridContextMenuInput {
    orderedIds: string[];
    selectedIds: string[];
    clickedId: string;
}

export interface PhotoGridContextMenuResult {
    selectedIds: string[];
    anchorId: string;
}

function uniqueInOrder(orderedIds: string[], ids: Iterable<string>): string[] {
    const selected = new Set(ids);
    return orderedIds.filter(id => selected.has(id));
}

function selectRange(orderedIds: string[], fromId: string, toId: string): string[] {
    const fromIndex = orderedIds.indexOf(fromId);
    const toIndex = orderedIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return [toId];

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    return orderedIds.slice(start, end + 1);
}

export function updatePhotoGridSelection(input: PhotoGridSelectionInput): PhotoGridSelectionResult {
    const current = new Set(input.selectedIds);

    if (input.range) {
        const anchorId = input.anchorId && input.orderedIds.includes(input.anchorId)
            ? input.anchorId
            : input.clickedId;
        return {
            selectedIds: selectRange(input.orderedIds, anchorId, input.clickedId),
            anchorId,
            shouldOpenPreview: false,
        };
    }

    if (input.additive || input.checkbox) {
        if (current.has(input.clickedId)) current.delete(input.clickedId);
        else current.add(input.clickedId);

        const selectedIds = uniqueInOrder(input.orderedIds, current);
        return {
            selectedIds,
            anchorId: selectedIds.length > 0 ? input.clickedId : null,
            shouldOpenPreview: false,
        };
    }

    return {
        selectedIds: input.selectedIds,
        anchorId: input.anchorId,
        shouldOpenPreview: true,
    };
}

export function getContextMenuSelection(input: PhotoGridContextMenuInput): PhotoGridContextMenuResult {
    const clickedIsSelected = input.selectedIds.includes(input.clickedId);
    return {
        selectedIds: clickedIsSelected
            ? uniqueInOrder(input.orderedIds, input.selectedIds)
            : [input.clickedId],
        anchorId: input.clickedId,
    };
}
