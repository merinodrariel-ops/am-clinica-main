export type AdmissionBookingMode = 'all' | 'merino' | 'staff';

export const ADMISSION_BOOKING_PATHS: Record<AdmissionBookingMode, string> = {
    all: '/admision/agendar',
    merino: '/admision/agendar?modo=merino',
    staff: '/admision/agendar?modo=staff',
};

export function getAdmissionBookingPath(mode: AdmissionBookingMode = 'all'): string {
    return ADMISSION_BOOKING_PATHS[mode];
}

export function getAdmissionBookingUrl(
    mode: AdmissionBookingMode = 'all',
    appBase?: string
): string {
    const base = (appBase || process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica.ar').replace(/\/$/, '');
    return `${base}${getAdmissionBookingPath(mode)}`;
}
