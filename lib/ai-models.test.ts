import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_AI_MODELS, getAiModel } from './ai-models';

test('AI workloads have explicit supported defaults', () => {
    assert.equal(DEFAULT_AI_MODELS.implicitHours, 'gemini-3.5-flash-lite');
    assert.equal(DEFAULT_AI_MODELS.contractAssistant, 'gemini-3.5-flash');
    assert.equal(Object.values(DEFAULT_AI_MODELS).some(model => model.includes('gemini-1.5')), false);
});

test('AI workload models can be overridden without changing application code', () => {
    assert.equal(
        getAiModel('contractAssistant', { AI_MODEL_CONTRACT_ASSISTANT: '  test-contract-model  ' }),
        'test-contract-model',
    );
    assert.equal(getAiModel('contractAssistant', {}), DEFAULT_AI_MODELS.contractAssistant);
});
