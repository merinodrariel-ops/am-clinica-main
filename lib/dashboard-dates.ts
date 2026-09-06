import { getISODateInTimeZone } from './local-date';

export function getDashboardDates(now = new Date(), targetYear?: number, targetMonth?: number) {
    const today = getISODateInTimeZone(now);
    const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
    const year = targetYear ?? currentYear;
    const month = targetMonth ?? currentMonth - 1;
    if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 0 || month > 11) {
        throw new Error('Período inválido');
    }
    const dateAt = (offset: number, day = 1) => new Date(Date.UTC(year, month + offset, day));
    const dateKey = (offset: number, day = 1) => dateAt(offset, day).toISOString().slice(0, 10);
    const monthStart = dateKey(0);
    const nextMonthStart = dateKey(1);
    const previousMonthStart = dateKey(-1);
    const isCurrentMonth = year === currentYear && month === currentMonth - 1;
    const previousComparisonDay = Math.min(currentDay, dateAt(0, 0).getUTCDate());
    const previousMonthLabel = dateAt(-1).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
    const monthWindows = Array.from({ length: 6 }, (_, index) => {
        const date = dateAt(index - 5);
        return {
            key: date.toISOString().slice(0, 7),
            shortLabel: date.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 3),
            label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        };
    }).filter(window => window.key >= '2026-01');
    return {
        year, month, today, monthStart, nextMonthStart, previousMonthStart, monthWindows,
        comparisonMonthStart: dateKey(-5),
        previousComparisonEnd: isCurrentMonth ? dateKey(-1, previousComparisonDay + 1) : monthStart,
        egresosComparacionLabel: isCurrentMonth ? `vs. mismo corte de ${previousMonthLabel}` : `vs. ${previousMonthLabel}`,
        todayStart: `${today}T00:00:00-03:00`,
        tomorrowStart: `${new Date(Date.UTC(currentYear, currentMonth - 1, currentDay + 1)).toISOString().slice(0, 10)}T00:00:00-03:00`,
        monthStartInstant: `${monthStart}T00:00:00-03:00`,
        nextMonthStartInstant: `${nextMonthStart}T00:00:00-03:00`,
        yearStartInstant: `${year}-01-01T00:00:00-03:00`,
        nextYearStartInstant: `${year + 1}-01-01T00:00:00-03:00`,
    };
}
