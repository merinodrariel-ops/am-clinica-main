export interface FreeTextHistoriaEntry {
    tratamiento_realizado: string;
    observaciones_clinicas: string;
}

export function buildFreeTextHistoriaEntry({ text }: { text: string }): FreeTextHistoriaEntry {
    const note = text.trim();
    const firstLine = note.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() || '';
    const titleSource = firstLine || 'Entrada clinica';
    const title = titleSource.length > 120 ? `${titleSource.slice(0, 117)}...` : titleSource;

    return {
        tratamiento_realizado: title,
        observaciones_clinicas: note,
    };
}
