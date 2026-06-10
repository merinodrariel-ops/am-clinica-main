'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { buildProviderStatus } from '@/lib/email-message-tracking';
import { renderTemplate } from '@/lib/am-scheduler/notification-templates';

const ALLOWED_EMAIL_ROLES = new Set(['owner', 'admin', 'reception', 'developer']);
const EMAIL_HISTORY_WINDOW_DAYS = 31;
const NOTIFICATION_LOG_ID_PREFIX = 'notification-log:';
const MISSING_RELATION_MESSAGES = [
    "Could not find the table 'public.email_messages' in the schema cache",
    "Could not find the table 'public.workflow_notifications_log' in the schema cache",
    "relation \"public.email_messages\" does not exist",
    "relation \"public.workflow_notifications_log\" does not exist",
];

export interface EmailMessageListFilters {
    query?: string;
    status?: string;
    messageType?: string;
    provider?: string;
    sourceModule?: string;
}

export interface EmailMessageListRow {
    id: string;
    created_at: string;
    status: string;
    provider: string;
    to_email: string;
    to_name: string | null;
    subject: string;
    template_key: string | null;
    template_label: string | null;
    message_type: string;
    source_module: string;
    patient_id: string | null;
    appointment_id: string | null;
    provider_message_id: string | null;
    error_message: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    opened_at?: string | null;
    clicked_at?: string | null;
    data_source?: 'email_messages' | 'notification_logs';
    source_reference?: string | null;
    patient?: {
        nombre: string | null;
        apellido: string | null;
    } | null;
}

export interface EmailMessageDetail extends EmailMessageListRow {
    from_email: string | null;
    reply_to: string | null;
    cc: string[];
    bcc: string[];
    html_snapshot: string | null;
    text_snapshot: string | null;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    queued_at: string | null;
    bounced_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    data_source?: 'email_messages' | 'notification_logs';
    source_reference?: string | null;
}

export interface ScheduledEmailRow {
    id: string;
    scheduled_for: string;
    email: string | null;
    subject: string | null;
    message: string;
    patient_id: string | null;
    patient?: {
        nombre: string | null;
        apellido: string | null;
    } | null;
}

async function requireEmailAccess() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    if (error || !profile || !ALLOWED_EMAIL_ROLES.has(profile.categoria || '')) {
        throw new Error('No autorizado');
    }

    return { user, categoria: profile.categoria };
}

type NotificationLogPayload = {
    patientName?: string;
    doctorName?: string;
    startTime?: string;
    appointmentType?: string;
    agendaDate?: string;
    appointmentCount?: number;
    [key: string]: unknown;
};

type NotificationLogRecord = {
    id: string;
    created_at: string;
    sent_at: string | null;
    status: string;
    template_key: string | null;
    recipient_email: string | null;
    provider_id: string | null;
    error_message: string | null;
    payload: NotificationLogPayload | null;
    appointment_id: string | null;
};

function isMissingRelationError(message: string | undefined) {
    if (!message) return false;
    return MISSING_RELATION_MESSAGES.some((known) => message.includes(known));
}

