import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadDashboardStats } from './dashboard-queries';
import { loadTodayWork } from './today-work';

function fixture(failTable?: string) {
    const requests: URL[] = [];
    const client = createClient('https://clinic.example.invalid', 'fixture-key', {
        auth: { persistSession: false },
        global: { fetch: async (input, init) => {
            const url = new URL(String(input));
            requests.push(url);
            const table = url.pathname.split('/').at(-1);
            if (table === failTable) return Response.json({ message: 'offline' }, { status: 400 });
            const isHead = init?.method === 'HEAD';
            if (isHead) return new Response(null, { headers: { 'content-range': '0-6/7' } });
            if (table === 'sucursales') return Response.json([{ id: 'branch', nombre: 'Madero', moneda_local: 'ARS' }]);
            if (table === 'caja_saldo_fisico') return Response.json({ activa: true, ars: 12000, usd: 125 });
            return Response.json([{ usd_equivalente: '100.50' }, { usd_equivalente: 24.5 }]);
        } },
    });
    return { client, requests };
}

test('dashboard keeps physical currencies separate and calculates totals with bounded Argentine ranges', async () => {
    const f = fixture();
    const stats = await loadDashboardStats(f.client, new Date('2026-09-01T02:00:00Z'));
    assert.equal(stats.todayIncome, 125);
    assert.equal(stats.monthIncome, 125);
    assert.deepEqual(stats.adminCash, { ars: 12000, usd: 125 });
    assert.equal(stats.patientsCount, 7);
    const agenda = f.requests.filter(url => url.pathname.endsWith('agenda_appointments'));
    assert.deepEqual(agenda[0].searchParams.getAll('start_time'), ['gte.2026-08-01T00:00:00-03:00', 'lt.2026-09-01T00:00:00-03:00']);
    assert.equal(f.requests.some(url => url.pathname.endsWith('caja_admin_arqueos')), false);
});

test('database failure is not silently converted into a zero balance', async () => {
    await assert.rejects(() => loadDashboardStats(fixture('caja_saldo_fisico').client));
});

test('pending work only queries permitted modules and differentiates errors from zero', async () => {
    const f = fixture();
    assert.deepEqual(await loadTodayWork(f.client, { todos: false, recalls: false }), { todos: null, recalls: null });
    assert.equal(f.requests.length, 0);
    const counts = await loadTodayWork(f.client, { todos: true, recalls: false }, new Date('2026-09-01T02:00:00Z'));
    assert.deepEqual(counts, { todos: 7, recalls: null });
    assert.equal(f.requests[0].searchParams.get('due_date'), 'lte.2026-08-31');
    const failed = await loadTodayWork(fixture('todos').client, { todos: true, recalls: false });
    assert.equal(failed.todos, null);
});
