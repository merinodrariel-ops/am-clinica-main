export type DriveImageInfo = {
    name: string;
    size?: string;
    imageWidth?: number;
    imageHeight?: number;
};

export function formatDriveImageSize(size?: string): string {
    const bytes = Number(size);
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Peso no disponible';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
}

export function buildDriveImageInfoTitle(file: DriveImageInfo): string {
    const resolution = file.imageWidth && file.imageHeight
        ? `${file.imageWidth} × ${file.imageHeight} px`
        : 'Resolución no disponible';
    return [
        file.name,
        `Resolución: ${resolution}`,
        `Peso: ${formatDriveImageSize(file.size)}`,
        'Al arrastrar se usa el original de Drive',
    ].join('\n');
}