function buildHistoryWindowStart() {
    return new Date(Date.now() - EMAIL_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function labelFromTemplateKey(templateKey: string | null) {
    if (!templateKey) return 'Email operativo';

    const labels: Record<string, string> = {
        appointment_confirmed: 'Turno confirmado',
        appointment_cancelled: 'Turno cancelado',
        survey_first_visit: 'Encuesta primera visita',
        survey_post_appointment: 'Encuesta post-turno',
        reminder_24h: 'Recordatorio 24h',
        reminder_1h: 'Recordatorio 1h',
        doctor_daily_agenda: 'Agenda diaria profesional',
        doctor_daily_agenda_manual_resend: 'Agenda diaria profesional',
        recall_6_months: 'Recall 6 meses',
        recall_cleaning: 'Recall limpieza',
        upgrade_cleaning_laser: 'Upgrade limpieza con laser',
        recall_veneer_control: 'Control de carillas',
        cross_sell_cleaning_after_veneers: 'Limpieza sugerida post-carillas',
        recall_whitening: 'Recall blanqueamiento',
        recall_orthodontic_control: 'Control de ortodoncia',
    };

    return labels[templateKey] ?? templateKey.replaceAll('_', ' ');
}

function messageTypeFromTemplateKey(templateKey: string | null) {
    if (!templateKey) return 'other';
    if (templateKey === 'appointment_confirmed') return 'appointment_confirmation';
    if (templateKey === 'appointment_cancelled') return 'appointment_cancellation';
    if (templateKey === 'survey_first_visit') return 'survey_first_visit';
    if (templateKey === 'survey_post_appointment') return 'survey_post_appointment';
    if (templateKey === 'reminder_24h' || templateKey === 'reminder_1h') return 'appointment_reminder';
    if (templateKey === 'doctor_daily_agenda' || templateKey === 'doctor_daily_agenda_manual_resend') return 'doctor_daily_agenda';
    if (templateKey === 'upgrade_cleaning_laser') return 'upsell';
    if (templateKey === 'cross_sell_cleaning_after_veneers') return 'cross_sell';
    if (templateKey === 'recall_orthodontic_control') return 'orthodontic_followup';
    if (templateKey?.startsWith('recall_')) return 'recall';
    return 'other';
}

function buildNotificationLogSubject(row: NotificationLogRecord) {
    const templateKey = row.template_key;
    const payload = row.payload ?? {};
    const clinicName = 'AM Clínica';
    const patientName = typeof payload.patientName === 'string' ? payload.patientName : 'Paciente';
    const doctorName = typeof payload.doctorName === 'string' ? payload.doctorName : undefined;
    const startTime = typeof payload.startTime === 'string' ? payload.startTime : new Date().toISOString();
    const appointmentType = typeof payload.appointmentType === 'string' ? payload.appointmentType : undefined;

    if (templateKey === 'survey_first_visit') return `¿Cómo fue tu primera visita? — ${clinicName}`;
    if (templateKey === 'doctor_daily_agenda' || templateKey === 'doctor_daily_agenda_manual_resend') {
        const agendaDate = typeof payload.agendaDate === 'string' ? payload.agendaDate : null;
        return agendaDate
            ? `Agenda diaria profesional · ${agendaDate}`
            : 'Agenda diaria profesional';
    }

    if (templateKey) {
        try {
            return renderTemplate(templateKey, {
                appointmentId: row.appointment_id ?? row.id,
                templateKey,
                channel: 'email',
                patientName,
                patientEmail: row.recipient_email,
                doctorName,
                startTime,
                endTime: startTime,
                appointmentType,
                clinicName,
            }).subject;
        } catch {
            return labelFromTemplateKey(templateKey);
        }
    }

    return 'Email operativo';
}

function mapNotificationLogToListRow(row: NotificationLogRecord): EmailMessageListRow {
    const payload = row.payload ?? {};
    const recipientName = typeof payload.patientName === 'string'
        ? payload.patientName
        : row.template_key?.includes('doctor_daily_agenda')
            ? 'Agenda diaria staff'
            : null;

    return {
        id: `${NOTIFICATION_LOG_ID_PREFIX}${row.id}`,
        created_at: row.sent_at ?? row.created_at,
        status: row.status || 'sent',
        provider: 'resend',
        to_email: row.recipient_email ?? 'Sin email',
        to_name: recipientName,
        subject: buildNotificationLogSubject(row),
        template_key: row.template_key,
        template_label: labelFromTemplateKey(row.template_key),
        message_type: messageTypeFromTemplateKey(row.template_key),
        source_module: row.template_key?.includes('doctor_daily_agenda') ? 'agenda_staff' : 'agenda',
        patient_id: null,
        appointment_id: row.appointment_id,
        provider_message_id: row.provider_id,
        error_message: row.error_message,
        sent_at: row.sent_at,
        delivered_at: null,
        data_source: 'notification_logs',
        source_reference: row.id,
        patient: recipientName
            ? {
                nombre: recipientName,
                apellido: null,
            }
            : null,
    };
}

function matchesFilters(row: EmailMessageListRow, filters: EmailMessageListFilters) {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.messageType && row.message_type !== filters.messageType) return false;
    if (filters.provider && row.provider !== filters.provider) return false;
    if (filters.sourceModule && row.source_module !== filters.sourceModule) return false;
    if (filters.query?.trim()) {
        const term = filters.query.trim().toLowerCase();
        const haystack = [
            row.to_email,
            row.to_name,
            row.subject,
            row.template_key,
            row.template_label,
            row.patient?.nombre,
            row.patient?.apellido,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        if (!haystack.includes(term)) return false;
    }

    return true;
}

export async function listEmailMessagesAction(filters: EmailMessageListFilters = {}): Promise<EmailMessageListRow[]> {
    await requireEmailAccess();
    const admin = createAdminClient();
    const historyStart = buildHistoryWindowStart();

    let query = admin
        .from('email_messages')
        .select(`
            id,
            created_at,
            status,
            provider,
            to_email,
            to_name,
            subject,
            template_key,
            template_label,
            message_type,
            source_module,
            patient_id,
            appointment_id,
            provider_message_id,
            error_message,
            sent_at,
            delivered_at,
            opened_at,
            clicked_at,
            patient:patient_id(nombre, apellido)
        `)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(200);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.messageType) query = query.eq('message_type', filters.messageType);
    if (filters.provider) query = query.eq('provider', filters.provider);
    if (filters.sourceModule) query = query.eq('source_module', filters.sourceModule);
    if (filters.query?.trim()) {
        const term = filters.query.trim();
        query = query.or(`to_email.ilike.%${term}%,to_name.ilike.%${term}%,subject.ilike.%${term}%`);
    }

    const { data, error } = await query;

    let emailRows: EmailMessageListRow[] = [];
    if (error) {
        if (!isMissingRelationError(error.message)) {
            console.error('[email-messages] list failed:', error.message);
        }
    } else {
        emailRows = ((data ?? []) as EmailMessageListRow[]).map((row) => ({
            ...row,
            data_source: 'email_messages',
            source_reference: row.id,
        }));
    }

    const { data: notificationData, error: notificationError } = await admin
        .from('notification_logs')
        .select(`
            id,
            created_at,
            sent_at,
            status,
            template_key,
            recipient_email,
            provider_id,
            error_message,
            payload,
            appointment_id
        `)
        .eq('channel', 'email')
        .gte('sent_at', historyStart)
        .order('sent_at', { ascending: false })
        .limit(200);

    let notificationRows: EmailMessageListRow[] = [];
    if (notificationError) {
        console.warn('[email-messages] notification_logs fallback skipped:', notificationError.message);
    } else {
        notificationRows = ((notificationData ?? []) as NotificationLogRecord[])
            .map(mapNotificationLogToListRow)
            .filter((row) => matchesFilters(row, filters));
    }

    return [...emailRows, ...notificationRows]
        .filter((row) => matchesFilters(row, filters))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 200);
}

