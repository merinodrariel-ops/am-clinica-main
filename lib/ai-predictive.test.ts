import assert from 'node:assert/strict';
import test from 'node:test';
import { aiPredictiveJsonSchema, parseAiPredictive } from './ai-predictive';

const report = { forecast: { nextMonthRevenue: 15000, confidence: 75, trend: 'up' }, insights: ['Ingresos estables.'], recommendations: ['Revisar gastos.'] };

test('predictive report preserves valid content and both confidence boundaries', () => {
    assert.deepEqual(parseAiPredictive(JSON.stringify(report)), report);
    for (const confidence of [0, 100]) {
        assert.equal(parseAiPredictive(JSON.stringify({ ...report, forecast: { ...report.forecast, confidence } })).forecast.confidence, confidence);
    }
    assert.equal(aiPredictiveJsonSchema.type, 'object');
});

test('predictive report rejects out-of-range financial and confidence values without clamping', () => {
    for (const patch of [{ nextMonthRevenue: -1 }, { confidence: 101 }, { confidence: -1 }, { confidence: '75' }, { trend: 'unknown' }]) {
        assert.throws(() => parseAiPredictive(JSON.stringify({ ...report, forecast: { ...report.forecast, ...patch } })));
    }
    assert.throws(() => parseAiPredictive(JSON.stringify(report).replace('15000', '1e999')));
});

test('predictive report rejects incomplete or malformed response without invented defaults', () => {
    for (const input of ['{}', 'null', '{', JSON.stringify({ ...report, insights: 'text' }), JSON.stringify({ ...report, recommendations: [''] })]) {
        assert.throws(() => parseAiPredictive(input));
    }
});
