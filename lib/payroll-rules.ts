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

export interface PayrollOptions {
    area?: string;
    rol?: string;
    recargo_sabado?: boolean;
    recargo_domingo_feriado?: boolean;
    recargo_nocturno?: boolean;
    horas_base?: number | null;
    costo_hora_extra?: number | null;
}

/**
 * Calculates the number of hours in a shift that fall between 22:00 and 04:00 (night shift).
 */
export function calculateNightHours(horaIngreso?: string | null, horaEgreso?: string | null): number {
    if (!horaIngreso || !horaEgreso) return 0;

    const [inH, inM] = horaIngreso.split(':').map(Number);
    const [outH, outM] = horaEgreso.split(':').map(Number);

    const inMinutes = inH * 60 + inM;
    let outMinutes = outH * 60 + outM;

    // Shift crosses midnight
    if (outMinutes < inMinutes) {
        outMinutes += 24 * 60;
    }

    // Night intervals in minutes relative to the start of day 0:
    // Interval 1: 00:00 - 04:00 (0 to 240)
    // Interval 2: 22:00 - 04:00 next day (1320 to 1680)
    // Interval 3: 22:00 next day - 04:00 day after (2760 to 3120)
    const nightIntervals = [
        { start: 0, end: 4 * 60 },
        { start: 22 * 60, end: 28 * 60 },
        { start: 46 * 60, end: 52 * 60 }
    ];

    let nightMinutes = 0;
    for (const interval of nightIntervals) {
        const overlapStart = Math.max(inMinutes, interval.start);
        const overlapEnd = Math.min(outMinutes, interval.end);
        if (overlapStart < overlapEnd) {
            nightMinutes += (overlapEnd - overlapStart);
        }
    }

    return Math.max(0, Math.round((nightMinutes / 60) * 100) / 100);
}

/**
 * Calculates the multiplier for a given date and worker config.
 * - Saturdays: 1.5x (if enabled)
 * - Holidays: 2.0x (if enabled)
 * - Sundays: 2.0x (if enabled)
 */
export function getPayrollMultiplier(
    dateStr: string,
    areaOrOptions: string | PayrollOptions = '',
    rol: string = ''
): number {
    let recargoSabado = true;
    let recargoDomingoFeriado = true;

    if (typeof areaOrOptions === 'object' && areaOrOptions !== null) {
        recargoSabado = areaOrOptions.recargo_sabado !== false;
        recargoDomingoFeriado = areaOrOptions.recargo_domingo_feriado !== false;
    } else {
        const areaLower = `${areaOrOptions} ${rol}`.toLowerCase();
        // Laboratory is excluded from these rules by default
        if (areaLower.includes('lab')) {
            return 1.0;
        }

        // Only apply to Assistant, Admin, Reception, Staff, Cleaners by default
        const isApplicable =
            areaLower.includes('asist') ||
            areaLower.includes('admin') ||
            areaLower.includes('recep') ||
            areaLower.includes('staff') ||
            areaLower.includes('general') ||
            areaLower.includes('limpieza');

        if (!isApplicable) return 1.0;
    }

    const date = new Date(dateStr + 'T12:00:00'); // Use midday to avoid TZ issues
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Check Holiday (Holiday takes priority)
    if (FERIADOS_2026.includes(dateStr)) {
        return recargoDomingoFeriado ? 2.0 : 1.0;
    }

    // Sunday (Usually 2.0x too)
    if (dayOfWeek === 0) {
        return recargoDomingoFeriado ? 2.0 : 1.0;
    }

    // Saturday
    if (dayOfWeek === 6) {
        return recargoSabado ? 1.5 : 1.0;
    }

    return 1.0;
}

/**
 * Calculates adjusted earnings over a list of daily logs.
 * Supports weekly/holiday multipliers, night shift surcharge (+20%), and tiered base/extra rates.
 */
export function calculateAdjustedEarnings(
    logs: any[],
    hourlyRate: number,
    optionsOrArea: string | PayrollOptions = '',
    rol: string = ''
): number {
    let recargoNocturno = false;
    let horasBase: number | null = null;
    let costoHoraExtra: number | null = null;

    if (typeof optionsOrArea === 'object' && optionsOrArea !== null) {
        recargoNocturno = !!optionsOrArea.recargo_nocturno;
        horasBase = optionsOrArea.horas_base ?? null;
        costoHoraExtra = optionsOrArea.costo_hora_extra ?? null;
    }

    let totalHoras = 0;
    let totalHorasEfectivas = 0;

    for (const log of logs) {
        const horas = Number(log.horas || 0);
        totalHoras += horas;

        // Date multiplier (e.g. 1.0, 1.5, 2.0)
        const m = getPayrollMultiplier(log.fecha, optionsOrArea, rol);

        // Night surcharge
        let hNight = 0;
        if (recargoNocturno) {
            hNight = calculateNightHours(log.hora_ingreso, log.hora_egreso);
        }

        // Night surcharge is +20% (+0.2x) on top of the date's standard rate
        const logEfectivas = m * (horas + hNight * 0.2);
        totalHorasEfectivas += logEfectivas;
    }

    // Tiered hourly rates calculation
    if (horasBase !== null && totalHoras > horasBase) {
        const extraRate = costoHoraExtra ?? hourlyRate;
        const baseEarnings = horasBase * hourlyRate;
        const extraEarnings = (totalHoras - horasBase) * extraRate;

        // Pro-rate based on the average multiplier of the month
        const avgMultiplier = totalHoras > 0 ? (totalHorasEfectivas / totalHoras) : 1.0;
        return (baseEarnings + extraEarnings) * avgMultiplier;
    }

    return totalHorasEfectivas * hourlyRate;
}
