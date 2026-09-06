import { DEFAULT_TEXT_FONT_SIZE } from './text-annotations';

export function normalizeRotation(value: number) {
    if (!Number.isFinite(value)) return 0;
    const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
    return normalized === -180 ? 180 : normalized;
}

export type DrawColor = 'white' | 'yellow' | 'cyan' | 'red';

export interface DrawPoint {
    x: number;       // normalized 0–1
    y: number;       // normalized 0–1
    smooth: boolean; // true = Catmull-Rom tangent, false = sharp corner
}

export interface DrawShape {
    id: string;
    points: DrawPoint[];
    closed: boolean;
    color: DrawColor;
    strokeStyle?: string;    // persisted per-shape so styles can coexist
    children?: DrawShape[];  // set only on group shapes
}

export interface TextAnnotation {
    id: string;
    x: number;    // normalized 0–1
    y: number;    // normalized 0–1
    text: string;
    color: DrawColor;
    width: number; // normalized 0–1 — controls the wrap box width
    fontSize: number;
    align: 'left' | 'center' | 'right';
}

export interface FileEditState {
    rotation: number;
    brightness: number;
    drawShapes: DrawShape[];
    textAnnotations: TextAnnotation[];
}

export function normalizeFileEditState(state?: Partial<FileEditState> | null): FileEditState {
    return {
        rotation: normalizeRotation(state?.rotation ?? 0),
        brightness: state?.brightness ?? 100,
        drawShapes: state?.drawShapes ?? [],
        textAnnotations: (state?.textAnnotations ?? []).map(normalizeTextAnnotation),
    };
}

export function serializeFileEditState(state: FileEditState): string {
    return JSON.stringify(state);
}

export const DEFAULT_TEXT_ANNOTATION_WIDTH = 0.5;
export function normalizeTextAnnotation(annotation: Partial<TextAnnotation>): TextAnnotation {
    return {
        id: annotation.id ?? `text-${Date.now()}`,
        x: annotation.x ?? 0,
        y: annotation.y ?? 0,
        text: annotation.text ?? '',
        color: annotation.color ?? 'white',
        width: annotation.width ?? DEFAULT_TEXT_ANNOTATION_WIDTH,
        fontSize: annotation.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
        align: annotation.align ?? 'left',
    };
}

export function isCurrentPhotoSave(savedFileId: string, savedState: FileEditState, activeFileId: string | null, latestState: FileEditState): boolean {
    return savedFileId === activeFileId && serializeFileEditState(savedState) === serializeFileEditState(latestState);
}
