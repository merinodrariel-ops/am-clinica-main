import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCalendarDateForLocale, formatDateForLocale, getISODateInTimeZone } from './local-date';

test('formats a date-only clinical date without moving it to the previous day', () => {
    assert.equal(
        formatDateForLocale('2026-07-27', 'es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }),
        '27 de julio de 2026'
    );
});

test('gets the Argentina calendar day even when UTC is already on the next day', () => {
    assert.equal(
        getISODateInTimeZone(new Date('2026-07-28T02:30:00.000Z')),
        '2026-07-27'
    );
});

test('preserves the selected clinical day when Supabase returns midnight UTC', () => {
    assert.equal(
        formatCalendarDateForLocale('2026-07-06T00:00:00+00:00', 'es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }),
        '6 de julio de 2026'
    );
});
