import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeoFileName } from './drive-upload-files';

test('builds SEO name with zero-padded sequence and year-month', () => {
    const name = buildSeoFileName('perez_am-clinica_archivos', 1, '.jpg');
    assert.match(name, /^perez_am-clinica_archivos_\d{4}-\d{2}_001\.jpg$/);
});

test('normalizes extension without a leading dot', () => {
    const name = buildSeoFileName('p', 12, 'png');
    assert.match(name, /_012\.png$/);
});

test('handles missing extension', () => {
    const name = buildSeoFileName('p', 3, '');
    assert.match(name, /_003$/);
    assert.ok(!name.endsWith('.'));
});
