export const AM_OPERATING_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const CLOCK_OFFSET_KEY = '__AM_OPERATING_CLOCK_OFFSET_MS__';

function getBrowserClockOffset(): number {
    if (typeof window === 'undefined') return 0;
    const value = (window as Window & { [CLOCK_OFFSET_KEY]?: unknown })[CLOCK_OFFSET_KEY];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Uses AM Clínica's server-synchronised clock in browsers. On the server it
 * naturally uses the host clock; dates are always rendered in Buenos Aires.
 */
export function getOperationalNow(): Date {
    return new Date(Date.now() + getBrowserClockOffset());
}

export function syncOperationalClock(serverNow: string): boolean {
    const serverMs = Date.parse(serverNow);
    if (!Number.isFinite(serverMs) || typeof window === 'undefined') return false;
    (window as Window & { [CLOCK_OFFSET_KEY]?: number })[CLOCK_OFFSET_KEY] = serverMs - Date.now();
    return true;
}

export function getLocalISODate(date?: Date): string {
    return getISODateInTimeZone(date || getOperationalNow(), AM_OPERATING_TIME_ZONE);
}

export function getISODateInTimeZone(
    date: Date = new Date(),
    timeZone: string = AM_OPERATING_TIME_ZONE
): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.year}-${values.month}-${values.day}`;
}

export function getLocalYearMonth(date?: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: AM_OPERATING_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(date || getOperationalNow());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}`;
}

function parseDateOnlyAsLocal(dateValue: string): Date {
    const [year, month, day] = dateValue.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function toDateInputValue(value?: string | null): string {
    if (!value) return getLocalISODate();

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return getLocalISODate();
    }

    return getLocalISODate(date);
}

export function formatDateForLocale(
    value?: string | null,
    locale: string = 'es-AR',
    options?: Intl.DateTimeFormatOptions
): string {
    if (!value) return '-';

    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? parseDateOnlyAsLocal(value)
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(locale, options);
}

export function formatCalendarDateForLocale(
    value?: string | null,
    locale: string = 'es-AR',
    options?: Intl.DateTimeFormatOptions
): string {
    const calendarDate = value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? value;
    return formatDateForLocale(calendarDate, locale, options);
}
