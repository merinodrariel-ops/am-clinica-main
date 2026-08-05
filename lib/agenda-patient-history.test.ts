import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const actionSource = readFileSync('app/actions/agenda.ts', 'utf8');
const calendarSource = readFileSync('components/agenda/AgendaCalendar.tsx', 'utf8');
const panelSource = readFileSync('components/agenda/PatientAppointmentHistoryPanel.tsx', 'utf8');

test('patient history is authorized and queried by the selected patient id', () => {
    const start = actionSource.indexOf('export async function getPatientAppointmentHistory');
    const end = actionSource.indexOf('export async function getDoctors', start);
    const historyAction = actionSource.slice(start, end);

    assert.match(historyAction, /verifyPatientAppointmentHistoryAccess\(\)/);
    assert.match(historyAction, /\.eq\('patient_id', normalizedPatientId\)/);
    assert.match(historyAction, /\.order\('start_time', \{ ascending: false \}\)/);
    assert.match(historyAction, /\.range\(safeOffset, safeOffset \+ PATIENT_APPOINTMENT_HISTORY_PAGE_SIZE - 1\)/);
    assert.doesNotMatch(historyAction, /getAdminClient\(\)/);
});

test('patient lookup searches patient tokens instead of calendar titles', () => {
    const start = actionSource.indexOf('export async function searchPatients');
    const end = actionSource.indexOf('export type AgendaPatientSearchResult', start);
    const searchAction = actionSource.slice(start, end);

    assert.match(searchAction, /getPatientSearchTokens\(normalizedQuery\)/);
    assert.match(searchAction, /getPatientSearchCandidateTokens\(searchTokens\)/);
    assert.match(searchAction, /filterAndRankPatientSearchResults\(patients, normalizedQuery\)/);
    assert.match(searchAction, /full_name\.ilike/);
    assert.doesNotMatch(searchAction, /agenda_appointments/);
});

test('agenda exposes patient history and can jump to the exact appointment day', () => {
    assert.match(calendarSource, /Buscar paciente/);
    assert.match(calendarSource, /<PatientAppointmentHistoryPanel/);
    assert.match(calendarSource, /setPendingCalendarDate\(start\)/);
    assert.match(calendarSource, /changeView\('timeGridDay', pendingCalendarDate\)/);
    assert.match(calendarSource, /timeZone: 'America\/Argentina\/Buenos_Aires'/);
});

test('history panel separates upcoming and previous appointments and links patient files', () => {
    assert.match(panelSource, /Próximos turnos/);
    assert.match(panelSource, /Historial anterior/);
    assert.match(panelSource, /\?section=archivos/);
    assert.match(panelSource, /Cargar turnos anteriores/);
    assert.match(panelSource, /no se atribuye automáticamente/);
});
