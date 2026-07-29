import type { DriveFile } from '@/app/actions/patient-files-drive';

export function isPhotoStudioSelectionFolder(folderName?: string): boolean {
    if (!folderName) return false;
    return folderName.startsWith('[Selección]') ||
        folderName.includes('Selección') ||
        folderName.includes('Seleccion') ||
        folderName === 'Redes';
}

export function getPendingEditedPhotoIds(
    files: DriveFile[],
    editedFileIds: ReadonlySet<string>
): string[] {
    return files
        .filter(file =>
            file.mimeType.toLowerCase().startsWith('image/') &&
            editedFileIds.has(file.id) &&
            !isPhotoStudioSelectionFolder(file.parentName)
        )
        .map(file => file.id)
        .sort();
}
