import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'components/patients/drive/PatientDriveTab.tsx'),
  'utf8'
);

test('the persisted cover id is forced to the first canonical photo position', () => {
  assert.match(source, /storedCover[\s\S]*?\[storedCover, \.\.\.saved\.filter/);
  assert.match(source, /getOrderedGridPhotos\(files, savedOrder, coverFileId\)/);
});

test('the first visible regular photo becomes the canonical cover even with selection photos', () => {
  assert.match(source, /nextCoverFileId = reorderedVisiblePhotos\[0\]/);
  assert.match(source, /\[reorderedVisiblePhotos\[0\], \.\.\.selectionPhotos, \.\.\.remainingPhotos\]/);
  assert.match(source, /saveFotosOrderAction\(patientId, motherFolderId, ids, nextCoverFileId\)/);
});

test('cover badges reflect the stored cover id instead of a section index', () => {
  const storedCoverBadges = source.match(/isPortada=\{file\.id === coverFileId\}/g) ?? [];
  assert.equal(storedCoverBadges.length, 2);
  assert.doesNotMatch(source, /isPortada=\{idx === 0\}/);
});
