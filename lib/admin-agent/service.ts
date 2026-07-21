import {
    assertAllowedOperator,
    buildCashSummary,
    buildCommandHelp,
    buildMonthWindow,
    buildPatientSearchPreview,
    parseAdminAgentCommand,
    type AdminAgentCommand,
    type CashMovementInput,
    type PatientPreviewInput,
} from './core';

export type SupabaseLike = {
    from: (table: string) => TableQuery;
};

type QueryError = {
    message: string;
};

type QueryResult<T = Record<string, unknown>> = {
    data: T[] | T | null;
    error: QueryError | null;
    count?: number | null;
};

type TableQuery<T = Record<string, unknown>> = {
    select: (columns: string, options?: Record<string, unknown>) => QueryBuilder<T>;
};

type QueryBuilder<T = Record<string, unknown>> = PromiseLike<QueryResult<T>> & {
    select: (columns: string, options?: Record<string, unknown>) => QueryBuilder<T>;
    eq: (column: string, value: unknown) => QueryBuilder<T>;
    ilike: (column: string, value: string) => QueryBuilder<T>;
    or: (filters: string) => QueryBuilder<T>;
    gte: (column: string, value: string) => QueryBuilder<T>;
    lt: (column: string, value: string) => QueryBuilder<T>;
    order: (column: string, options?: Record<string, unknown>) => QueryBuilder<T>;
    limit: (count: number) => QueryBuilder<T>;
    maybeSingle: () => PromiseLike<QueryResult<T>>;
};

type AgentContext = {
    supabase: SupabaseLike;
    operatorEmail: string;
    now?: Date;
};

type CommandResult = {
    command: AdminAgentCommand['kind'];
    generatedAt: string;
    operatorEmail: string;
    data: unknown;
};

type ProfileLookupRow = {
    email?: string | null;
    categoria?: string | null;
};

type AgendaRow = Record<string, unknown> & {
    id?: string;
    title?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    status?: string | null;
    type?: string | null;
    patient?: PersonJoin | PersonJoin[] | null;
    doctor?: PersonJoin | PersonJoin[] | null;
};

type PersonJoin = {
    nombre?: string | null;
    apellido?: string | null;
    full_name?: string | null;
};

function normalizeSearch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function asRows<T>(data: T[] | T | null): T[] {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
}

function escapeSupabaseSearchTerm(term: string): string {
    return term.replace(/[%_,]/g, '\\$&');
}

function patientSearchOr(query: string): string {
    const normalized = normalizeSearch(query);
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const terms = Array.from(new Set([normalized, ...tokens])).filter(Boolean);
    return terms.flatMap((term) => {
        const escaped = `%${escapeSupabaseSearchTerm(term)}%`;
        return [
            `apellido.ilike.${escaped}`,
            `nombre.ilike.${escaped}`,
            `email.ilike.${escaped}`,
            `documento.ilike.${escaped}`,
            `whatsapp.ilike.${escaped}`,
        ];
    }).join(',');
}

function startOfArgentinaToday(now: Date): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return new Date(`${year}-${month}-${day}T00:00:00.000-03:00`);
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

async function requireAllowedOperator(supabase: SupabaseLike, email: string) {
    if (!email) throw new Error('Missing AM_AGENT_OPERATOR_EMAIL');

    const { data, error } = await supabase
        .from('profiles')
        .select('email,categoria')
        .ilike('email', email)
        .maybeSingle();

    if (error) throw new Error(`Operator lookup failed: ${error.message}`);
    const profile = data as ProfileLookupRow | null;
    const operator = {
        email,
        categoria: profile?.categoria ?? null,
    };
    assertAllowedOperator(operator);
    return operator;
}

