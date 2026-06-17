export type SmileExportPresetId = 'post' | 'story';

export type SmileExportPreset = {
    id: SmileExportPresetId;
    label: string;
    width: number;
    height: number;
};

const PRESETS: Record<SmileExportPresetId, SmileExportPreset> = {
    post: { id: 'post', label: 'Post', width: 1080, height: 1350 },
    story: { id: 'story', label: 'Historia', width: 1080, height: 1920 },
};

export function getSmileExportPreset(id: SmileExportPresetId): SmileExportPreset {
    return PRESETS[id];
}

export function getSupportedSmileVideoMimeType(
    isTypeSupported: (candidate: string) => boolean
): { mimeType: string; extension: 'mp4' | 'webm' } {
    const candidates: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
        { mimeType: 'video/mp4;codecs=h264', extension: 'mp4' },
        { mimeType: 'video/mp4', extension: 'mp4' },
        { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
        { mimeType: 'video/webm', extension: 'webm' },
    ];

    return candidates.find(candidate => isTypeSupported(candidate.mimeType)) ?? candidates[candidates.length - 1];
}

