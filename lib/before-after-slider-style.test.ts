import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/patients/drive/BeforeAfterSlider.tsx', import.meta.url),
    'utf8',
);

test('before/after comparison uses the clinic minimalist white divider', () => {
    assert.match(source, /w-px bg-white\/85/);
    assert.match(source, /Minimal divider/);
    assert.doesNotMatch(source, /purple/);
    assert.doesNotMatch(source, />\s*↔\s*</);
});

test('before and after labels remain legible without introducing a brand color', () => {
    assert.match(source, />ANTES<\/div>/);
    assert.match(source, />DESPUÉS<\/div>/);
    assert.match(source, /border-white\/15 bg-black\/35/);
});
