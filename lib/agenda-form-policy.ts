export const APPOINTMENT_TYPE_OPTIONS = [
    { value: 'consulta', label: '⭐ Consulta de primera vez' },
    { value: 'control_carilla_inmediato', label: 'Control carilla inmediato' },
    { value: 'control_carilla_anual', label: 'Control carilla anual' },
    { value: 'control_ortodoncia', label: 'Control ortodoncia' },
    { value: 'resinas_diseno_sonrisa', label: 'Diseño de sonrisa en resinas' },
    { value: 'cirugia_implantes', label: 'Cirugía / implantes' },
    { value: 'limpieza_convencional', label: 'Limpieza convencional' },
    { value: 'limpieza_laser', label: 'Limpieza con láser' },
    { value: 'tallado', label: 'Día detallado' },
    { value: 'cementado', label: 'Cementado' },
    { value: 'botox', label: 'Botox' },
    { value: 'control', label: 'Control general / urgencia' },
    { value: 'reunion', label: 'Reunión / Google Meet' },
    { value: 'recordatorio_interno', label: '📞 Recordatorio interno' },
] as const;

export const TYPE_DURATIONS_MIN: Readonly<Record<string, number>> = {
    consulta:  60,
    control:   60,
    control_carilla_inmediato: 60,
    control_carilla_anual: 60,
    control_ortodoncia: 60,
    resinas_diseno_sonrisa: 240,
    cirugia_implantes: 180,
    limpieza:  60,
    limpieza_convencional: 60,
    limpieza_laser: 60,
    botox:     30,
    cementado: 240,
    tallado:   240,
    reunion:   30,
};

export const PATIENT_OPTIONAL_TYPES: ReadonlySet<string> = new Set(['recordatorio_interno', 'reunion']);
export const RESPONSIBLE_REQUIRED_TYPES: ReadonlySet<string> = new Set(['reunion']);

export interface AgendaPolicyFields {
    type: string | null;
    patient_id: string | null;
    doctor_id: string | null;
    start_time: string | Date | null;
    end_time: string | Date | null;
    status?: string;
}

type AgendaPolicyUpdate = Partial<AgendaPolicyFields>;

function hasValidDate(value: string | Date | null | undefined): boolean {
    if (value instanceof Date) return Number.isFinite(value.getTime());
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const [, year, month, day] = match;
    const calendarDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    return calendarDate.getUTCFullYear() === Number(year)
        && calendarDate.getUTCMonth() + 1 === Number(month)
        && calendarDate.getUTCDate() === Number(day);
}

function validatePolicy(input: AgendaPolicyUpdate, checks: { patient: boolean; responsible: boolean; time: boolean }): string | null {
    if (checks.patient && !PATIENT_OPTIONAL_TYPES.has(input.type || '') && (typeof input.patient_id !== 'string' || !input.patient_id.trim())) {
        return 'Todo turno clínico necesita un paciente registrado o precargado.';
    }
    if (checks.responsible && RESPONSIBLE_REQUIRED_TYPES.has(input.type || '') && (typeof input.doctor_id !== 'string' || !input.doctor_id.trim())) {
        return 'Toda reunión necesita un responsable.';
    }
    if (checks.time) {
        if (!hasValidDate(input.start_time) || !hasValidDate(input.end_time)) {
            return 'Ingresá una fecha y hora de inicio y fin válidas.';
        }
        if (new Date(input.end_time!).getTime() <= new Date(input.start_time!).getTime()) {
            return 'La hora de fin debe ser posterior a la hora de inicio.';
        }
    }
    return null;
}

export function validateAgendaAppointment(input: AgendaPolicyFields): string | null {
    return validatePolicy(input, { patient: true, responsible: true, time: true });
}

/** Only load stored values when a changed policy needs an omitted counterpart. */
export function agendaUpdateNeedsCurrentState(updates: AgendaPolicyUpdate): boolean {
    const patient = updates.type !== undefined || updates.patient_id !== undefined;
    const responsible = updates.type !== undefined || updates.doctor_id !== undefined;
    if ((patient || responsible) && updates.type === undefined) return true;
    if (patient && !PATIENT_OPTIONAL_TYPES.has(updates.type || '') && updates.patient_id === undefined) return true;
    if (responsible && RESPONSIBLE_REQUIRED_TYPES.has(updates.type || '') && updates.doctor_id === undefined) return true;
    const time = updates.start_time !== undefined || updates.end_time !== undefined;
    return time && (updates.start_time === undefined || updates.end_time === undefined);
}

/** Status-only changes (including cancellation) must not revalidate historical fields. */
export function validateAgendaAppointmentUpdate(updates: AgendaPolicyUpdate, current: AgendaPolicyUpdate = {}): string | null {
    const definedUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
    return validatePolicy({ ...current, ...definedUpdates }, {
        patient: updates.type !== undefined || updates.patient_id !== undefined,
        responsible: updates.type !== undefined || updates.doctor_id !== undefined,
        time: updates.start_time !== undefined || updates.end_time !== undefined,
    });
}
