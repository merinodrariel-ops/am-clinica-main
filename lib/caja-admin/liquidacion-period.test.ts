import test from 'node:test';
import assert from 'node:assert/strict';

import { getLiquidacionMonthEndISODate } from './liquidacion-period';

test('getLiquidacionMonthEndISODate returns the end of the requested month', () => {
    assert.equal(getLiquidacionMonthEndISODate('2026-06'), '2026-06-30');
    assert.equal(getLiquidacionMonthEndISODate('2026-02'), '2026-02-28');
    assert.equal(getLiquidacionMonthEndISODate('2024-02'), '2024-02-29');
});

test('getLiquidacionMonthEndISODate accepts full date strings by using their year-month', () => {
    assert.equal(getLiquidacionMonthEndISODate('2026-07-15'), '2026-07-31');
});
