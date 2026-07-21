/**
 * Selección manual de modelos 3D en la grilla del paciente para abrir dos juntos
 * (una mordida completa, o antes/después) en un mismo visor.
 *
 * Regla: como el visor compara de a dos, la selección se limita a 2. Al tocar un
 * tercero se descarta el más viejo (FIFO), así seleccionar siempre "avanza" sin
 * trabarse. Tocar uno ya seleccionado lo deselecciona.
 */
export const MAX_3D_SELECTION = 2;

export function toggle3DSelection(current: string[], id: string, max: number = MAX_3D_SELECTION): string[] {
    if (current.includes(id)) {
        return current.filter((x) => x !== id);
    }
    const next = [...current, id];
    if (next.length > max) {
        return next.slice(next.length - max); // drop oldest (FIFO)
    }
    return next;
}

/** ¿Se puede abrir la comparación? Exactamente 2 modelos seleccionados. */
export function canOpenPair(selected: string[]): boolean {
    return selected.length === MAX_3D_SELECTION;
}

/** Devuelve el par [primario, secundario] listo para abrir, o null si no hay 2. */
export function resolveSelectionPair<T extends { id: string }>(
    selected: string[],
    files: T[],
): [T, T] | null {
    if (selected.length !== MAX_3D_SELECTION) return null;
    const a = files.find((f) => f.id === selected[0]);
    const b = files.find((f) => f.id === selected[1]);
    if (!a || !b) return null;
    return [a, b];
}
