export const CLEANING_APPOINTMENT_TYPES = ['limpieza', 'limpieza_convencional', 'limpieza_laser'] as const;

export function isCleaningAppointmentType(type: string | null | undefined): boolean {
    return CLEANING_APPOINTMENT_TYPES.includes(type as (typeof CLEANING_APPOINTMENT_TYPES)[number]);
}

export function canScheduleCleaningFollowupFromAppointment(input: {
    type: string | null | undefined;
    status: string | null | undefined;
}): boolean {
    return isCleaningAppointmentType(input.type) && input.status === 'completed';
}

export function getCleaningFollowupDate(startTime: string | Date, intervalMonths: number): Date {
    const date = new Date(startTime);
    date.setMonth(date.getMonth() + intervalMonths);
    return date;
}

