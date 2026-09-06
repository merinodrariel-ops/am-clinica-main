import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from './agenda-form-policy';

const compiled = ts.transpileModule(readFileSync('app/actions/agenda.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const responsible = '123e4567-e89b-42d3-a456-426614174000';
const attendee = '223e4567-e89b-42d3-a456-426614174000';
const clinical = { id: 'appointment', type: 'consulta', patient_id: 'patient', doctor_id: responsible, start_time: '2026-09-05T10:00:00-03:00', end_time: '2026-09-05T11:00:00-03:00', status: 'confirmed' };

type Result = { success: boolean; error?: string };
function loadActions(current = clinical) {
    const writes: { table: string; operation: string; payload?: unknown }[] = [];
    const selections: string[] = [];
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'staff' } } }) },
        from(table: string) {
            const data = () => table === 'profiles' ? { categoria: 'admin' }
                : table === 'agenda_meeting_participants' ? [{ profile_id: responsible }, { profile_id: attendee }]
                    : current;
            return {
                select(fields: string) { selections.push(`${table}:${fields}`); return this; },
                eq() { return this; },
                insert(payload: unknown) { writes.push({ table, operation: 'insert', payload }); return this; },
                update(payload: unknown) { writes.push({ table, operation: 'update', payload }); return this; },
                delete() { writes.push({ table, operation: 'delete' }); return this; },
                single: async () => ({ data: data(), error: null }),
                maybeSingle: async () => ({ data: data(), error: null }),
                then(resolve: (result: unknown) => unknown) { return Promise.resolve(resolve({ data: data(), error: null })); },
            };
        },
    };
    const dependencies: Record<string, unknown> = {
        '@/utils/supabase/server': { createClient: async () => client },
        '@supabase/supabase-js': { createClient: () => client },
        'next/cache': { revalidatePath() {} },
        '@/lib/agenda-form-policy': policy,
        '@/lib/agenda-appointment-meta': { normalizeAppointmentModality: (value: unknown) => value || 'presencial' },
        '@/lib/email-service': {}, '@/lib/patient-access': {}, '@/lib/patient-search': {},
        '@/lib/am-scheduler/google-calendar-outbound': { createGoogleEvent: async () => {}, updateGoogleEvent: async () => {} },
        '@/lib/am-scheduler/notification-service': { sendNotification: async () => { throw new Error('Unexpected notification'); } },
    };
    const exports = {} as { createAppointment: (form: FormData) => Promise<Result>; updateAppointment: (id: string, update: Record<string, unknown>) => Promise<Result> };
    vm.runInNewContext(compiled, { exports, require: (id: string) => {
        if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
        return dependencies[id];
    }, process: { env: {} }, console: { log() {}, error() {}, warn() {} } });
    return { ...exports, writes, selections };
}

function creationForm(overrides: Record<string, string | undefined> = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: 'Fixture', type: 'consulta', patientId: 'patient', doctorId: responsible, startTime: clinical.start_time, endTime: clinical.end_time, ...overrides })) form.set(key, value ?? '');
    return form;
}

test('create action validates before DB writes and preserves valid clinical creation', async () => {
    for (const overrides of [{ patientId: '' }, { endTime: clinical.start_time }, { startTime: 'invalid' }, { type: 'reunion', patientId: '', doctorId: '' }]) {
        const actions = loadActions();
        assert.equal((await actions.createAppointment(creationForm(overrides))).success, false);
        assert.equal(actions.writes.length, 0);
    }
    const actions = loadActions();
    assert.equal((await actions.createAppointment(creationForm())).success, true);
    assert.equal(actions.writes[0].table, 'agenda_appointments');
    assert.equal(actions.writes[0].operation, 'insert');
});

test('partial action updates validate stored dates and patient when needed', async () => {
    const actions = loadActions();
    assert.equal((await actions.updateAppointment('appointment', { start_time: '2026-09-05T12:00:00-03:00' })).success, false);
    assert.equal(actions.writes.length, 0);
    assert.ok(actions.selections.some(selection => selection.endsWith('type, patient_id, doctor_id, start_time, end_time')));
    const meeting = loadActions({ ...clinical, type: 'reunion', patient_id: '' });
    assert.equal((await meeting.updateAppointment('appointment', { type: 'consulta' })).success, false);
    assert.equal(meeting.writes.length, 0);
});

test('partial meeting update preserves stored responsible and participants', async () => {
    const actions = loadActions({ ...clinical, type: 'reunion', patient_id: '' });
    assert.equal((await actions.updateAppointment('appointment', { type: 'reunion' })).success, true);
    const roster = actions.writes.find(write => write.table === 'agenda_meeting_participants' && write.operation === 'insert');
    assert.deepEqual(JSON.parse(JSON.stringify(roster?.payload)), [
        { appointment_id: 'appointment', profile_id: responsible },
        { appointment_id: 'appointment', profile_id: attendee },
    ]);
});

test('cancellation action tolerates legacy missing patient and avoids policy-state query', async () => {
    const actions = loadActions({ ...clinical, patient_id: '', start_time: '', end_time: '' });
    assert.equal((await actions.updateAppointment('appointment', { status: 'cancelled' })).success, true);
    assert.equal(actions.writes.filter(write => write.table === 'agenda_appointments' && write.operation === 'update').length, 1);
    assert.equal(actions.selections.some(selection => selection.endsWith('type, patient_id, doctor_id, start_time, end_time')), false);
});
