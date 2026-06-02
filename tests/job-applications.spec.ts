import assert from 'node:assert/strict';
import {
    ALLOWED_JOB_APPLICATION_MIME_TYPES,
    MAX_JOB_APPLICATION_FILE_BYTES,
    sanitizeJobApplicationFileName,
    validateJobApplicationFile,
} from '../lib/job-applications';

assert.equal(sanitizeJobApplicationFileName('../../CV Ariel Merino.pdf'), 'CV-Ariel-Merino.pdf');
assert.equal(sanitizeJobApplicationFileName('mi cv final.docx'), 'mi-cv-final.docx');

assert.equal(validateJobApplicationFile({
    name: 'cv.pdf',
    type: 'application/pdf',
    size: 1000,
}).ok, true);

assert.equal(validateJobApplicationFile({
    name: 'cv.exe',
    type: 'application/x-msdownload',
    size: 1000,
}).ok, false);

assert.equal(validateJobApplicationFile({
    name: 'cv.pdf',
    type: 'application/pdf',
    size: MAX_JOB_APPLICATION_FILE_BYTES + 1,
}).ok, false);

assert.ok(ALLOWED_JOB_APPLICATION_MIME_TYPES.includes('application/pdf'));
console.log('job-applications.spec.ts: ok');
