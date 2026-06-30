import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const admissionActionSource = readFileSync(
    join(process.cwd(), 'app/actions/admission.ts'),
    'utf8'
);
const googleDriveSource = readFileSync(
    join(process.cwd(), 'lib/google-drive.ts'),
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
    assert.match(
        admissionActionSource,
        /ensureStandardPatientFolders/,
        'admission should still prepare the patient root Drive folder'
    );
});

test('legacy patient document generation stays disabled', () => {
    assert.match(
        googleDriveSource,
        /Deshabilitado: las admisiones ya no generan presentaciones base de pacientes/,
        'legacy patient document generation should return a disabled response'
    );
    assert.doesNotMatch(
        googleDriveSource,
        /Plantilla Ficha\/Presentacion|Plantilla Presupuesto|Ficha - \$\{|Presupuesto - \$\{/,
        'Drive utilities should not keep the old patient presentation template-copy path'
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
