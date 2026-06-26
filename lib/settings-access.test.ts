import test from 'node:test';
import assert from 'node:assert/strict';

import { canAccessExocadGuide } from './settings-access';

test('ExoCAD guide is available for assistants and laboratory roles', () => {
    assert.equal(canAccessExocadGuide('asistente', false), true);
    assert.equal(canAccessExocadGuide('assistant', false), true);
    assert.equal(canAccessExocadGuide('laboratorio', false), true);
    assert.equal(canAccessExocadGuide('lab', false), true);
});

test('ExoCAD guide remains available for owner and admin roles', () => {
    assert.equal(canAccessExocadGuide('owner', false), true);
    assert.equal(canAccessExocadGuide('admin', false), true);
    assert.equal(canAccessExocadGuide('partner_viewer', true), true);
});

test('ExoCAD guide stays hidden for unrelated roles', () => {
    assert.equal(canAccessExocadGuide('reception', false), false);
    assert.equal(canAccessExocadGuide('odontologo', false), false);
    assert.equal(canAccessExocadGuide('partner_viewer', false), false);
    assert.equal(canAccessExocadGuide(null, false), false);
});
