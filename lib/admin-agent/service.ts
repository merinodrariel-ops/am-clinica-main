import {
    assertAllowedOperator,
    buildCashSummary,
    buildCommandHelp,
    buildMonthWindow,
    buildPatientSearchPreview,
    buildProviderServiceSummary,
    matchesProviderServiceQuery,
    parseAdminAgentCommand,
    type AdminAgentCommand,
    type CashMovementInput,
    type PatientPreviewInput,
    type ProviderServiceRowInput,
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

type PersonalRow = {
    id: string;
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    tipo?: string | null;
    modelo_pago?: string | null;
};

type LiquidacionRow = {
    id?: string;
    mes?: string | null;
    estado?: string | null;
    fecha_pago?: string | null;
    total_usd?: number | string | null;
    total_ars?: number | string | null;
    prestaciones_validadas?: number | string | null;
    prestaciones_pendientes?: number | string | null;
};

type AdminPaymentMovementRow = {
    id?: string;
    fecha_movimiento?: string | null;
    descripcion?: string | null;
    subtipo?: string | null;
    nota?: string | null;
    estado?: string | null;
    tipo_movimiento?: string | null;
    usd_equivalente_total?: number | string | null;
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

function isPaidLiquidation(liquidacion: LiquidacionRow | null): boolean {
    const estado = normalizeSearch(liquidacion?.estado || '');
    return ['pagada', 'pagado', 'paid'].includes(estado);
}

function providerName(provider: PersonalRow): string {
    return `${provider.nombre || ''} ${provider.apellido || ''}`.trim();
}

function activePaymentMovements(rows: AdminPaymentMovementRow[]): AdminPaymentMovementRow[] {
    return rows.filter((row) => !['anulado', 'cancelado', 'cancelled', 'void'].includes(normalizeSearch(row.estado || '')));
}

function cajaPaymentOrFilter(provider: PersonalRow, providerQuery: string): string {
    const terms = Array.from(new Set([
        providerName(provider),
        provider.nombre || '',
        provider.apellido || '',
        providerQuery,
    ].map((term) => term.trim()).filter(Boolean)));

    return terms.flatMap((term) => {
        const escaped = `%${escapeSupabaseSearchTerm(term)}%`;
        return [
            `descripcion.ilike.${escaped}`,
            `nota.ilike.${escaped}`,
            `subtipo.ilike.${escaped}`,
        ];
    }).join(',');
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

async function findPersonal(ctx: AgentContext, query: string): Promise<PersonalRow[]> {
    const normalized = normalizeSearch(query);
    const terms = normalized.split(/\s+/).filter(Boolean);
    const filters = Array.from(new Set([normalized, ...terms]))
        .filter(Boolean)
        .flatMap((term) => {
            const escaped = `%${escapeSupabaseSearchTerm(term)}%`;
            return [
                `nombre.ilike.${escaped}`,
                `apellido.ilike.${escaped}`,
                `email.ilike.${escaped}`,
            ];
        })
        .join(',');

    const { data, error } = await ctx.supabase
        .from('personal')
        .select('id,nombre,apellido,email,tipo,modelo_pago')
        .or(filters)
        .eq('activo', true)
        .limit(10);

    if (error) throw new Error(`Provider lookup failed: ${error.message}`);
    return asRows(data) as PersonalRow[];
}

async function getProviderServices(
    ctx: AgentContext,
    input: {
        providerQuery: string;
        serviceMonth: string;
        paymentMonth?: string;
        serviceQuery?: string;
    }
) {
    const providers = await findPersonal(ctx, input.providerQuery);
    if (providers.length === 0) {
        return {
            providerQuery: input.providerQuery,
            serviceMonth: input.serviceMonth,
            count: 0,
            error: 'No encontré un profesional activo con esa búsqueda.',
        };
    }

    if (providers.length > 1) {
        return {
            providerQuery: input.providerQuery,
            serviceMonth: input.serviceMonth,
            needsDisambiguation: true,
            candidates: providers.map((provider) => ({
                id: provider.id,
                name: `${provider.nombre || ''} ${provider.apellido || ''}`.trim(),
                tipo: provider.tipo,
                modeloPago: provider.modelo_pago,
            })),
        };
    }

    const provider = providers[0];
    const serviceWindow = buildMonthWindow(input.serviceMonth);
    const serviceStart = input.serviceMonth + '-01';
    const serviceEnd = new Date(serviceWindow.endIso).toISOString().slice(0, 10);

    const paymentWindow = input.paymentMonth ? buildMonthWindow(input.paymentMonth) : null;
    const paymentStart = input.paymentMonth ? `${input.paymentMonth}-01` : null;
    const paymentEnd = paymentWindow ? new Date(paymentWindow.endIso).toISOString().slice(0, 10) : null;

    const [prestacionesRes, liquidacionRes, cajaPaymentsRes] = await Promise.all([
        ctx.supabase
            .from('prestaciones_realizadas')
            .select('id,prestacion_nombre,fecha_realizacion,monto_honorarios,moneda_cobro,estado_pago,slides_url,slides_validado,liquidacion_id')
            .eq('profesional_id', provider.id)
            .gte('fecha_realizacion', serviceStart)
            .lt('fecha_realizacion', serviceEnd)
            .limit(1000),
        ctx.supabase
            .from('liquidaciones_mensuales')
            .select('id,mes,estado,fecha_pago,total_usd,total_ars,prestaciones_validadas,prestaciones_pendientes')
            .eq('personal_id', provider.id)
            .eq('mes', `${input.serviceMonth}-01`)
            .limit(1),
        paymentStart && paymentEnd
            ? ctx.supabase
                .from('caja_admin_movimientos')
                .select('id,fecha_movimiento,descripcion,subtipo,nota,estado,tipo_movimiento,usd_equivalente_total')
                .gte('fecha_movimiento', paymentStart)
                .lt('fecha_movimiento', paymentEnd)
                .eq('tipo_movimiento', 'EGRESO')
                .or(cajaPaymentOrFilter(provider, input.providerQuery))
                .limit(20)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (prestacionesRes.error) throw new Error(`Provider services query failed: ${prestacionesRes.error.message}`);
    if (liquidacionRes.error) throw new Error(`Provider liquidation query failed: ${liquidacionRes.error.message}`);
    if (cajaPaymentsRes.error) throw new Error(`Provider cash payment query failed: ${cajaPaymentsRes.error.message}`);

    const rawRows = asRows(prestacionesRes.data) as ProviderServiceRowInput[];
    const filteredRows = input.serviceQuery
        ? rawRows.filter((row) => matchesProviderServiceQuery(row.prestacion_nombre, input.serviceQuery || ''))
        : rawRows;
    const liquidacion = (asRows(liquidacionRes.data) as LiquidacionRow[])[0] ?? null;
    const paymentMonthMatches = input.paymentMonth && liquidacion?.fecha_pago
        ? String(liquidacion.fecha_pago).slice(0, 7) === input.paymentMonth
        : null;
    const summary = buildProviderServiceSummary(filteredRows);
    const liquidationIsPaid = isPaidLiquidation(liquidacion);
    const cajaPaymentRows = activePaymentMovements(asRows(cajaPaymentsRes.data) as AdminPaymentMovementRow[]);
    const hasCajaPaymentEvidence = cajaPaymentRows.length > 0;
    const paymentConfirmed = (liquidationIsPaid && paymentMonthMatches !== false) || hasCajaPaymentEvidence;
    const paidValidatedCount = paymentConfirmed
        ? summary.validated
        : 0;

    return {
        provider: {
            id: provider.id,
            name: `${provider.nombre || ''} ${provider.apellido || ''}`.trim(),
            tipo: provider.tipo,
            modeloPago: provider.modelo_pago,
        },
        serviceMonth: input.serviceMonth,
        paymentMonth: input.paymentMonth ?? null,
        serviceQuery: input.serviceQuery ?? null,
        paymentConfirmed,
        liquidacion: liquidacion ? {
            id: liquidacion.id,
            estado: liquidacion.estado,
            fechaPago: liquidacion.fecha_pago,
            totalUsd: Number(liquidacion.total_usd || 0),
            totalArs: Number(liquidacion.total_ars || 0),
            prestacionesValidadas: Number(liquidacion.prestaciones_validadas || 0),
            prestacionesPendientes: Number(liquidacion.prestaciones_pendientes || 0),
            paymentMonthMatches,
            isPaid: liquidationIsPaid,
        } : null,
        cajaPayment: {
            count: cajaPaymentRows.length,
            totalUsd: Math.round(cajaPaymentRows.reduce((sum, row) => sum + (Number(row.usd_equivalente_total) || 0), 0) * 100) / 100,
            movements: cajaPaymentRows.slice(0, 10).map((row) => ({
                id: row.id,
                fecha: row.fecha_movimiento,
                descripcion: row.descripcion,
                subtipo: row.subtipo,
                estado: row.estado,
                totalUsd: Number(row.usd_equivalente_total || 0),
            })),
        },
        summary,
        paidValidatedCount,
        paidCountBasis: 'Prestaciones filtradas con evidencia validada y pago confirmado por liquidacion_mensual pagada o egreso de caja admin del mes consultado.',
        rows: filteredRows.slice(0, 50).map((row) => ({
            id: row.id,
            fecha: row.fecha_realizacion,
            prestacion: row.prestacion_nombre,
            estadoPago: row.estado_pago,
            montoHonorarios: Number(row.monto_honorarios || 0),
            moneda: row.moneda_cobro,
            validada: Boolean(row.slides_url || row.slides_validado),
            liquidacionId: row.liquidacion_id,
        })),
        truncated: filteredRows.length > 50,
    };
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

    if (command.kind === 'provider_services') {
        return {
            command: command.kind,
            generatedAt,
            operatorEmail: operator.email,
            data: await getProviderServices(ctx, {
                providerQuery: command.providerQuery,
                serviceMonth: command.serviceMonth,
                serviceQuery: command.serviceQuery,
                paymentMonth: command.paymentMonth,
            }),
        };
    }

    return { command: command.kind, generatedAt, operatorEmail: operator.email, data: await getEmails(ctx, command.days) };
}
