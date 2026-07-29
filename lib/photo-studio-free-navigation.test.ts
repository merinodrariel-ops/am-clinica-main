import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/patients/drive/PhotoStudioModal.tsx', import.meta.url),
    'utf8',
);

const switchStart = source.indexOf('async function handleSwitchFile');
const switchEnd = source.indexOf('function clearMultiSelection', switchStart);
const switchSource = source.slice(switchStart, switchEnd);

test('photo navigation autosaves without forcing the export dialog', () => {
    assert.doesNotMatch(switchSource, /setSaveDialogOpen\(true\)/);
    assert.doesNotMatch(switchSource, /if \(isDirty/);
    assert.match(switchSource, /normalizeFileEditState\(latestPhotoStateRef\.current\)/);
    assert.match(switchSource, /flushPhotoStateSave\(\{ fileId: activeFile\.id, state: currentState \}\)/);
});

test('photo navigation restores the complete in-session visual draft', () => {
    assert.match(switchSource, /photoSessionStatesRef\.current\.set\(activeFile\.id/);
    assert.match(switchSource, /const sessionDraft = photoSessionStatesRef\.current\.get\(newFile\.id\)/);
    assert.match(switchSource, /setImageUrl\(sessionDraft\.imageUrl\)/);
    assert.match(switchSource, /setCurrentPoints\(sessionDraft\.currentPoints\)/);
});

test('the old mandatory-save navigation messages are removed', () => {
    assert.doesNotMatch(source, /Guardá la foto editada en Selección antes de cambiar a otra/);
    assert.doesNotMatch(source, /Guardá la foto editada en Selección antes de volver/);
});
