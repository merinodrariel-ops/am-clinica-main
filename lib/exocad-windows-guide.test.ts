import test from 'node:test';
import assert from 'node:assert/strict';

import { EXOCAD_WINDOWS_GUIDE } from './exocad-windows-guide';

test('ExoCAD guide is explicitly Windows-only and documents the verified local-save workflow', () => {
    assert.equal(EXOCAD_WINDOWS_GUIDE.windowsOnly, true);
    assert.match(
        EXOCAD_WINDOWS_GUIDE.technicalNotes.join('\n'),
        /hashes SHA-256.*respalda.*archivos modificados/i,
        'the guide should explain how modified project files are verified'
    );
});

test('ExoCAD guide avoids editing the project directly on the streamed Drive mount', () => {
    const technicalNotes = EXOCAD_WINDOWS_GUIDE.technicalNotes.join('\n');

    assert.match(
        technicalNotes,
        /copia local completa.*evita editar directamente.*unidad virtual/i,
        'the guide should document the local workspace boundary'
    );
});
