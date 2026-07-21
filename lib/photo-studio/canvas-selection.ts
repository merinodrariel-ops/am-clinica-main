export function updateCanvasDocumentSelection(params: {
    selectedIds: Iterable<string>;
    orderedIds: string[];
    clickedId: string;
    anchorId: string | null;
    additive: boolean;
    range: boolean;
}): string[] {
    const { orderedIds, clickedId, anchorId, additive, range } = params;
    const selected = new Set(params.selectedIds);

    if (range && anchorId) {
        const anchorIndex = orderedIds.indexOf(anchorId);
        const clickedIndex = orderedIds.indexOf(clickedId);
        if (anchorIndex !== -1 && clickedIndex !== -1) {
            const start = Math.min(anchorIndex, clickedIndex);
            const end = Math.max(anchorIndex, clickedIndex);
            orderedIds.slice(start, end + 1).forEach(id => selected.add(id));
            return orderedIds.filter(id => selected.has(id));
        }
    }

    if (additive) {
        if (selected.has(clickedId)) selected.delete(clickedId);
        else selected.add(clickedId);
        return orderedIds.filter(id => selected.has(id));
    }

    return [clickedId];
}

export function getCanvasDocumentContextTargets(
    selectedIds: Iterable<string>,
    clickedId: string,
): string[] {
    const selected = Array.from(selectedIds);
    return selected.includes(clickedId) ? selected : [clickedId];
}

export function getCanvasCopyName(name: string): string {
    return `${name.trim() || 'Lienzo'} copia`;
}
