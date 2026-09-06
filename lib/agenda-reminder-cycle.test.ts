import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runReminderCycle, type ReminderCycleDependencies } from './am-scheduler/reminder-cycle';
import { createAndSendSurvey } from './am-scheduler/notification-service';
import { sendNotification } from './am-scheduler/notification-service';

const now = new Date('2026-09-06T15:00:00Z');
const candidate = { id: 'apt', patient_id: 'patient', doctor_id: 'doctor', type: 'consulta',
  status: 'confirmed', start_time: '2026-09-06T13:00:00Z', end_time: '2026-09-06T14:00:00Z',
  patient: { nombre: 'Test', apellido: 'Patient', whatsapp: '123', email: 'test@example.invalid' },
  doctor: { full_name: 'Doctor' } };
const survey = { appointment_id: 'apt', patient_name: 'Test', patient_phone: '123', patient_email: null, doctor_name: null };
const reminder = { ...survey, rule_id: 'rule', template_key: 'reminder_24h', channel: 'whatsapp' as const,
  patient_whatsapp: '456', start_time: candidate.start_time, end_time: candidate.end_time, appointment_type: 'consulta' };

function fixture({ dryRows = true, claimed = true, failure = false } = {}) {
  const calls: string[] = [];
  const contexts: Parameters<ReminderCycleDependencies['sendNotification']>[0][] = [];
  const db = {
    rpc: async (name: string) => ({ data: name === 'get_pending_reminders' ? [reminder, reminder] : [survey], error: null }),
    from: () => {
      let update = false;
      const builder = new Proxy({}, { get: (_, key) => {
        if (key === 'then') return (resolve: (v: unknown) => void) => resolve({
          data: update ? (claimed ? [{ id: 'apt' }] : []) : (dryRows ? [candidate] : []), error: null,
        });
        return () => { if (key === 'update') { update = true; calls.push('update'); } return builder; };
      }});
      return builder;
    },
  } as unknown as SupabaseClient;
  const deps: ReminderCycleDependencies = { supabase: db,
    sendNotification: async ctx => { calls.push('reminder'); contexts.push(ctx); return { success: true }; },
    createAndSendSurvey: async () => { calls.push('survey'); return { success: !failure }; },
    createRecalls: async () => { calls.push('recall'); },
  };
  return { calls, deps, contexts };
}

test('dry-run reads every queue without updating, sending or creating recalls', async () => {
  const f = fixture();
  const result = await runReminderCycle(f.deps, { dryRun: true, now });
  assert.deepEqual(f.calls, []);
  assert.equal(result.autoCompleted.length, 1);
  assert.equal(result.dispatched.length, 2);
});

test('one cycle sends reminder with deployed RPC phone and completes/surveys once', async () => {
  const f = fixture();
  const result = await runReminderCycle(f.deps, { now });
  assert.deepEqual(f.calls, ['reminder', 'update', 'recall', 'survey']);
  assert.equal(f.contexts[0].patientPhone, '456');
  assert.match(f.contexts[0].idempotencyKey!, /^reminder-apt-rule-/);
  assert.equal(result.surveys, 1);
  assert.deepEqual(result.failed, []);
});

test('lost completion race does not generate recalls', async () => {
  const f = fixture({ claimed: false });
  await runReminderCycle(f.deps, { now });
  assert.equal(f.calls.includes('recall'), false);
});

test('failed delivery is counted as failure and is not attempted twice within cycle', async () => {
  const f = fixture({ failure: true });
  const result = await runReminderCycle(f.deps, { now });
  assert.deepEqual(result.failed, ['survey:apt']);
  assert.equal(f.calls.filter(c => c === 'survey').length, 1);
});

test('RPC failure remains visible while other phases can finish', async () => {
  const f = fixture();
  f.deps.supabase.rpc = (async () => ({ data: null, error: { message: 'sensitive-error' } })) as never;
  const result = await runReminderCycle(f.deps, { now });
  assert.deepEqual(result.failed, ['reminder-query', 'survey-query']);
  assert.equal(JSON.stringify(result).includes('sensitive-error'), false);
});

test('a reminder failure is deferred to the next cycle instead of retried immediately', async () => {
  const failedRow = {
    appointment_id: 'apt', rule_id: 'rule', channel: 'whatsapp', recipient_email: null,
    recipient_phone: '456', template_key: 'reminder_24h',
    payload: { patientName: 'Test', startTime: candidate.start_time, endTime: candidate.end_time,
      appointmentType: 'consulta', idempotencyKey: 'stable-key' },
  };
  let reminderAttempts = 0;
  const db = {
    rpc: async (name: string) => ({ data: name === 'get_pending_reminders' ? [reminder] : [], error: null }),
    from: (table: string) => {
      const rows = table === 'notification_logs' ? [failedRow] : [];
      const builder = new Proxy({}, { get: (_, key) => {
        if (key === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null }));
        return () => builder;
      }});
      return builder;
    },
  } as unknown as SupabaseClient;
  const result = await runReminderCycle({
    supabase: db,
    sendNotification: async () => { reminderAttempts++; return { success: false }; },
    createAndSendSurvey: async () => ({ success: true }),
    createRecalls: async () => {},
  }, { now });
  assert.equal(reminderAttempts, 1);
  assert.deepEqual(result.failed, ['reminder:apt:rule']);
});

