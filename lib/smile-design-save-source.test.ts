import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/patients/drive/PhotoStudioModal.tsx'),
  'utf8'
);
const saveSource = fs.readFileSync(path.join(process.cwd(), 'lib/photo-studio/smile-save.ts'), 'utf8');
const actionSource = fs.readFileSync(
  path.join(process.cwd(), 'app/actions/smile-design.ts'),
  'utf8'
);

test('Smile Design save compresses the complete payload below the function transport limit', () => {
  assert.match(saveSource, /MAX_SMILE_SAVE_PAYLOAD_CHARS = 3_600_000/);
  assert.match(source, /prepareSmileDesignSavePayload/);
  assert.match(saveSource, /afterMime: 'image\/jpeg'/);
  assert.match(saveSource, /payloadChars <= MAX_SMILE_SAVE_PAYLOAD_CHARS/);
});

test('Smile Design save reports the real preparation or server-action error', () => {
  assert.match(source, /No se pudo guardar el Smile Design: \$\{message\}/);
  assert.doesNotMatch(source, /toast\.error\("Error al generar imágenes del Smile Design"/);
});

test('Smile Design save moves the result and vertical comparison to Selección after portal persistence', () => {
  assert.match(actionSource, /comparisonDriveUpload\.success/);
  assert.match(actionSource, /beforeAfterDriveFileId = comparisonDriveUpload\.fileId/);
  assert.match(actionSource, /driveFileId,\s*beforeAfterDriveFileId,/);
  assert.match(
    source,
    /saveResult\.driveFileId,\s*saveResult\.beforeAfterDriveFileId/
  );
  assert.match(source, /selectionFilesComplete = selectionDriveFileIds\.length === 2/);
  assert.match(source, /syncEditedPhotosToSelectionAction\(\s*folderId,\s*selectionDriveFileIds\s*\)/);
  assert.match(source, /Resultado y comparativa vertical guardados en el portal y en Selección/);
  assert.match(source, /guardado en el portal, pero no pudo pasar a Selección/);
});

test('saved comparison is vertical and does not preserve an interactive divider', () => {
  assert.match(saveSource, /canvas\.height = sh \* 2/);
  assert.match(saveSource, /ctx\.drawImage\(imgBefore, 0, 0, sw, sh\)/);
  assert.match(saveSource, /ctx\.drawImage\(imgAfter, 0, sh, sw, sh\)/);
  assert.match(saveSource, /fillText\('ANTES'/);
  assert.match(saveSource, /fillText\('DESPUÉS'/);
  assert.doesNotMatch(saveSource, /generateSliceBase64/);
  assert.doesNotMatch(source, /BeforeAfterSlider/);
  assert.doesNotMatch(actionSource, /Smile Design - Antes -/);
  assert.doesNotMatch(actionSource, /file_type: 'photo_before'/);
});

test('patient portal never reconstructs the discarded before-after slider', () => {
  const portalSource = fs.readFileSync(
    path.join(process.cwd(), 'app/mi-clinica/[token]/page.tsx'),
    'utf8'
  );

  assert.doesNotMatch(portalSource, /function SmileSlider/);
  assert.doesNotMatch(portalSource, /cursor-ew-resize/);
  assert.match(portalSource, /antes y despu\[eé\]s/);
});
