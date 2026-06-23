import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const admissionActionSource = readFileSync(
    join(process.cwd(), 'app/actions/admission.ts'),
    'utf8'
);
const clinicalWorkflowsSource = readFileSync(
    join(process.cwd(), 'app/actions/clinical-workflows.ts'),
    'utf8'
);

test('admission only prepares the patient root Drive folder', () => {
    assert.doesNotMatch(
        admissionActionSource,
        /createPatientDocuments/,
        'admission should not generate Google Slides or presentation documents'
    );
    assert.doesNotMatch(
        admissionActionSource,
        /link_google_slides:\s*docResult/,
        'admission should not save an auto-generated presentation link'
    );
});

test('clinical workflows only create ExoCAD folders on demand', () => {
    assert.doesNotMatch(
        clinicalWorkflowsSource,
        /createWorkflowFolder/,
        'non-ExoCAD treatments should not create Drive subfolders'
    );
    assert.match(
        clinicalWorkflowsSource,
        /ensureExocadHtmlFolder/,
        'ExoCAD folder creation should remain available for digital design workflows'
    );
});
