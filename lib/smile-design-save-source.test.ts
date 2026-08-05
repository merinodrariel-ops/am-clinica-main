import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/patients/drive/PhotoStudioModal.tsx'),
  'utf8'
);
const actionSource = fs.readFileSync(
  path.join(process.cwd(), 'app/actions/smile-design.ts'),
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

test('Smile Design save moves the result and minimal before/after slice to Selección after portal persistence', () => {
  assert.match(actionSource, /beforeAfterDriveUpload\.success/);
  assert.match(actionSource, /beforeAfterDriveFileId = beforeAfterDriveUpload\.fileId/);
  assert.match(actionSource, /driveFileId,\s*beforeAfterDriveFileId,/);
  assert.match(
    source,
    /saveResult\.driveFileId,\s*saveResult\.beforeAfterDriveFileId/
  );
  assert.match(source, /selectionFilesComplete = selectionDriveFileIds\.length === 2/);
  assert.match(source, /syncEditedPhotosToSelectionAction\(\s*folderId,\s*selectionDriveFileIds\s*\)/);
  assert.match(source, /Resultado y antes\/después guardados en el portal y en Selección/);
  assert.match(source, /guardado en el portal, pero no pudo pasar a Selección/);
});

test('saved before/after uses the visible divider position and contains no purple handle', () => {
  assert.match(source, /prepareSmileDesignSavePayload\([\s\S]*?slicePosRef\.current/);
  assert.match(source, /slicePos: prepared\.slicePos/);
  assert.match(source, /rgba\(255,255,255,0\.88\)/);
  assert.doesNotMatch(source, /rgba\(168,85,247/);
  assert.doesNotMatch(source, /ctx\.arc\(cx, cy, r/);
});
