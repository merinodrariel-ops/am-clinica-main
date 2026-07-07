export type AdminAgentCategory = 'owner' | 'admin' | 'developer';

export type AdminAgentOperator = {
    email: string;
    categoria: string | null;
};

export type AdminAgentCommand =
    | { kind: 'overview' }
    | { kind: 'patient'; query: string }
    | { kind: 'agenda'; range: 'today' | 'week' }
    | { kind: 'cash'; month: string }
    | {
        kind: 'provider_services';
        providerQuery: string;
        serviceMonth: string;
        paymentMonth?: string;
        serviceQuery?: string;
    }
    | { kind: 'emails'; days: number }
    | { kind: 'help' };

export type MonthWindow = {
    month: string;
    startIso: string;
    endIso: string;
};

export type CashMovementInput = {
    source: 'reception' | 'admin';
    estado?: string | null;
    tipo_movimiento?: string | null;
    usd_equivalente?: number | string | null;
    usd_equivalente_total?: number | string | null;
};

export type CashSummary = {
    month: string;
    receptionIncomeUsd: number;
    adminIncomeUsd: number;
    adminExpenseUsd: number;
    netUsd: number;
    movementCount: number;
};

export type PatientPreviewInput = {
    id_paciente: string;
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    whatsapp?: string | null;
    estado_paciente?: string | null;
    financ_estado?: string | null;
};

export type PatientPreview = {
    id: string;
    nombre: string;
    email: string | null;
    whatsapp: string | null;
    estado: string | null;
    financEstado: string | null;
};

export type ProviderServiceRowInput = {
    id?: string;
    prestacion_nombre?: string | null;
    fecha_realizacion?: string | null;
    monto_honorarios?: number | string | null;
    moneda_cobro?: string | null;
    estado_pago?: string | null;
    slides_url?: string | null;
    slides_validado?: boolean | null;
    liquidacion_id?: string | null;
};

export type ProviderServiceSummary = {
    total: number;
    validated: number;
    pendingEvidence: number;
    totalHonorarios: number;
    byService: Array<{ service: string; count: number }>;
};

const ALLOWED_OPERATOR_CATEGORIES = new Set(['owner', 'admin', 'developer']);
const DEFAULT_EMAIL_DAYS = 30;
const MAX_EMAIL_DAYS = 90;
const GENERIC_PROVIDER_SERVICE_WORDS = new Set([
    'pieza',
    'piezas',
    'dentaria',
    'dentarias',
    'dental',
    'dentales',
    'prestacion',
    'prestaciones',
]);

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function normalizeCommand(value: string | undefined): string {
    return (value ?? '').trim().toLowerCase();
}

