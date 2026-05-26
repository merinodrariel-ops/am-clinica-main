import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    addMinutes,
    clinicDateTime,
    clinicDateFromDateTime,
    dayOfWeekForClinicDate,
    getSearchTokens,
    rangesOverlap,
} from './core';

describe('am-clinica MCP core utilities', () => {
    it('normalizes multi-word patient search tokens', () => {
        assert.deepEqual(getSearchTokens('  Gustavo   Óro  '), ['gustavo', 'oro']);
    });

    it('detects overlapping appointment ranges', () => {
        const firstStart = new Date('2026-05-25T13:00:00.000Z');
        const firstEnd = new Date('2026-05-25T14:00:00.000Z');

        assert.equal(rangesOverlap(firstStart, firstEnd, new Date('2026-05-25T13:30:00.000Z'), new Date('2026-05-25T14:30:00.000Z')), true);
        assert.equal(rangesOverlap(firstStart, firstEnd, new Date('2026-05-25T14:00:00.000Z'), new Date('2026-05-25T14:30:00.000Z')), false);
    });

    it('builds clinic local datetimes with Argentina offset', () => {
        const localNine = clinicDateTime('2026-05-25', '09:00:00');
        assert.equal(localNine.toISOString(), '2026-05-25T12:00:00.000Z');
        assert.equal(addMinutes(localNine, 45).toISOString(), '2026-05-25T12:45:00.000Z');
    });

    it('computes weekday using clinic date instead of host timezone midnight', () => {
        assert.equal(dayOfWeekForClinicDate('2026-05-25'), 1);
    });

    it('extracts clinic date in Argentina timezone from ISO datetimes', () => {
        assert.equal(clinicDateFromDateTime(new Date('2026-05-25T02:30:00.000Z')), '2026-05-24');
        assert.equal(clinicDateFromDateTime(new Date('2026-05-25T12:30:00.000Z')), '2026-05-25');
    });
});
