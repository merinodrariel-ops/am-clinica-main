import assert from 'node:assert/strict';
import {
    ALLOWED_JOB_APPLICATION_MIME_TYPES,
    MAX_JOB_APPLICATION_FILE_BYTES,
    findRecentDuplicateJobApplication,
    groupJobApplicationsByCandidate,
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

const duplicateRow = findRecentDuplicateJobApplication(
    [
        {
            id: 'latest',
            created_at: '2026-06-29T02:57:12.477Z',
            email: 'emiboca72@gmail.com',
            full_name: 'Emilio Vallejos',
            area: 'Asistente Dental',
        },
        {
            id: 'other-area',
            created_at: '2026-06-29T02:55:00.000Z',
            email: 'emiboca72@gmail.com',
            full_name: 'Emilio Vallejos',
            area: 'Recepción - Secretaría',
        },
    ],
    {
        email: 'EMIBOCA72@gmail.com',
        fullName: '  Emilio   Vallejos ',
        area: 'Asistente Dental',
    },
    new Date('2026-06-29T02:57:15.383Z'),
);

assert.equal(duplicateRow?.id, 'latest');

assert.equal(
    findRecentDuplicateJobApplication(
        [
            {
                id: 'old',
                created_at: '2026-06-29T02:30:00.000Z',
                email: 'emiboca72@gmail.com',
                full_name: 'Emilio Vallejos',
                area: 'Asistente Dental',
            },
        ],
        {
            email: 'emiboca72@gmail.com',
            fullName: 'Emilio Vallejos',
            area: 'Asistente Dental',
        },
        new Date('2026-06-29T02:57:15.383Z'),
    ),
    null,
);

const grouped = groupJobApplicationsByCandidate([
    {
        id: 'fresh',
        created_at: '2026-06-29T02:57:15.383Z',
        email: 'emiboca72@gmail.com',
        full_name: 'Emilio Vallejos',
        area: 'Asistente Dental',
    },
    {
        id: 'dupe',
        created_at: '2026-06-29T02:57:09.518Z',
        email: 'emiboca72@gmail.com',
        full_name: 'Emilio Vallejos',
        area: 'Asistente Dental',
    },
    {
        id: 'different-area',
        created_at: '2026-06-29T02:56:00.000Z',
        email: 'emiboca72@gmail.com',
        full_name: 'Emilio Vallejos',
        area: 'Recepción - Secretaría',
    },
]);

assert.deepEqual(
    grouped.map((row) => row.id),
    ['fresh'],
);

assert.deepEqual(
    grouped[0]?.applications.map((application) => ({
        id: application.id,
        area: application.area,
        isDuplicate: application.isDuplicate,
    })),
    [
        { id: 'fresh', area: 'Asistente Dental', isDuplicate: false },
        { id: 'different-area', area: 'Recepción - Secretaría', isDuplicate: false },
        { id: 'dupe', area: 'Asistente Dental', isDuplicate: true },
    ],
);

assert.ok(ALLOWED_JOB_APPLICATION_MIME_TYPES.includes('application/pdf'));
console.log('job-applications.spec.ts: ok');
