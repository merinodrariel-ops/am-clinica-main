const ORTHO_REPLACEMENT_TAG_REGEX = /\[ORTHO_REPLACEMENT_DAYS:(10|15)\]/g;

export function parseOrthoReplacementDays(notes: string | null | undefined): 10 | 15 | null {
    if (!notes) return null;
    const match = notes.match(/\[ORTHO_REPLACEMENT_DAYS:(10|15)\]/);
    if (!match) return null;
    return Number(match[1]) as 10 | 15;
}

export function stripAppointmentMeta(notes: string | null | undefined): string {
    if (!notes) return '';

    return notes
        .replace(ORTHO_REPLACEMENT_TAG_REGEX, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function serializeAppointmentNotes(input: {
    visibleNotes: string;
    type: string;
    orthoReplacementDays?: 10 | 15 | null;
}): string {
    const cleanNotes = stripAppointmentMeta(input.visibleNotes);
    const lines = cleanNotes ? [cleanNotes] : [];

    if (input.type === 'control_ortodoncia' && input.orthoReplacementDays) {
        lines.push(`[ORTHO_REPLACEMENT_DAYS:${input.orthoReplacementDays}]`);
    }

    return lines.join('\n');
}
