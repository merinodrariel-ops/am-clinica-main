import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/patients/drive/PhotoStudioModal.tsx'),
  'utf8'
);

test('Smile Design save compresses the complete payload below the function transport limit', () => {
  assert.match(source, /MAX_SMILE_SAVE_PAYLOAD_CHARS = 3_600_000/);
  assert.match(source, /prepareSmileDesignSavePayload/);
  assert.match(source, /afterMime: 'image\/jpeg'/);
  assert.match(source, /payloadChars <= MAX_SMILE_SAVE_PAYLOAD_CHARS/);
});

test('Smile Design save reports the real preparation or server-action error', () => {
  assert.match(source, /No se pudo guardar el Smile Design: \$\{message\}/);
  assert.doesNotMatch(source, /toast\.error\("Error al generar imágenes del Smile Design"/);
});

test('Smile Design save moves the final result to Selección after portal persistence', () => {
  assert.match(
    source,
    /syncEditedPhotosToSelectionAction\(\s*folderId,\s*\[saveResult\.driveFileId\]\s*\)/
  );
  assert.match(source, /Smile Design guardado en el portal y en Selección/);
  assert.match(source, /guardado en el portal, pero no pudo pasar a Selección/);
});
