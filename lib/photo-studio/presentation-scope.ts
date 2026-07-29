import { isPhotoStudioSelectionFolder } from '@/lib/photo-studio-selection-reconciliation';

export type PhotoStudioPresentationScope = 'library' | 'selection';

export function getPhotoStudioPresentationScope(input: {
    activeParentName?: string;
    canvasActive?: boolean;
}): PhotoStudioPresentationScope {
    return input.canvasActive || isPhotoStudioSelectionFolder(input.activeParentName)
        ? 'selection'
        : 'library';
}

export function getPhotoStudioPresentationPhotoIds(
    files: Array<{ id: string; parentName?: string }>,
    scope: PhotoStudioPresentationScope
): string[] {
    return files
        .filter(file => scope === 'library' || isPhotoStudioSelectionFolder(file.parentName))
        .map(file => file.id);
}
