import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getPayrollCalendarDay,
    getPayrollMultiplier,
    shouldPayDoubleHoliday,
} from './payroll-rules';

test('national holidays that are moved pay double only on the observed date', () => {
    assert.equal(getPayrollMultiplier('2026-06-15', { area: 'Administracion' }), 2);
    assert.equal(shouldPayDoubleHoliday('2026-06-15'), true);
    assert.equal(getPayrollMultiplier('2026-06-17', { area: 'Administracion' }), 1);
    assert.equal(shouldPayDoubleHoliday('2026-06-17'), false);

    assert.equal(getPayrollMultiplier('2026-11-23', { area: 'Administracion' }), 2);
    assert.equal(getPayrollMultiplier('2026-11-20', { area: 'Administracion' }), 1);
});

test('tourism bridge non-working days are operational alerts but do not pay double by default', () => {
    const bridge = getPayrollCalendarDay('2026-07-10');

    assert.equal(bridge?.kind, 'tourism_non_working');
    assert.equal(bridge?.paysDouble, false);
    assert.equal(bridge?.staffingRecommendation, 'optional_minimal_staff');
    assert.equal(getPayrollMultiplier('2026-07-10', { area: 'Administracion' }), 1);
});

test('regular national holidays pay double and expose close recommendation', () => {
    const holiday = getPayrollCalendarDay('2026-05-25');

    assert.equal(holiday?.kind, 'national_holiday');
    assert.equal(holiday?.paysDouble, true);
    assert.equal(holiday?.staffingRecommendation, 'prefer_close');
    assert.equal(getPayrollMultiplier('2026-05-25', { area: 'Administracion' }), 2);
});

test('laboratory remains excluded from default date surcharges', () => {
    assert.equal(getPayrollMultiplier('2026-05-25', 'Laboratorio'), 1);
});
