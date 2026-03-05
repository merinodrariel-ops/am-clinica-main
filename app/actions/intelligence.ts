'use server';

import { createClient } from '@/utils/supabase/server';
import { buildPatientPlaybook } from '@/lib/patient-playbook';

interface PatientRow {
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

interface PaymentRow {
    id: string;
    paciente_id?: string | null;
    fecha_hora: string;
    usd_equivalente?: number | null;
    monto?: number | null;
    moneda?: string | null;
    estado?: string | null;
    cuota_nro?: number | null;
    metodo_pago?: string | null;
    categoria?: string | null;
    registro_editado?: boolean | null;
}

interface AppointmentRow {
    id: string;
    patient_id?: string | null;
    doctor_id?: string | null;
    start_time: string;
    status?: string | null;
    type?: string | null;
}

interface ProfileRow {
    id: string;
    full_name?: string | null;
}

type Severity = 'low' | 'medium' | 'high';

export interface ExecutivePatientAction {
    patientId: string;
    patientName: string;
    score: number;
    tier: 'low' | 'watch' | 'high' | 'critical';
    headline: string;
    reasons: string[];
    nextActions: string[];
    outstandingUsd: number;
    estimatedRecoveryUsd: number;
    noShowRate: number;
}

export interface NoShowRiskItem {
    appointmentId: string;
    patientId: string;
    patientName: string;
    startTime: string;
    riskScore: number;
}

export interface OccupancyOpportunity {
    doctorId: string;
    doctorName: string;
    date: string;
    booked: number;
    target: number;
    occupancyPct: number;
}

export interface CancellationHotspot {
    weekday: string;
    hour: string;
    cancellations: number;
}

export interface CashAnomaly {
    id: string;
    severity: Severity;
    title: string;
    detail: string;
    amountUsd: number;
    patientId?: string;
    patientName?: string;
    happenedAt: string;
}

export interface ExecutiveIntelligenceSnapshot {
    generatedAt: string;
    portfolio: {
        totalPatients: number;
        highPriorityPatients: number;
        projectedRecoveryUsd: number;
    };
    agenda: {
        noShowRiskCount: number;
        lowOccupancyCount: number;
        cancellationHotspotCount: number;
        noShowRisk: NoShowRiskItem[];
        lowOccupancyWindows: OccupancyOpportunity[];
        cancellationHotspots: CancellationHotspot[];
    };
    cash: {
        anomalyCount: number;
        highSeverityCount: number;
        anomalies: CashAnomaly[];
    };
    patientActions: ExecutivePatientAction[];
}

function normalizeStatus(status?: string | null) {
    return (status || '').toLowerCase().trim();
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
    return Math.round(value * 100) / 100;
}

function safeUsdAmount(movement: PaymentRow) {
    const usd = Number(movement.usd_equivalente || 0);
    if (usd > 0) return usd;

    const monto = Number(movement.monto || 0);
    const moneda = normalizeStatus(movement.moneda);
    if (moneda === 'usd' || moneda === 'usdt') return Math.max(0, monto);
    return 0;
}

function getWeekdayName(dateIso: string) {
    return new Date(dateIso).toLocaleDateString('es-AR', { weekday: 'short' });
}

function getHourLabel(dateIso: string) {
    return new Date(dateIso).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function average(values: number[]) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[], mean: number) {
    if (values.length <= 1) return 0;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

function inferNoShowRiskScore(history: AppointmentRow[]) {
    if (history.length === 0) return 18;
    const canceledOrNoShow = history.filter(appointment => {
        const status = normalizeStatus(appointment.status);
        return status === 'cancelled' || status === 'no_show';
    }).length;

    const ratio = canceledOrNoShow / history.length;
    return Math.round(clamp(ratio * 100, 5, 97));
}

export async function getExecutiveIntelligence(): Promise<ExecutiveIntelligenceSnapshot> {
    const supabase = await createClient();
    const now = new Date();
    const nowIso = now.toISOString();

    const lookbackDays = 180;
    const pastWindowIso = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const futureWindowIso = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString();
    const cashWindowIso = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();

    const [patientsRes, paymentsRes, appointmentsRes, profilesRes] = await Promise.all([
        supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, whatsapp, email, estado_paciente, financ_estado, financ_monto_total, financ_cuotas_total')
            .eq('is_deleted', false)
            .limit(2500),
        supabase
            .from('caja_recepcion_movimientos')
            .select('id, paciente_id, fecha_hora, usd_equivalente, monto, moneda, estado, cuota_nro, metodo_pago, categoria, registro_editado')
            .gte('fecha_hora', pastWindowIso)
            .order('fecha_hora', { ascending: false })
            .limit(20000),
        supabase
            .from('agenda_appointments')
            .select('id, patient_id, doctor_id, start_time, status, type')
            .gte('start_time', pastWindowIso)
            .lte('start_time', futureWindowIso)
            .order('start_time', { ascending: false })
            .limit(20000),
        supabase
            .from('profiles')
            .select('id, full_name')
            .limit(500),
    ]);

    if (patientsRes.error) {
        console.error('Executive intelligence patients error:', patientsRes.error);
    }
    if (paymentsRes.error) {
        console.error('Executive intelligence payments error:', paymentsRes.error);
    }
    if (appointmentsRes.error) {
        console.error('Executive intelligence appointments error:', appointmentsRes.error);
    }

    const patients = (patientsRes.data || []) as PatientRow[];
    const payments = (paymentsRes.data || []) as PaymentRow[];
    const appointments = (appointmentsRes.data || []) as AppointmentRow[];
    const profiles = (profilesRes.data || []) as ProfileRow[];

    const patientById = new Map<string, PatientRow>();
    const paymentsByPatient = new Map<string, PaymentRow[]>();
    const appointmentsByPatient = new Map<string, AppointmentRow[]>();
    const doctorNameById = new Map<string, string>();

    patients.forEach(patient => {
        patientById.set(patient.id_paciente, patient);
    });

    payments.forEach(payment => {
        const patientId = payment.paciente_id;
        if (!patientId) return;
        const current = paymentsByPatient.get(patientId) || [];
        current.push(payment);
        paymentsByPatient.set(patientId, current);
    });

    appointments.forEach(appointment => {
        const patientId = appointment.patient_id;
        if (!patientId) return;
        const current = appointmentsByPatient.get(patientId) || [];
        current.push(appointment);
        appointmentsByPatient.set(patientId, current);
    });

    profiles.forEach(profile => {
        doctorNameById.set(profile.id, profile.full_name || 'Profesional');
    });

    const patientActions: ExecutivePatientAction[] = patients
        .map(patient => {
            const patientPayments = paymentsByPatient.get(patient.id_paciente) || [];
            const patientAppointments = appointmentsByPatient.get(patient.id_paciente) || [];

            const playbook = buildPatientPlaybook({
                patient,
                payments: patientPayments,
                appointments: patientAppointments,
            });

            return {
                patientId: patient.id_paciente,
                patientName: `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim(),
                score: playbook.score,
                tier: playbook.tier,
                headline: playbook.headline,
                reasons: playbook.reasons,
                nextActions: playbook.nextActions,
                outstandingUsd: playbook.outstandingUsd,
                estimatedRecoveryUsd: playbook.estimatedRecoveryUsd,
                noShowRate: playbook.noShowRate,
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

    const highPriorityPatients = patientActions.filter(action => action.tier === 'high' || action.tier === 'critical').length;
    const projectedRecoveryUsd = round2(patientActions.reduce((sum, action) => sum + action.estimatedRecoveryUsd, 0));

    const upcomingAppointments = appointments.filter(appointment => new Date(appointment.start_time).getTime() > now.getTime());
    const upcomingActiveAppointments = upcomingAppointments.filter(appointment => {
        const status = normalizeStatus(appointment.status);
        return status !== 'cancelled' && status !== 'no_show';
    });

    const noShowRisk: NoShowRiskItem[] = upcomingActiveAppointments
        .map(appointment => {
            const patientId = appointment.patient_id || '';
            const history = appointmentsByPatient.get(patientId) || [];
            const riskScore = inferNoShowRiskScore(history);
            const patient = patientById.get(patientId);

            return {
                appointmentId: appointment.id,
                patientId,
                patientName: patient
                    ? `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim()
                    : 'Paciente',
                startTime: appointment.start_time,
                riskScore,
            };
        })
        .filter(item => Boolean(item.patientId) && item.riskScore >= 45)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 6);

    const occupancyTarget = 10;
    const occupancyMap = new Map<string, { doctorId: string; date: string; booked: number }>();
    upcomingActiveAppointments.forEach(appointment => {
        const date = appointment.start_time.slice(0, 10);
        const doctorId = appointment.doctor_id || 'sin-doctor';
        const key = `${doctorId}:${date}`;
        const current = occupancyMap.get(key) || { doctorId, date, booked: 0 };
        current.booked += 1;
        occupancyMap.set(key, current);
    });

    const lowOccupancyWindows: OccupancyOpportunity[] = Array.from(occupancyMap.values())
        .map(item => {
            const occupancyPct = Math.round((item.booked / occupancyTarget) * 100);
            return {
                doctorId: item.doctorId,
                doctorName: doctorNameById.get(item.doctorId) || 'Profesional',
                date: item.date,
                booked: item.booked,
                target: occupancyTarget,
                occupancyPct,
            };
        })
        .filter(window => window.occupancyPct < 60)
        .sort((a, b) => a.occupancyPct - b.occupancyPct)
        .slice(0, 8);

    const pastCanceled = appointments.filter(appointment => {
        const status = normalizeStatus(appointment.status);
        const isCanceled = status === 'cancelled' || status === 'no_show';
        return isCanceled && new Date(appointment.start_time).getTime() <= now.getTime();
    });

    const hotspotMap = new Map<string, CancellationHotspot>();
    pastCanceled.forEach(appointment => {
        const weekday = getWeekdayName(appointment.start_time);
        const hour = getHourLabel(appointment.start_time).slice(0, 2) + ':00';
        const key = `${weekday}-${hour}`;
        const current = hotspotMap.get(key) || { weekday, hour, cancellations: 0 };
        current.cancellations += 1;
        hotspotMap.set(key, current);
    });

    const cancellationHotspots = Array.from(hotspotMap.values())
        .filter(item => item.cancellations >= 2)
        .sort((a, b) => b.cancellations - a.cancellations)
        .slice(0, 5);

    const recentMovements = payments.filter(payment => new Date(payment.fecha_hora).getTime() >= new Date(cashWindowIso).getTime());
    const normalizedAmounts = recentMovements
        .map(movement => safeUsdAmount(movement))
        .filter(amount => amount > 0);
    const mean = average(normalizedAmounts);
    const deviation = stdDev(normalizedAmounts, mean);

    const anomalies: CashAnomaly[] = [];
    recentMovements.forEach(movement => {
        const amountUsd = safeUsdAmount(movement);
        const status = normalizeStatus(movement.estado);
        const edited = Boolean(movement.registro_editado);
        const patient = movement.paciente_id ? patientById.get(movement.paciente_id) : null;
        const patientName = patient
            ? `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim()
            : undefined;

        if (amountUsd <= 0) return;

        if (deviation > 0 && amountUsd > mean + deviation * 2.6 && amountUsd > 180) {
            anomalies.push({
                id: movement.id,
                severity: 'high',
                title: 'Movimiento atipico de alto monto',
                detail: `Desvio fuerte frente al patron de los ultimos 45 dias (${round2(mean)} USD promedio).`,
                amountUsd: round2(amountUsd),
                patientId: movement.paciente_id || undefined,
                patientName,
                happenedAt: movement.fecha_hora,
            });
        }

        if (status === 'anulado' && amountUsd >= 120) {
            anomalies.push({
                id: `${movement.id}-void`,
                severity: 'high',
                title: 'Anulacion sensible',
                detail: 'Anulacion de importe relevante que requiere doble control administrativo.',
                amountUsd: round2(amountUsd),
                patientId: movement.paciente_id || undefined,
                patientName,
                happenedAt: movement.fecha_hora,
            });
        }

        if (edited && amountUsd >= 80) {
            anomalies.push({
                id: `${movement.id}-edited`,
                severity: amountUsd > 220 ? 'high' : 'medium',
                title: 'Registro editado',
                detail: 'Movimiento editado manualmente; sugerido revisar motivo y trazabilidad.',
                amountUsd: round2(amountUsd),
                patientId: movement.paciente_id || undefined,
                patientName,
                happenedAt: movement.fecha_hora,
            });
        }

        if (normalizeStatus(movement.metodo_pago) === 'cripto' && amountUsd >= 350) {
            anomalies.push({
                id: `${movement.id}-crypto`,
                severity: 'medium',
                title: 'Cobro cripto elevado',
                detail: 'Cobro en cripto por encima de umbral recomendado de revision.',
                amountUsd: round2(amountUsd),
                patientId: movement.paciente_id || undefined,
                patientName,
                happenedAt: movement.fecha_hora,
            });
        }
    });

    const dedupedAnomalies = Array.from(
        new Map(anomalies.map(anomaly => [anomaly.id, anomaly])).values()
    )
        .sort((a, b) => {
            const severityOrder = { high: 3, medium: 2, low: 1 };
            if (severityOrder[b.severity] !== severityOrder[a.severity]) {
                return severityOrder[b.severity] - severityOrder[a.severity];
            }
            return b.amountUsd - a.amountUsd;
        })
        .slice(0, 8);

    return {
        generatedAt: nowIso,
        portfolio: {
            totalPatients: patients.length,
            highPriorityPatients,
            projectedRecoveryUsd,
        },
        agenda: {
            noShowRiskCount: noShowRisk.length,
            lowOccupancyCount: lowOccupancyWindows.length,
            cancellationHotspotCount: cancellationHotspots.length,
            noShowRisk,
            lowOccupancyWindows,
            cancellationHotspots,
        },
        cash: {
            anomalyCount: dedupedAnomalies.length,
            highSeverityCount: dedupedAnomalies.filter(anomaly => anomaly.severity === 'high').length,
            anomalies: dedupedAnomalies,
        },
        patientActions,
    };
}

export async function getAgendaAutopilotSummary() {
    const snapshot = await getExecutiveIntelligence();
    return {
        generatedAt: snapshot.generatedAt,
        patientActions: snapshot.patientActions.slice(0, 5),
        agenda: snapshot.agenda,
    };
}
