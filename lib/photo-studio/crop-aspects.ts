import { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop';

export type CropAspectPresetId = 'free' | '1:1' | '3:4' | '4:5' | '9:16' | '16:9';

export type CropAspectPreset = {
    id: CropAspectPresetId;
    label: string;
    title: string;
    aspect?: number;
};

export const CROP_ASPECT_PRESETS: CropAspectPreset[] = [
    { id: 'free', label: 'Libre', title: 'Recorte libre' },
    { id: '1:1', label: '1:1', title: 'Cuadrado / posteo', aspect: 1 },
    { id: '3:4', label: '3:4', title: 'Vertical clásico', aspect: 3 / 4 },
    { id: '4:5', label: '4:5', title: 'Vertical feed', aspect: 4 / 5 },
    { id: '9:16', label: '9:16', title: 'Historia / reel', aspect: 9 / 16 },
    { id: '16:9', label: '16:9', title: 'Horizontal', aspect: 16 / 9 },
];

export function getCropAspectPreset(id: CropAspectPresetId): CropAspectPreset {
    return CROP_ASPECT_PRESETS.find((preset) => preset.id === id) ?? CROP_ASPECT_PRESETS[0];
}

export function buildCenteredAspectCrop(
    renderedWidth: number,
    renderedHeight: number,
    aspect: number,
): PercentCrop {
    const width = aspect >= 1 ? 82 : Math.max(52, Math.min(76, aspect * 96));

    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width,
            },
            aspect,
            renderedWidth,
            renderedHeight,
        ),
        renderedWidth,
        renderedHeight,
    );
}

export type ExportBgColor = 'transparent' | 'white' | 'black';

export function shouldExportPhotoAsPng(options: {
    fileName: string;
    bgDone: boolean;
    bgColor: ExportBgColor;
    hasTransparentBg?: boolean;
    mimeType?: string;
}) {
    if (options.bgDone) return options.bgColor === 'transparent';
    const isOriginalPng = options.fileName.toLowerCase().endsWith('.png') || options.mimeType === 'image/png';
    return !!options.hasTransparentBg || isOriginalPng;
}
