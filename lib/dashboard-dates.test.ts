import test from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardDates } from './dashboard-dates';
import { getISODateInTimeZone } from './local-date';

test('dashboard stays in the Argentine month during the first three UTC hours', () => {
    const dates = getDashboardDates(new Date('2026-09-01T02:59:59Z'));
    assert.equal(dates.today, '2026-08-31');
    assert.equal(dates.monthStartInstant, '2026-08-01T00:00:00-03:00');
    assert.equal(dates.nextMonthStartInstant, '2026-09-01T00:00:00-03:00');
    assert.equal(dates.previousComparisonEnd, '2026-08-01');
    assert.equal(getISODateInTimeZone(new Date('2026-09-01T02:59:59Z')).slice(0, 7), '2026-08');
});

test('monthly comparisons clamp to February and support historical years', () => {
    const dates = getDashboardDates(new Date('2028-03-31T12:00:00Z'));
    assert.equal(dates.previousComparisonEnd, '2028-03-01');
    const january = getDashboardDates(new Date('2026-09-05T12:00:00Z'), 2026, 0);
    assert.equal(january.previousMonthStart, '2025-12-01');
    assert.equal(january.previousComparisonEnd, '2026-01-01');
    assert.deepEqual(january.monthWindows.map(w => w.key), ['2026-01']);
});

test('month and year roll over at Argentine midnight, not server midnight', () => {
    const dates = getDashboardDates(new Date('2027-01-01T02:00:00Z'));
    assert.equal(dates.year, 2026);
    assert.equal(dates.tomorrowStart, '2027-01-01T00:00:00-03:00');
    assert.equal(dates.nextYearStartInstant, '2027-01-01T00:00:00-03:00');
    assert.throws(() => getDashboardDates(new Date(), 2026, 12), /Período/);
});
