import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDateForLocale, getISODateInTimeZone } from './local-date';

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
