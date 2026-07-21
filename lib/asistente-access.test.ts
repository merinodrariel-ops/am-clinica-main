import assert from 'node:assert/strict';
import test from 'node:test';

import { ASSISTANT_ALLOWED_CATEGORIES, canAccessInternalAssistant } from './asistente-access';

test('internal assistant is restricted to owner admin and developer roles', () => {
    assert.deepEqual(ASSISTANT_ALLOWED_CATEGORIES, ['owner', 'admin', 'developer']);

    assert.equal(canAccessInternalAssistant('owner'), true);
    assert.equal(canAccessInternalAssistant('admin'), true);
    assert.equal(canAccessInternalAssistant('developer'), true);

    assert.equal(canAccessInternalAssistant('reception'), false);
    assert.equal(canAccessInternalAssistant('recaptacion'), false);
    assert.equal(canAccessInternalAssistant('dr'), false);
    assert.equal(canAccessInternalAssistant('asistente'), false);
    assert.equal(canAccessInternalAssistant(null), false);
});
