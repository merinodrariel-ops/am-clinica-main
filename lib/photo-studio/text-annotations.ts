const PASTE_OFFSET = 0.02;
const MAX_TEXT_COORD = 0.98;

export const DEFAULT_TEXT_FONT_SIZE = 30;

/** Normalizes the clinical vocabulary that is routinely used in photo notes. */
export function normalizeClinicalAnnotationText(value: string): string {
    const replacements: Array<[RegExp, string]> = [
        [/\brehabilitacion\b/gi, 'rehabilitación'],
        [/\bceramica\b/gi, 'cerámica'],
        [/\bceramicas\b/gi, 'cerámicas'],
        [/\bestetica\b/gi, 'estética'],
        [/\besteticas\b/gi, 'estéticas'],
        [/\bdiseno\b/gi, 'diseño'],
        [/\bdisenos\b/gi, 'diseños'],
        [/\bprotesis\b/gi, 'prótesis'],
        [/\bodontologia\b/gi, 'odontología'],
        [/\blaser\b/gi, 'láser'],
        [/\balineador\b/gi, 'alineador'],
        [/\balineadores\b/gi, 'alineadores'],
        [/\bmaxilar\b/gi, 'maxilar'],
    ];

    return replacements.reduce(
        (normalized, [pattern, replacement]) => normalized.replace(pattern, replacement),
        value.normalize('NFC'),
    );
}

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
