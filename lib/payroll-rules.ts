export type PayrollCalendarKind =
    | 'national_holiday'
    | 'moved_national_holiday'
    | 'tourism_non_working'
    | 'religious_non_working';

export type StaffingRecommendation =
    | 'prefer_close'
    | 'optional_minimal_staff'
    | 'normal_staffing';

export interface PayrollCalendarDay {
    date: string;
    label: string;
    kind: PayrollCalendarKind;
    paysDouble: boolean;
    staffingRecommendation: StaffingRecommendation;
    notes?: string;
}

export const PAYROLL_CALENDAR_2026: PayrollCalendarDay[] = [
    { date: '2026-01-01', label: 'Año Nuevo', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-02-16', label: 'Carnaval', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-02-17', label: 'Carnaval', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-03-23', label: 'Día no laborable turístico', kind: 'tourism_non_working', paysDouble: false, staffingRecommendation: 'optional_minimal_staff', notes: 'Optativo: no paga doble salvo política interna.' },
    { date: '2026-03-24', label: 'Día Nacional de la Memoria por la Verdad y la Justicia', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-04-02', label: 'Día del Veterano y de los Caídos en la Guerra de Malvinas', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-04-03', label: 'Viernes Santo', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-05-01', label: 'Día del Trabajador', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-05-25', label: 'Día de la Revolución de Mayo', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-06-15', label: 'Paso a la Inmortalidad del General Martín Miguel de Güemes', kind: 'moved_national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close', notes: 'Trasladado desde 2026-06-17.' },
    { date: '2026-06-17', label: 'Güemes - fecha histórica sin recargo por traslado', kind: 'moved_national_holiday', paysDouble: false, staffingRecommendation: 'normal_staffing', notes: 'El recargo aplica el 2026-06-15.' },
    { date: '2026-06-20', label: 'Paso a la Inmortalidad del General Manuel Belgrano', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-07-09', label: 'Día de la Independencia', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-07-10', label: 'Día no laborable turístico', kind: 'tourism_non_working', paysDouble: false, staffingRecommendation: 'optional_minimal_staff', notes: 'Optativo: no paga doble salvo política interna.' },
    { date: '2026-08-17', label: 'Paso a la Inmortalidad del General José de San Martín', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-10-12', label: 'Día del Respeto a la Diversidad Cultural', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-11-20', label: 'Soberanía Nacional - fecha histórica sin recargo por traslado', kind: 'moved_national_holiday', paysDouble: false, staffingRecommendation: 'normal_staffing', notes: 'El recargo aplica el 2026-11-23.' },
    { date: '2026-11-23', label: 'Día de la Soberanía Nacional', kind: 'moved_national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close', notes: 'Trasladado desde 2026-11-20.' },
    { date: '2026-12-07', label: 'Día no laborable turístico', kind: 'tourism_non_working', paysDouble: false, staffingRecommendation: 'optional_minimal_staff', notes: 'Optativo: no paga doble salvo política interna.' },
    { date: '2026-12-08', label: 'Inmaculada Concepción de María', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
    { date: '2026-12-25', label: 'Navidad', kind: 'national_holiday', paysDouble: true, staffingRecommendation: 'prefer_close' },
];

export const FERIADOS_2026 = PAYROLL_CALENDAR_2026
    .filter((day) => day.paysDouble)
    .map((day) => day.date);

export function getPayrollCalendarDay(dateStr: string): PayrollCalendarDay | undefined {
    return PAYROLL_CALENDAR_2026.find((day) => day.date === dateStr);
}

export function shouldPayDoubleHoliday(dateStr: string): boolean {
    return getPayrollCalendarDay(dateStr)?.paysDouble === true;
}

export interface PayrollOptions {
    area?: string;
    rol?: string;
    recargo_sabado?: boolean;
    recargo_domingo_feriado?: boolean;
    recargo_nocturno?: boolean;
    horas_base?: number | null;
    costo_hora_extra?: number | null;
}

export interface PayrollLog {
    fecha: string;
    horas?: number | string | null;
    hora_ingreso?: string | null;
    hora_egreso?: string | null;
}

function getPayrollProfileText(areaOrOptions: string | PayrollOptions = '', rol: string = ''): string {
    if (typeof areaOrOptions === 'object' && areaOrOptions !== null) {
        return `${areaOrOptions.area || ''} ${areaOrOptions.rol || ''}`.toLowerCase();
    }

    return `${areaOrOptions} ${rol}`.toLowerCase();
}

export function isNightBonusEligible(areaOrOptions: string | PayrollOptions = '', rol: string = ''): boolean {
    const profileText = getPayrollProfileText(areaOrOptions, rol);

    if (profileText.includes('lab')) return false;

    return (
        profileText.includes('asist') ||
        profileText.includes('admin') ||
        profileText.includes('recep')
    );
}

function isDateSurchargeEligible(areaOrOptions: string | PayrollOptions = '', rol: string = ''): boolean {
    const profileText = getPayrollProfileText(areaOrOptions, rol);

    if (profileText.includes('lab')) return false;

    return (
        profileText.includes('asist') ||
        profileText.includes('admin') ||
        profileText.includes('recep') ||
        profileText.includes('staff') ||
        profileText.includes('general') ||
        profileText.includes('limpieza')
    );
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
        if (!isDateSurchargeEligible(areaOrOptions, rol)) return 1.0;
    }

    if (!isDateSurchargeEligible(areaOrOptions, rol)) return 1.0;

    const date = new Date(dateStr + 'T12:00:00'); // Use midday to avoid TZ issues
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Check paid national holiday (holiday takes priority)
    if (shouldPayDoubleHoliday(dateStr)) {
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
 * Supports weekly/holiday multipliers, night shift bonus (+20%), and tiered base/extra rates.
 */
export function calculateAdjustedEarnings(
    logs: PayrollLog[],
    hourlyRate: number,
    optionsOrArea: string | PayrollOptions = '',
    rol: string = ''
): number {
    let recargoNocturno = false;
    let horasBase: number | null = null;
    let costoHoraExtra: number | null = null;

    if (typeof optionsOrArea === 'object' && optionsOrArea !== null) {
        recargoNocturno = !!optionsOrArea.recargo_nocturno && isNightBonusEligible(optionsOrArea, rol);
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

        // Night bonus
        let hNight = 0;
        if (recargoNocturno) {
            hNight = calculateNightHours(log.hora_ingreso, log.hora_egreso);
        }

        // Night bonus is +20% (+0.2x) on top of the date's standard rate
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