async function getOverview(ctx: AgentContext) {
    const now = ctx.now ?? new Date();
    const todayStart = startOfArgentinaToday(now);
    const tomorrowStart = addDays(todayStart, 1);
    const currentMonth = todayStart.toISOString().slice(0, 7);
    const month = buildMonthWindow(currentMonth);

    const [patientsRes, todayAgendaRes, monthReceptionRes, monthAdminRes] = await Promise.all([
        ctx.supabase
            .from('pacientes')
            .select('id_paciente', { count: 'exact', head: true })
            .eq('is_deleted', false),
        ctx.supabase
            .from('agenda_appointments')
            .select('id,status,start_time', { count: 'exact' })
            .gte('start_time', todayStart.toISOString())
            .lt('start_time', tomorrowStart.toISOString())
            .limit(200),
        ctx.supabase
            .from('caja_recepcion_movimientos')
            .select('estado,usd_equivalente')
            .gte('fecha_hora', month.startIso)
            .lt('fecha_hora', month.endIso)
            .eq('is_deleted', false)
            .limit(5000),
        ctx.supabase
            .from('caja_admin_movimientos')
            .select('estado,tipo_movimiento,usd_equivalente_total')
            .gte('fecha_movimiento', month.startIso)
            .lt('fecha_movimiento', month.endIso)
            .limit(5000),
    ]);

    for (const [label, result] of Object.entries({
        patients: patientsRes,
        todayAgenda: todayAgendaRes,
        monthReception: monthReceptionRes,
        monthAdmin: monthAdminRes,
    })) {
        if (result.error) throw new Error(`${label} query failed: ${result.error.message}`);
    }

    const cash = buildCashSummary(currentMonth, [
        ...((monthReceptionRes.data ?? []) as CashMovementInput[]).map((movement) => ({ ...movement, source: 'reception' as const })),
        ...((monthAdminRes.data ?? []) as CashMovementInput[]).map((movement) => ({ ...movement, source: 'admin' as const })),
    ]);

    return {
        patients: {
            activeCount: patientsRes.count ?? 0,
        },
        agenda: {
            todayCount: todayAgendaRes.count ?? (todayAgendaRes.data?.length ?? 0),
            todayByStatus: countBy(asRows(todayAgendaRes.data), 'status'),
        },
        cash,
    };
}

function countBy(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
    return rows.reduce<Record<string, number>>((acc, row) => {
        const value = String(row[key] ?? 'sin_estado');
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
    }, {});
}

function isMissingRelationError(message: string): boolean {
    return [
        "Could not find the table 'public.email_messages' in the schema cache",
        'relation "public.email_messages" does not exist',
        'does not exist',
    ].some((pattern) => message.includes(pattern));
}

async function getPatients(ctx: AgentContext, query: string) {
    const { data, error } = await ctx.supabase
        .from('pacientes')
        .select('id_paciente,nombre,apellido,email,whatsapp,estado_paciente,financ_estado')
        .eq('is_deleted', false)
        .or(patientSearchOr(query))
        .order('apellido', { ascending: true })
        .limit(20);

    if (error) throw new Error(`Patient search failed: ${error.message}`);

    const rows = asRows(data) as PatientPreviewInput[];
    return {
        query,
        count: rows.length,
        patients: buildPatientSearchPreview(rows),
    };
}

async function getAgenda(ctx: AgentContext, range: 'today' | 'week') {
    const now = ctx.now ?? new Date();
    const start = startOfArgentinaToday(now);
    const end = range === 'week' ? addDays(start, 7) : addDays(start, 1);

    const { data, error } = await ctx.supabase
        .from('agenda_appointments')
        .select('id,title,start_time,end_time,status,type,patient:patient_id(nombre,apellido),doctor:doctor_id(full_name)')
        .gte('start_time', start.toISOString())
        .lt('start_time', end.toISOString())
        .order('start_time', { ascending: true })
        .limit(range === 'week' ? 500 : 120);

    if (error) throw new Error(`Agenda query failed: ${error.message}`);

    const rows = asRows(data) as AgendaRow[];
    return {
        range,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        count: rows.length,
        byStatus: countBy(rows, 'status'),
        appointments: rows.slice(0, 30).map((row) => ({
            id: row.id,
            startTime: row.start_time,
            endTime: row.end_time,
            status: row.status,
            type: row.type,
            title: row.title,
            patientName: joinName(row.patient),
            doctorName: joinName(row.doctor, 'full_name'),
        })),
        truncated: rows.length > 30,
    };
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
}

