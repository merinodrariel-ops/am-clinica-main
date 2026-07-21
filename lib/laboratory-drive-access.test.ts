import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDriveEditorEmails } from './laboratory-drive-access';

test('normalizes and deduplicates laboratory Drive editor emails', () => {
    assert.deepEqual(
        normalizeDriveEditorEmails([' Julian@Example.com ', 'julian@example.com', null, 'invalid']),
        ['julian@example.com']
    );
});
