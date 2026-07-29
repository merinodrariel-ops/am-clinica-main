import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('Exocad HTML opens in a separate tab instead of an in-panel iframe', async () => {
    const cardPath = path.join(process.cwd(), 'components', 'patients', 'drive', 'ExocadProjectCard.tsx');
    const source = await readFile(cardPath, 'utf8');

    assert.match(source, /target="_blank"/);
    assert.match(source, /rel="noopener noreferrer"/);
    assert.doesNotMatch(source, /<iframe/);
});

test('Drive HTML responses are sandboxed away from the authenticated clinic origin', async () => {
    const routePath = path.join(process.cwd(), 'app', 'api', 'drive', 'file', '[fileId]', 'route.ts');
    const source = await readFile(routePath, 'utf8');

    assert.match(source, /mimeType === 'text\/html'/);
    assert.match(source, /Content-Security-Policy/);
    assert.match(source, /sandbox allow-scripts/);
    assert.match(source, /Content-Disposition', 'inline'/);
});