function normalizeText(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function stemServiceToken(token: string): string {
    return token
        .replace(/(ciones|siones)$/u, 'cion')
        .replace(/(ivas|ivos|iva|ivo)$/u, 'iv')
        .replace(/(ales)$/u, 'al')
        .replace(/(es|s)$/u, '');
}

function currentArgentinaMonth(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    return `${year}-${month}`;
}

export function assertAllowedOperator(operator: AdminAgentOperator): asserts operator is AdminAgentOperator & { categoria: AdminAgentCategory } {
    if (!operator.email || !ALLOWED_OPERATOR_CATEGORIES.has(operator.categoria ?? '')) {
        throw new Error(`Operator ${operator.email || '(unknown)'} is not allowed to use AM Admin Agent`);
    }
}

export function buildCommandHelp(): string {
    return [
        'AM Admin Agent CLI',
        '',
        'Read-only commands:',
        '  overview                 Snapshot general de pacientes, agenda y caja',
        '  patient <busqueda>        Busca pacientes con contacto redactado',
        '  agenda [today|week]       Resumen de agenda',
        '  cash [YYYY-MM]            Resumen de caja recepcion/admin',
        '  provider-services <prestador> <YYYY-MM> [--paid-month YYYY-MM] [texto]  Prestaciones/liquidacion de un profesional',
        '  emails [dias]             Resumen de emails/logs enviados',
        '',
        'Required env:',
        '  AM_AGENT_OPERATOR_EMAIL   Email de operador owner/admin/developer',
        '  NEXT_PUBLIC_SUPABASE_URL  URL del proyecto Supabase',
        '  SUPABASE_SERVICE_ROLE_KEY Service role solo para este proceso local/server',
    ].join('\n');
}

export function parseAdminAgentCommand(args: string[]): AdminAgentCommand {
    const [rawCommand, ...rest] = args;
    const command = normalizeCommand(rawCommand || 'overview');

    if (command === 'help' || command === '--help' || command === '-h') {
        return { kind: 'help' };
    }

    if (command === 'overview') {
        return { kind: 'overview' };
    }

    if (command === 'patient' || command === 'patients' || command === 'paciente') {
        const query = rest.join(' ').trim();
        if (!query) throw new Error('patient command requires a search query');
        return { kind: 'patient', query };
    }

    if (command === 'agenda') {
        const range = normalizeCommand(rest[0] || 'today');
        if (range !== 'today' && range !== 'week') {
            throw new Error('agenda command range must be today or week');
        }
        return { kind: 'agenda', range };
    }

    if (command === 'cash' || command === 'caja') {
        const month = rest[0]?.trim() || currentArgentinaMonth();
        if (!/^\d{4}-\d{2}$/.test(month)) {
            throw new Error('cash command month must use YYYY-MM format');
        }
        return { kind: 'cash', month };
    }

    if (command === 'provider-services' || command === 'prestaciones-profesional') {
        const providerQuery = rest[0]?.trim();
        const serviceMonth = rest[1]?.trim();
        if (!providerQuery || !serviceMonth) {
            throw new Error('provider-services requires provider query and service month YYYY-MM');
        }
        if (!/^\d{4}-\d{2}$/.test(serviceMonth)) {
            throw new Error('provider-services service month must use YYYY-MM format');
        }
        let paymentMonth: string | undefined;
        const serviceTerms: string[] = [];
        for (let i = 2; i < rest.length; i += 1) {
            const arg = rest[i]?.trim();
            if (!arg) continue;
            if (arg === '--paid-month' || arg === '--payment-month' || arg === '--mes-pago') {
                paymentMonth = rest[i + 1]?.trim();
                i += 1;
                continue;
            }
            serviceTerms.push(arg);
        }
        if (paymentMonth && !/^\d{4}-\d{2}$/.test(paymentMonth)) {
            throw new Error('provider-services paid month must use YYYY-MM format');
        }
        const serviceQuery = serviceTerms.join(' ').trim() || undefined;
        return { kind: 'provider_services', providerQuery, serviceMonth, paymentMonth, serviceQuery };
    }

    if (command === 'emails' || command === 'email') {
        const days = Number(rest[0] || DEFAULT_EMAIL_DAYS);
        if (!Number.isInteger(days) || days < 1 || days > MAX_EMAIL_DAYS) {
            throw new Error(`emails command days must be an integer between 1 and ${MAX_EMAIL_DAYS}`);
        }
        return { kind: 'emails', days };
    }

    throw new Error(`Unsupported admin agent command: ${rawCommand}`);
}

export function buildProviderServiceSummary(rows: ProviderServiceRowInput[]): ProviderServiceSummary {
    const byServiceMap = new Map<string, number>();

    for (const row of rows) {
        const service = row.prestacion_nombre?.trim() || 'Sin nombre';
        byServiceMap.set(service, (byServiceMap.get(service) ?? 0) + 1);
    }

    return {
        total: rows.length,
        validated: rows.filter((row) => Boolean(row.slides_url || row.slides_validado)).length,
        pendingEvidence: rows.filter((row) => !row.slides_url && !row.slides_validado).length,
        totalHonorarios: round2(rows.reduce((sum, row) => sum + (Number(row.monto_honorarios) || 0), 0)),
        byService: [...byServiceMap.entries()]
            .map(([service, count]) => ({ service, count }))
            .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service)),
    };
}

