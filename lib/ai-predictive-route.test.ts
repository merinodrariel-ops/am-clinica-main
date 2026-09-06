import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { aiPredictiveJsonSchema, parseAiPredictive } from './ai-predictive';

const report = { forecast: { nextMonthRevenue: 1000, confidence: 70, trend: 'stable' }, insights: [], recommendations: [] };
const source = ts.transpileModule(readFileSync('app/api/dashboard/predictive-pulse/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadRoute(options: { authenticated?: boolean; role?: string; queryError?: boolean; modelText?: string } = {}) {
    const calls = { admin: 0, model: 0, config: undefined as unknown };
    const profileQuery = { select() { return this; }, eq() { return this; }, single: async () => ({ data: { categoria: options.role }, error: null }) };
    const query = {
        select() { return this; }, eq() { return this; }, neq() { return this; }, gte() { return this; }, lt() { return this; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [], count: 0, error: options.queryError ? { message: 'offline' } : null })); },
    };
    const dependencies: Record<string, unknown> = {
        'next/server': { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200 }) } },
        '@google/genai': { GoogleGenAI: class { models = { generateContent: async (input: { config: unknown }) => { calls.model++; calls.config = input.config; return { text: options.modelText ?? JSON.stringify(report) }; } }; } },
        '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.authenticated ? { id: 'user' } : null } }) }, from: () => profileQuery }) },
        '@/utils/supabase/admin': { createAdminClient: () => { calls.admin++; return { from: () => query }; } },
        '@/lib/server-role-guard': { ADMIN_VIEW_ROLES: ['owner', 'admin', 'developer', 'partner_viewer'] },
        '@/lib/ai-models': { getAiModel: () => 'test-model' },
        '@/lib/ai-predictive': { aiPredictiveJsonSchema, parseAiPredictive },
    };
    const exports: { GET?: () => Promise<{ status: number; body: unknown }> } = {};
    vm.runInNewContext(source, { exports, require: (id: string) => {
        if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
        return dependencies[id];
    }, process: { env: { GEMINI_API_KEY: 'fake-test-key' } }, console: { log() {}, error() {} } });
    return { get: exports.GET!, calls };
}

test('predictive endpoint rejects anonymous and non-management users before admin queries or AI', async () => {
    const anonymous = loadRoute();
    assert.equal((await anonymous.get()).status, 401);
    assert.equal(anonymous.calls.admin, 0);
    for (const role of ['reception', 'odontologo', 'asistente', 'marketing', undefined]) {
        const denied = loadRoute({ authenticated: true, role });
        assert.equal((await denied.get()).status, 403);
        assert.equal(denied.calls.admin, 0);
        assert.equal(denied.calls.model, 0);
    }
});

test('predictive endpoint allows management profiles and validates structured model responses', async () => {
    for (const role of ['owner', 'admin', 'developer', 'partner_viewer']) {
        const route = loadRoute({ authenticated: true, role });
        const result = await route.get();
        assert.equal(result.status, 200);
        assert.equal(route.calls.model, 1);
        assert.equal((route.calls.config as { responseJsonSchema: unknown }).responseJsonSchema, aiPredictiveJsonSchema);
        assert.deepEqual((result.body as { analysis: unknown }).analysis, report);
    }
    const invalid = loadRoute({ authenticated: true, role: 'owner', modelText: '{}' });
    assert.equal((await invalid.get()).status, 500);
});

test('predictive endpoint fails on missing source data instead of presenting a zero-based forecast', async () => {
    const route = loadRoute({ authenticated: true, role: 'owner', queryError: true });
    assert.equal((await route.get()).status, 500);
    assert.equal(route.calls.model, 0);
});