function joinName(value: PersonJoin | PersonJoin[] | null | undefined, fullNameKey?: keyof PersonJoin): string | null {
    const row = firstJoin(value);
    if (!row) return null;
    if (fullNameKey) return row[fullNameKey] ?? null;
    return `${row.nombre ?? ''} ${row.apellido ?? ''}`.trim() || null;
}

async function getCash(ctx: AgentContext, targetMonth: string) {
    const month = buildMonthWindow(targetMonth);
    const [receptionRes, adminRes] = await Promise.all([
        ctx.supabase
            .from('caja_recepcion_movimientos')
            .select('estado,usd_equivalente')
            .gte('fecha_hora', month.startIso)
            .lt('fecha_hora', month.endIso)
            .eq('is_deleted', false)
            .limit(10000),
        ctx.supabase
            .from('caja_admin_movimientos')
            .select('estado,tipo_movimiento,usd_equivalente_total')
            .gte('fecha_movimiento', month.startIso)
            .lt('fecha_movimiento', month.endIso)
            .limit(10000),
    ]);

    if (receptionRes.error) throw new Error(`Reception cash query failed: ${receptionRes.error.message}`);
    if (adminRes.error) throw new Error(`Admin cash query failed: ${adminRes.error.message}`);

    return buildCashSummary(targetMonth, [
        ...((receptionRes.data ?? []) as CashMovementInput[]).map((movement) => ({ ...movement, source: 'reception' as const })),
        ...((adminRes.data ?? []) as CashMovementInput[]).map((movement) => ({ ...movement, source: 'admin' as const })),
    ]);
}

async function getEmails(ctx: AgentContext, days: number) {
    const since = new Date((ctx.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000);
    const { data, error } = await ctx.supabase
        .from('email_messages')
        .select('status,message_type,provider,created_at')
        .eq('direction', 'outbound')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);

    if (error && !isMissingRelationError(error.message)) {
        throw new Error(`Email messages query failed: ${error.message}`);
    }

    if (error) {
        const fallback = await ctx.supabase
            .from('notification_logs')
            .select('status,template_key,channel,sent_at,created_at')
            .eq('channel', 'email')
            .gte('sent_at', since.toISOString())
            .order('sent_at', { ascending: false })
            .limit(5000);

        if (fallback.error) throw new Error(`Notification logs fallback failed: ${fallback.error.message}`);

        const fallbackRows = asRows(fallback.data).map((row) => ({
            status: row.status,
            message_type: row.template_key,
            provider: 'notification_logs',
            created_at: row.sent_at ?? row.created_at,
        }));

        return {
            days,
            sinceIso: since.toISOString(),
            source: 'notification_logs',
            count: fallbackRows.length,
            byStatus: countBy(fallbackRows, 'status'),
            byType: countBy(fallbackRows, 'message_type'),
            byProvider: countBy(fallbackRows, 'provider'),
        };
    }

    const rows = asRows(data);
    return {
        days,
        sinceIso: since.toISOString(),
        source: 'email_messages',
        count: rows.length,
        byStatus: countBy(rows, 'status'),
        byType: countBy(rows, 'message_type'),
        byProvider: countBy(rows, 'provider'),
    };
}

export async function runAdminAgentCommand(ctx: AgentContext, args: string[]): Promise<CommandResult | string> {
    const command = parseAdminAgentCommand(args);
    if (command.kind === 'help') return buildCommandHelp();

    const operator = await requireAllowedOperator(ctx.supabase, ctx.operatorEmail);
    const generatedAt = (ctx.now ?? new Date()).toISOString();

    if (command.kind === 'overview') {
        return { command: command.kind, generatedAt, operatorEmail: operator.email, data: await getOverview(ctx) };
    }

    if (command.kind === 'patient') {
        return { command: command.kind, generatedAt, operatorEmail: operator.email, data: await getPatients(ctx, command.query) };
    }

    if (command.kind === 'agenda') {
        return { command: command.kind, generatedAt, operatorEmail: operator.email, data: await getAgenda(ctx, command.range) };
    }

    if (command.kind === 'cash') {
        return { command: command.kind, generatedAt, operatorEmail: operator.email, data: await getCash(ctx, command.month) };
    }

    return { command: command.kind, generatedAt, operatorEmail: operator.email, data: await getEmails(ctx, command.days) };
}