function surveyFixture({ sent = false, success = true } = {}) {
  const writes: string[] = [];
  const contexts: Parameters<ReminderCycleDependencies['sendNotification']>[0][] = [];
  const db = { from: (table: string) => {
    const builder = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return (resolve: (v: unknown) => void) => resolve({
        data: table === 'satisfaction_surveys' ? { token: 'stable-token' }
          : { patient_id: 'patient', type: 'limpieza', survey_sent_at: sent ? now.toISOString() : null },
        count: 2, error: null,
      });
      return () => { if (key === 'update' || key === 'insert') {
        writes.push(`${table}:${String(key)}`);
      } return builder; };
    }});
    return builder;
  }} as unknown as SupabaseClient;
  return { writes, contexts, deps: { createAdminClient: () => db,
    sendNotification: async (ctx: Parameters<ReminderCycleDependencies['sendNotification']>[0]) => {
      contexts.push(ctx); return { success };
    },
  }};
}

test('failed survey delivery reuses token and never marks appointment sent', async () => {
  const f = surveyFixture({ success: false });
  const result = await createAndSendSurvey('apt', 'patient', 'Test', null, 'test@example.invalid', null, 'limpieza', f.deps);
  assert.equal(result.success, false);
  assert.deepEqual(f.writes, []);
  assert.equal(f.contexts[0].surveyToken, 'stable-token');
  assert.equal(f.contexts[0].idempotencyKey, 'survey-apt');
});

test('successful survey delivery marks appointment and survey after sending', async () => {
  const f = surveyFixture();
  const result = await createAndSendSurvey('apt', 'patient', 'Test', null, 'test@example.invalid', null, 'limpieza', f.deps);
  assert.equal(result.success, true);
  assert.deepEqual(f.writes, ['agenda_appointments:update', 'satisfaction_surveys:update']);
});

test('already sent survey does not send again even with full appointment parameters', async () => {
  const f = surveyFixture({ sent: true });
  await createAndSendSurvey('apt', 'patient', 'Test', null, 'test@example.invalid', null, 'limpieza', f.deps);
  assert.deepEqual(f.contexts, []);
  assert.deepEqual(f.writes, []);
});

test('a failed survey attempt is recovered on the next fifteen-minute cycle', async () => {
  let agendaQueries = 0;
  let attempts = 0;
  const retryCandidate = { ...candidate, status: 'completed', satisfaction_surveys: [{ id: 'survey', sent_at: null }] };
  const db = {
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const rows = table === 'notification_logs' ? []
        : agendaQueries++ % 2 === 0 ? [] : [retryCandidate];
      const builder = new Proxy({}, { get: (_, key) => {
        if (key === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null }));
        return () => builder;
      }});
      return builder;
    },
  } as unknown as SupabaseClient;
  const deps: ReminderCycleDependencies = {
    supabase: db,
    sendNotification: async () => ({ success: true }),
    createAndSendSurvey: async () => ({ success: ++attempts > 1 }),
    createRecalls: async () => {},
  };
  const first = await runReminderCycle(deps, { now });
  const second = await runReminderCycle(deps, { now: new Date(now.getTime() + 15 * 60_000) });
  assert.deepEqual(first.failed, ['survey:apt']);
  assert.deepEqual(second.failed, []);
  assert.equal(attempts, 2);
});

function notificationDb(options: { updateError?: boolean; reservationError?: boolean } = {}) {
  const history = [{ channel: 'email', status: 'sent', payload: { idempotencyKey: 'key' }, provider_id: 'email-id' }];
  return {
    from: () => {
      let operation: 'history' | 'reserve' | 'update' = 'history';
      const builder = new Proxy({}, { get: (_, key) => {
        if (key === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(
          operation === 'update'
            ? { data: null, error: options.updateError ? { message: 'write failed' } : null }
            : { data: history, error: null },
        ));
        if (key === 'insert') return () => { operation = 'reserve'; return builder; };
        if (key === 'update') return () => { operation = 'update'; return builder; };
        if (key === 'single') return () => Promise.resolve(options.reservationError
          ? { data: null, error: { message: 'reserve failed' } }
          : { data: { id: 'log-id' }, error: null });
        return () => builder;
      }});
      return builder;
    },
  };
}

test('partial both-channel delivery retries only the missing channel and stays failed when it fails', async () => {
  let emailCalls = 0;
  let whatsappCalls = 0;
  const result = await sendNotification({
    appointmentId: 'apt', ruleId: 'rule', templateKey: 'reminder_24h', channel: 'both',
    patientName: 'Paciente', patientEmail: 'test@example.invalid', patientPhone: '123',
    doctorName: null, startTime: now.toISOString(), endTime: now.toISOString(), idempotencyKey: 'key',
  }, {
    createAdminClient: () => notificationDb() as never,
    sendEmail: async () => { emailCalls++; return { success: true }; },
    sendWhatsApp: async () => { whatsappCalls++; return { success: false, error: 'provider failed' }; },
  });
  assert.equal(result.success, false);
  assert.equal(result.emailId, 'email-id');
  assert.equal(emailCalls, 0);
  assert.equal(whatsappCalls, 1);
});

test('a missing or failed delivery log prevents an untracked provider send', async () => {
  let providerCalls = 0;
  const context = {
    appointmentId: 'apt', templateKey: 'survey_post_appointment', channel: 'email' as const,
    patientName: 'Paciente', patientEmail: 'test@example.invalid', patientPhone: null,
    doctorName: null, startTime: now.toISOString(), endTime: now.toISOString(), idempotencyKey: 'new-key',
  };
  const dependency = (db: ReturnType<typeof notificationDb>) => ({
    createAdminClient: () => db as never,
    sendEmail: async () => { providerCalls++; return { success: true, id: 'provider-id' }; },
    sendWhatsApp: async () => ({ success: true }),
  });
  const reservationFailure = await sendNotification(context, dependency(notificationDb({ reservationError: true })));
  assert.equal(reservationFailure.success, false);
  assert.equal(providerCalls, 0);
  const updateFailure = await sendNotification(context, dependency(notificationDb({ updateError: true })));
  assert.equal(updateFailure.success, false);
  assert.equal(providerCalls, 1);
});
