export function getLocalISODate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getLocalYearMonth(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
