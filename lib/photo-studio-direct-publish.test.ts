import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');

test('Photo Studio sends selected photos to the direct web publisher', () => {
    assert.match(source, /import PublicCasePublishModal from '\.\/PublicCasePublishModal';/);
    assert.match(source, /onClick=\{\(\) => setShowCasePublishModal\(true\)\}/);
    assert.match(source, /<PublicCasePublishModal[\s\S]*files=\{imageFiles\.filter\(item => selectedIds\.has\(item\.id\)\)\}/);
});

test('the Photo Studio web action does not download WebP files', () => {
    assert.doesNotMatch(source, /handleWebDownload/);
    assert.doesNotMatch(source, /descargada'} para web/);
});
