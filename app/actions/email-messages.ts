'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { buildProviderStatus } from '@/lib/email-message-tracking';

const ALLOWED_EMAIL_ROLES = new Set(['owner', 'admin', 'reception', 'developer']);

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

export async function listEmailMessagesAction(filters: EmailMessageListFilters = {}): Promise<EmailMessageListRow[]> {
    await requireEmailAccess();
    const admin = createAdminClient();

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
    if (error) {
        console.error('[email-messages] list failed:', error.message);
        return [];
    }

    return (data ?? []) as EmailMessageListRow[];
}

export async function getEmailMessageDetailAction(id: string): Promise<EmailMessageDetail | null> {
    await requireEmailAccess();
    const admin = createAdminClient();

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