export function matchesProviderServiceQuery(serviceName: string | null | undefined, query: string): boolean {
    const service = normalizeText(serviceName);
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return true;
    if (service.includes(normalizedQuery)) return true;

    const serviceTokens = new Set(
        service
            .split(/\W+/u)
            .filter(Boolean)
            .flatMap((token) => [token, stemServiceToken(token)])
    );
    const queryTokens = normalizedQuery
        .split(/\W+/u)
        .filter((token) => token.length >= 3 && !GENERIC_PROVIDER_SERVICE_WORDS.has(token))
        .map(stemServiceToken);

    return queryTokens.length > 0 && queryTokens.every((token) => serviceTokens.has(token));
}

export function buildMonthWindow(month: string): MonthWindow {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error('month must use YYYY-MM format');
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const start = new Date(`${year}-${String(monthNumber).padStart(2, '0')}-01T00:00:00.000-03:00`);
    const nextMonth = monthNumber === 12
        ? `${year + 1}-01`
        : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
    const [nextYear, nextMonthNumber] = nextMonth.split('-').map(Number);
    const end = new Date(`${nextYear}-${String(nextMonthNumber).padStart(2, '0')}-01T00:00:00.000-03:00`);

    return {
        month,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
    };
}

function isPaidMovement(movement: CashMovementInput): boolean {
    const estado = (movement.estado ?? '').toLowerCase().trim();
    return !['anulado', 'cancelado', 'cancelled', 'void'].includes(estado);
}

function movementUsd(movement: CashMovementInput): number {
    return Number(movement.usd_equivalente_total ?? movement.usd_equivalente ?? 0) || 0;
}

export function buildCashSummary(month: string, movements: CashMovementInput[]): CashSummary {
    const paidMovements = movements.filter(isPaidMovement);

    const receptionIncomeUsd = paidMovements
        .filter((movement) => movement.source === 'reception')
        .reduce((sum, movement) => sum + movementUsd(movement), 0);

    const adminIncomeUsd = paidMovements
        .filter((movement) => movement.source === 'admin' && (movement.tipo_movimiento ?? '').toLowerCase() !== 'egreso')
        .reduce((sum, movement) => sum + movementUsd(movement), 0);

    const adminExpenseUsd = paidMovements
        .filter((movement) => movement.source === 'admin' && (movement.tipo_movimiento ?? '').toLowerCase() === 'egreso')
        .reduce((sum, movement) => sum + movementUsd(movement), 0);

    return {
        month,
        receptionIncomeUsd: round2(receptionIncomeUsd),
        adminIncomeUsd: round2(adminIncomeUsd),
        adminExpenseUsd: round2(adminExpenseUsd),
        netUsd: round2(receptionIncomeUsd + adminIncomeUsd - adminExpenseUsd),
        movementCount: paidMovements.length,
    };
}

export function redactEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`;
    return `${local[0]}${'*'.repeat(Math.max(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

export function redactPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digitGroups = phone.match(/\d+/g) ?? [];
    if (digitGroups.length <= 2) return '****';
    const prefix = phone.trim().startsWith('+') ? '+' : '';
    return prefix + digitGroups
        .map((group, index) => {
            if (index < digitGroups.length - 2) return group;
            if (index === digitGroups.length - 2) return '*'.repeat(group.length);
            return group;
        })
        .join(' ');
}

export function buildPatientSearchPreview(patients: PatientPreviewInput[]): PatientPreview[] {
    return patients.map((patient) => ({
        id: patient.id_paciente,
        nombre: `${patient.nombre ?? ''} ${patient.apellido ?? ''}`.trim() || 'Paciente',
        email: redactEmail(patient.email),
        whatsapp: redactPhone(patient.whatsapp),
        estado: patient.estado_paciente ?? null,
        financEstado: patient.financ_estado ?? null,
    }));
}
