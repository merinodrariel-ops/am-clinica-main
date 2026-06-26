import test from 'node:test';
import assert from 'node:assert/strict';

import { EXOCAD_WINDOWS_GUIDE } from './exocad-windows-guide';

test('ExoCAD guide is explicitly Windows-only and documents the recommended helper path', () => {
    assert.equal(EXOCAD_WINDOWS_GUIDE.windowsOnly, true);
    assert.match(
        EXOCAD_WINDOWS_GUIDE.technicalNotes.join('\n'),
        /CopyAndOpen\.exe/i,
        'the guide should point to the observed ExoCAD helper'
    );
});

test('ExoCAD guide explicitly rejects risky host or injektor scripts as the recommended path', () => {
    const technicalNotes = EXOCAD_WINDOWS_GUIDE.technicalNotes.join('\n');

    assert.match(
        technicalNotes,
        /No se deja como camino recomendado.*Host lock\.bat.*INSTALL service injektor\.cmd.*injektor\.exe/i,
        'the guide should explicitly reject the risky scripts'
    );
});
