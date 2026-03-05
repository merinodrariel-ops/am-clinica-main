export interface PatientProfileSignal {
    id_paciente: string;
    nombre: string;
    apellido: string;
    whatsapp?: string | null;
    email?: string | null;
    estado_paciente?: string | null;
    financ_estado?: string | null;
    financ_monto_total?: number | null;
    financ_cuotas_total?: number | null;
}

export interface PatientPaymentSignal {
    fecha_hora: string;
    estado?: string | null;
    usd_equivalente?: number | null;
    cuota_nro?: number | null;
}

export interface PatientAppointmentSignal {
    start_time: string;
    status?: string | null;
}

export type PatientRiskTier = 'low' | 'watch' | 'high' | 'critical';

export interface PatientPlaybook {
    score: number;
    tier: PatientRiskTier;
    headline: string;
    reasons: string[];
    nextActions: string[];
    outstandingUsd: number;
    estimatedRecoveryUsd: number;
    financingProgressPct: number;
    overdueInstallments: number;
    daysSinceLastTouchpoint: number;
    noShowRate: number;
}

interface BuildPlaybookInput {
    patient: PatientProfileSignal;
    payments: PatientPaymentSignal[];
    appointments?: PatientAppointmentSignal[];
}

function normalizeStatus(status?: string | null) {
    return (status || '').toLowerCase().trim();
}

function isCancelledPaymentStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized === 'anulado' || normalized === 'cancelled' || normalized === 'void';
}

function isActiveAppointment(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized !== 'cancelled' && normalized !== 'no_show';
}

function daysSince(isoDate: string | null) {
    if (!isoDate) return 999;
    const diff = Date.now() - new Date(isoDate).getTime();
    if (!Number.isFinite(diff)) return 999;
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
    return Math.round(value * 100) / 100;
}

function inferTier(score: number): PatientRiskTier {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 35) return 'watch';
    return 'low';
}

