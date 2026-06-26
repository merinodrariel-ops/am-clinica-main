const ORTHO_REPLACEMENT_TAG_REGEX = /\[ORTHO_REPLACEMENT_DAYS:(10|15)\]/g;
const APPOINTMENT_MODALITY_TAG_REGEX = /\[APPOINTMENT_MODALITY:(presencial|virtual)\]/g;

export type AppointmentModality = 'presencial' | 'virtual';

export function normalizeAppointmentModality(value: string | null | undefined): AppointmentModality {
    return value === 'virtual' ? 'virtual' : 'presencial';
}

export function parseAppointmentModality(notes: string | null | undefined): AppointmentModality {
    if (!notes) return 'presencial';
    const match = notes.match(/\[APPOINTMENT_MODALITY:(presencial|virtual)\]/);
    return normalizeAppointmentModality(match?.[1]);
}

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
        .replace(APPOINTMENT_MODALITY_TAG_REGEX, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function serializeAppointmentNotes(input: {
    visibleNotes: string;
    type: string;
    orthoReplacementDays?: 10 | 15 | null;
    modality?: AppointmentModality | null;
}): string {
    const cleanNotes = stripAppointmentMeta(input.visibleNotes);
    const lines = cleanNotes ? [cleanNotes] : [];

    const modality = normalizeAppointmentModality(input.modality);
    if (modality === 'virtual') {
        lines.push('[APPOINTMENT_MODALITY:virtual]');
    }

    if (input.type === 'control_ortodoncia' && input.orthoReplacementDays) {
        lines.push(`[ORTHO_REPLACEMENT_DAYS:${input.orthoReplacementDays}]`);
    }

    return lines.join('\n');
}
