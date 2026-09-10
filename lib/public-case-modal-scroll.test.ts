import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/patients/drive/PublicCasePublishModal.tsx'),
  'utf8'
);

test('public case modal provides an always reachable vertical scroll area', () => {
  assert.match(source, /className="modal-body [^"]*overflow-y-scroll/);
  assert.match(source, /overscroll-contain/);
  assert.match(source, /\[scrollbar-gutter:stable\]/);
});
