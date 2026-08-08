import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routeSource = readFileSync('app/api/smile-design/motion/route.ts', 'utf8');
const hookSource = readFileSync('hooks/useSmileMotion.ts', 'utf8');
const modalSource = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');
const actionSource = readFileSync('app/actions/smile-design.ts', 'utf8');

test('Smile Motion uses one low-cost Google Veo Lite generation from the after image', () => {
  assert.match(routeSource, /veo-3\.1-lite-generate-preview/);
  assert.match(routeSource, /image: \{ imageBytes: afterBase64, mimeType \}/);
  assert.match(routeSource, /numberOfVideos: 1/);
  assert.match(routeSource, /durationSeconds: 4/);
  assert.doesNotMatch(routeSource, /FAL_KEY|fal\.subscribe|beforeBase64/);
});

test('video generation is asynchronous and survives a serverless request timeout', () => {
  assert.match(routeSource, /operationName: operation\.name/);
  assert.match(routeSource, /export async function PUT/);
  assert.match(hookSource, /method: 'PUT'/);
  assert.match(hookSource, /MAX_POLL_ATTEMPTS = 42/);
});

test('video endpoints require an authorized patient Drive role', () => {
  assert.match(routeSource, /authorizedActor/);
  assert.match(routeSource, /canManagePatientDrive/);
  assert.match(routeSource, /Sin permiso para generar videos de pacientes/);
});

test('Photo Studio generates and saves only the after video', () => {
  const generateStart = modalSource.indexOf('onGenerateMotion={async');
  const generateEnd = modalSource.indexOf('onSaveMotion={async', generateStart);
  const saveEnd = modalSource.indexOf('motionState={smileMotion.state}', generateEnd);
  const motionBlock = modalSource.slice(generateStart, saveEnd);

  assert.match(motionBlock, /smileDesign\.result\.afterDataUrl/);
  assert.doesNotMatch(motionBlock, /beforeVideoUrl|motion_antes/);
  assert.match(motionBlock, /saveSmileMotionVideo/);
  assert.match(actionSource, /uploadFileToFolder\(folderId, fileName, videoBytes, 'video\/mp4'\)/);
});
