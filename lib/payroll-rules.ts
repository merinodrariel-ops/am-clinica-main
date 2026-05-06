
export const FERIADOS_2026 = [
    '2026-01-01', // Año Nuevo
    '2026-05-01', // Día del Trabajador
    '2026-05-25', // Revolución de Mayo
    '2026-06-17', // Martín Miguel de Güemes
    '2026-06-20', // Manuel Belgrano
    '2026-07-09', // Independencia
    '2026-08-17', // San Martín
    '2026-10-12', // Diversidad Cultural
    '2026-11-20', // Soberanía Nacional
    '2026-12-08', // Inmaculada Concepción
    '2026-12-25', // Navidad
];

/**
 * Calculates the multiplier for a given date and worker category.
 * - Saturdays: 1.5x (for Assistants/Admins)
 * - Holidays: 2.0x (for Assistants/Admins)
 * - Sundays: 2.0x (Standard practice usually, let's include it)
 * - Lab/Other: 1.0x (as requested)
 */
export function getPayrollMultiplier(dateStr: string, area: string = '', rol: string = ''): number {
    const areaLower = `${area} ${rol}`.toLowerCase();

    // Laboratory is excluded from these rules
    if (areaLower.includes('lab')) {
        return 1.0;
    }

    // Only apply to Assistant, Admin, Reception, Staff
    const isApplicable =
        areaLower.includes('asist') ||
        areaLower.includes('admin') ||
        areaLower.includes('recep') ||
        areaLower.includes('staff') ||
        areaLower.includes('general') ||
        areaLower.includes('limpieza');

    if (!isApplicable) return 1.0;

    const date = new Date(dateStr + 'T12:00:00'); // Use midday to avoid TZ issues
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Check Holiday (Holiday takes priority)
    if (FERIADOS_2026.includes(dateStr)) {
        return 2.0;
    }

    // Sunday (Usually 2.0x too)
    if (dayOfWeek === 0) {
        return 2.0;
    }

    // Saturday
    if (dayOfWeek === 6) {
        return 1.5;
    }

    return 1.0;
}

export function calculateAdjustedEarnings(logs: any[], hourlyRate: number, area: string = '', rol: string = '') {
    return logs.reduce((sum, log) => {
        const multiplier = getPayrollMultiplier(log.fecha, area, rol);
        return sum + (Number(log.horas || 0) * hourlyRate * multiplier);
    }, 0);
}