export function buildPatientPlaybook(input: BuildPlaybookInput): PatientPlaybook {
    const payments = input.payments || [];
    const appointments = input.appointments || [];

    const validPayments = payments.filter(payment => !isCancelledPaymentStatus(payment.estado));
    const paidInstallments = new Set(
        validPayments
            .map(payment => payment.cuota_nro)
            .filter((installment): installment is number => typeof installment === 'number' && installment > 0)
    ).size;

    const financingTotal = Number(input.patient.financ_monto_total || 0);
    const financingInstallments = Number(input.patient.financ_cuotas_total || 0);
    const activeFinancing = normalizeStatus(input.patient.financ_estado) === 'activo';

    const paidUsd = validPayments.reduce((sum, payment) => sum + Number(payment.usd_equivalente || 0), 0);
    const outstandingUsd = Math.max(0, financingTotal - paidUsd);
    const overdueInstallments = activeFinancing
        ? Math.max(0, financingInstallments - paidInstallments)
        : 0;

    const lastPaymentDate = validPayments
        .map(payment => payment.fecha_hora)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    const sortedAppointments = [...appointments].sort(
        (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    const now = Date.now();
    const lastAppointmentDate = sortedAppointments
        .filter(appointment => new Date(appointment.start_time).getTime() <= now)
        .map(appointment => appointment.start_time)[0] || null;

    const upcomingAppointments = appointments.filter(
        appointment => new Date(appointment.start_time).getTime() > now && isActiveAppointment(appointment.status)
    );

    const noShowCount = appointments.filter(
        appointment => normalizeStatus(appointment.status) === 'no_show' || normalizeStatus(appointment.status) === 'cancelled'
    ).length;
    const noShowRate = appointments.length > 0 ? noShowCount / appointments.length : 0;

    const daysSinceLastPayment = daysSince(lastPaymentDate);
    const daysSinceLastAppointment = daysSince(lastAppointmentDate);
    const daysSinceLastTouchpoint = Math.min(daysSinceLastPayment, daysSinceLastAppointment);

    const hasContactChannel = Boolean(input.patient.whatsapp || input.patient.email);

    let score = 16;
    const reasons: string[] = [];
    const actions: string[] = [];

    if (activeFinancing && overdueInstallments >= 2) {
        score += 28;
        reasons.push(`Tiene ${overdueInstallments} cuotas pendientes en financiacion activa`);
        actions.push('Contactar hoy para regularizar cuotas y ofrecer reprogramacion inteligente');
    } else if (activeFinancing && overdueInstallments === 1) {
        score += 14;
        reasons.push('Tiene 1 cuota pendiente en financiacion activa');
        actions.push('Enviar recordatorio de cuota con link directo de pago');
    }

    if (upcomingAppointments.length === 0 && daysSinceLastTouchpoint > 45) {
        score += 24;
        reasons.push(`Sin turnos programados y ${daysSinceLastTouchpoint} dias sin actividad`);
        actions.push('Ofrecer turno de control y reservar hueco preferencial en Agenda 360');
    }

    if (noShowRate >= 0.35 && appointments.length >= 3) {
        score += 18;
        reasons.push(`Riesgo de inasistencia alto (${Math.round(noShowRate * 100)}%)`);
        actions.push('Aplicar protocolo anti-ausentismo: confirmacion + lista de espera de respaldo');
    }

    if (activeFinancing && daysSinceLastPayment > 60) {
        score += 10;
        reasons.push(`Ultimo pago hace ${daysSinceLastPayment} dias`);
        actions.push('Proponer plan de regularizacion con cuota mensual mas liviana');
    }

    if (!hasContactChannel) {
        score += 10;
        reasons.push('No tiene canal de contacto completo');
        actions.push('Actualizar whatsapp/email antes del proximo hito clinico');
    }

    if (normalizeStatus(input.patient.estado_paciente) === 'inactivo') {
        score += 8;
        reasons.push('Paciente marcado como inactivo');
    }

    if (reasons.length === 0) {
        reasons.push('Evolucion estable, mantener seguimiento preventivo');
        actions.push('Programar control preventivo y mantener comunicacion de valor');
    }

    score = clamp(Math.round(score), 0, 100);
    const tier = inferTier(score);

    const recoveryProbability = clamp(0.82 - score * 0.005, 0.18, 0.9);
    const estimatedRecoveryUsd = round2(outstandingUsd * recoveryProbability);

    const financingProgressPct = financingTotal > 0
        ? clamp((paidUsd / financingTotal) * 100, 0, 100)
        : 0;

    const headline = tier === 'critical'
        ? 'Intervencion inmediata recomendada'
        : tier === 'high'
            ? 'Paciente con riesgo financiero-clinico elevado'
            : tier === 'watch'
                ? 'Monitoreo activo recomendado'
                : 'Perfil saludable y controlado';

    return {
        score,
        tier,
        headline,
        reasons: reasons.slice(0, 3),
        nextActions: actions.slice(0, 3),
        outstandingUsd: round2(outstandingUsd),
        estimatedRecoveryUsd,
        financingProgressPct: round2(financingProgressPct),
        overdueInstallments,
        daysSinceLastTouchpoint,
        noShowRate: round2(noShowRate),
    };
}

export function simulateFinancingPlan(balanceUsd: number, months: number, monthlyRatePct: number) {
    const principal = Math.max(0, Number(balanceUsd || 0));
    const safeMonths = Math.max(1, Math.floor(months));
    const monthlyRate = Math.max(0, Number(monthlyRatePct || 0)) / 100;

    let monthlyPayment = 0;
    if (monthlyRate === 0) {
        monthlyPayment = principal / safeMonths;
    } else {
        const denominator = 1 - Math.pow(1 + monthlyRate, -safeMonths);
        monthlyPayment = denominator > 0 ? principal * (monthlyRate / denominator) : principal / safeMonths;
    }

    const totalAmount = monthlyPayment * safeMonths;
    const totalInterest = totalAmount - principal;

    return {
        monthlyPayment: round2(monthlyPayment),
        totalAmount: round2(totalAmount),
        totalInterest: round2(totalInterest),
        months: safeMonths,
    };
}

export function estimateFinancingAcceptance(playbookScore: number, monthlyPaymentUsd: number, months: number) {
    const scorePenalty = playbookScore * 0.004;
    const pressurePenalty = Math.max(0, monthlyPaymentUsd - 250) * 0.00035;
    const termPenalty = Math.max(0, months - 6) * 0.012;

    const probability = clamp(0.85 - scorePenalty - pressurePenalty - termPenalty, 0.12, 0.94);
    return round2(probability);
}