export async function getEmailMessageDetailAction(id: string): Promise<EmailMessageDetail | null> {
    await requireEmailAccess();
    const admin = createAdminClient();

    if (id.startsWith(NOTIFICATION_LOG_ID_PREFIX)) {
        const notificationId = id.slice(NOTIFICATION_LOG_ID_PREFIX.length);
        const { data, error } = await admin
            .from('notification_logs')
            .select(`
                id,
                created_at,
                sent_at,
                status,
                template_key,
                recipient_email,
                provider_id,
                error_message,
                payload,
                appointment_id
            `)
            .eq('id', notificationId)
            .single();

        if (error || !data) {
            console.error('[email-messages] notification detail failed:', error?.message ?? 'missing notification');
            return null;
        }

        const mapped = mapNotificationLogToListRow(data as NotificationLogRecord);

        return {
            ...mapped,
            from_email: process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? null,
            reply_to: null,
            cc: [],
            bcc: [],
            html_snapshot: null,
            text_snapshot: null,
            payload: (data as NotificationLogRecord).payload ?? {},
            metadata: {
                history_window_days: EMAIL_HISTORY_WINDOW_DAYS,
                fallback_source: 'notification_logs',
            },
            queued_at: null,
            bounced_at: null,
            opened_at: null,
            clicked_at: null,
            data_source: 'notification_logs',
            source_reference: notificationId,
        };
    }

    const { data, error } = await admin
        .from('email_messages')
        .select(`
            id,
            created_at,
            status,
            provider,
            to_email,
            to_name,
            subject,
            template_key,
            template_label,
            message_type,
            source_module,
            patient_id,
            appointment_id,
            provider_message_id,
            error_message,
            sent_at,
            delivered_at,
            from_email,
            reply_to,
            cc,
            bcc,
            html_snapshot,
            text_snapshot,
            payload,
            metadata,
            queued_at,
            bounced_at,
            opened_at,
            clicked_at,
            patient:patient_id(nombre, apellido)
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('[email-messages] detail failed:', error.message);
        return null;
    }

    return data as EmailMessageDetail;
}

export async function listScheduledEmailMessagesAction(): Promise<ScheduledEmailRow[]> {
    await requireEmailAccess();
    const admin = createAdminClient();

    const { data, error } = await admin
        .from('scheduled_messages')
        .select(`
            id,
            scheduled_for,
            email,
            subject,
            message,
            patient_id,
            patient:patient_id(nombre, apellido)
        `)
        .eq('channel', 'email')
        .gte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(100);

    if (error) {
        console.warn('[email-messages] scheduled email list skipped:', error.message);
        return [];
    }

    return (data ?? []) as ScheduledEmailRow[];
}

export async function getEmailProviderStatusAction() {
    await requireEmailAccess();
    return buildProviderStatus({
        resendApiKey: process.env.RESEND_API_KEY,
        resendFrom: process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM,
        brevoApiKey: process.env.BREVO_API_KEY,
    });
}

// ─── Resultados: pacientes recuperados y opiniones ──────────────────────────

const OUTCOMES_WINDOW_DAYS = 90;

export interface RecoveredPatientRow {
    id: string;
    patient_id: string;
    patient_name: string;
    recall_type: string;
    custom_label: string | null;
    state: 'scheduled' | 'completed';
    updated_at: string;
}

export interface PatientOpinionRow {
    id: string;
    patient_id: string | null;
    patient_name: string;
    rating: number | null;
    feedback: string | null;
    responded_at: string;
}

export interface CommunicationOutcomes {
    windowDays: number;
    recovered: RecoveredPatientRow[];
    opinions: PatientOpinionRow[];
    recallPipeline: { pending: number; contacted: number; scheduled: number; completed: number };
    surveysSent: number;
    surveysResponded: number;
    averageRating: number | null;
    promoters: number; // ratings >= 4 (redirected to Google review)
}

async function fetchPatientNames(
    admin: ReturnType<typeof createAdminClient>,
    ids: string[]
): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return names;

    const { data } = await admin
        .from('pacientes')
        .select('id_paciente, nombre, apellido')
        .in('id_paciente', unique);

    for (const p of data ?? []) {
        names.set(p.id_paciente, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim());
    }
    return names;
}

export async function getCommunicationOutcomesAction(): Promise<CommunicationOutcomes> {
    await requireEmailAccess();
    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - OUTCOMES_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [recallsRes, surveysRes] = await Promise.all([
        admin
            .from('recall_rules')
            .select('id, patient_id, recall_type, custom_label, state, updated_at')
            .eq('is_active', true)
            .gte('updated_at', windowStart)
            .order('updated_at', { ascending: false })
            .limit(500),
        admin
            .from('satisfaction_surveys')
            .select('id, patient_id, rating, feedback, sent_at, responded_at')
            .gte('sent_at', windowStart)
            .order('responded_at', { ascending: false, nullsFirst: false })
            .limit(500),
    ]);

    if (recallsRes.error) console.warn('[email-messages] outcomes recalls skipped:', recallsRes.error.message);
    if (surveysRes.error) console.warn('[email-messages] outcomes surveys skipped:', surveysRes.error.message);

    type RecallRow = {
        id: string;
        patient_id: string;
        recall_type: string;
        custom_label: string | null;
        state: string;
        updated_at: string;
    };
    type SurveyRow = {
        id: string;
        patient_id: string | null;
        rating: number | null;
        feedback: string | null;
        sent_at: string | null;
        responded_at: string | null;
    };

    const recalls = (recallsRes.data ?? []) as RecallRow[];
    const surveys = (surveysRes.data ?? []) as SurveyRow[];

    const patientNames = await fetchPatientNames(admin, [
        ...recalls.map((r) => r.patient_id as string),
        ...surveys.map((s) => s.patient_id as string),
    ]);

    const recallPipeline = { pending: 0, contacted: 0, scheduled: 0, completed: 0 };
    const recovered: RecoveredPatientRow[] = [];
    for (const r of recalls) {
        if (r.state === 'pending_contact') recallPipeline.pending += 1;
        else if (r.state === 'contacted') recallPipeline.contacted += 1;
        else if (r.state === 'scheduled') recallPipeline.scheduled += 1;
        else if (r.state === 'completed') recallPipeline.completed += 1;

        if (r.state === 'scheduled' || r.state === 'completed') {
            recovered.push({
                id: r.id,
                patient_id: r.patient_id,
                patient_name: patientNames.get(r.patient_id) || 'Paciente',
                recall_type: r.recall_type,
                custom_label: r.custom_label,
                state: r.state,
                updated_at: r.updated_at,
            });
        }
    }

    const responded = surveys.filter((s) => s.responded_at);
    const ratings = responded.map((s) => s.rating).filter((r): r is number => typeof r === 'number');
    const opinions: PatientOpinionRow[] = responded.map((s) => ({
        id: s.id,
        patient_id: s.patient_id,
        patient_name: s.patient_id ? (patientNames.get(s.patient_id) || 'Paciente') : 'Paciente',
        rating: s.rating,
        feedback: s.feedback,
        responded_at: s.responded_at as string,
    }));

    return {
        windowDays: OUTCOMES_WINDOW_DAYS,
        recovered,
        opinions,
        recallPipeline,
        surveysSent: surveys.length,
        surveysResponded: responded.length,
        averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        promoters: ratings.filter((r) => r >= 4).length,
    };
}
