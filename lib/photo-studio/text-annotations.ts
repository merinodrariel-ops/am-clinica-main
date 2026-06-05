const PASTE_OFFSET = 0.02;
const MAX_TEXT_COORD = 0.98;

export const DEFAULT_TEXT_FONT_SIZE = 30;

export function cloneTextAnnotationForPaste<T extends { id: string; x: number; y: number }>(
    annotation: T,
    nextId: string,
): T {
    return {
        ...annotation,
        id: nextId,
        x: Math.min(MAX_TEXT_COORD, annotation.x + PASTE_OFFSET),
        y: Math.min(MAX_TEXT_COORD, annotation.y + PASTE_OFFSET),
    };
}
