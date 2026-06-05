import 'server-only';
import { render } from '@react-email/render';
import { PremiumWelcomeEmail } from '../emails/PremiumWelcome';
import { PremiumInvitationEmail } from '../emails/PremiumInvitation';
import { sendResendEmail } from './resend-email';
import * as templates from './email-templates';
import { createAdminClient } from '@/utils/supabase/admin';
import {
    normalizeEmailMessageRecipients,
    redactSensitiveEmailHtml,
} from '@/lib/email-message-tracking';
import type { EmailMessageType } from '@/lib/email-message-tracking';

/**
 * Centralized Email Service using Resend.
 * This service replaces all previous instances of Nodemailer/Gmail/EmailJS.
 */

interface Attachment {
    filename: string;
    content: string; // Base64
    contentType?: string;
}

interface EmailTraceMetadata {
    messageType?: EmailMessageType;
    sourceModule?: string;
    templateKey?: string;
    templateLabel?: string;
    patientId?: string | null;
    appointmentId?: string | null;
    workflowId?: string | null;
    treatmentId?: string | null;
    scheduledMessageId?: string | null;
    createdBy?: string | null;
    toName?: string | null;
    textSnapshot?: string | null;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

interface SendEmailInput extends EmailTraceMetadata {
    from?: string;
    to: string | string[];
    subject: string;
    html: string;
    attachments?: Attachment[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    idempotencyKey?: string;
}

function canTraceEmailMessages() {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function createEmailTrace(input: SendEmailInput) {
    if (!canTraceEmailMessages()) return [];

    const recipients = normalizeEmailMessageRecipients(input.to);
    if (recipients.length === 0) return [];

    try {
        const supabase = createAdminClient();
        const rows = recipients.map((toEmail) => ({
            direction: 'outbound',
            status: 'sending',
            provider: 'resend',
            from_email: input.from ?? process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? null,
            to_email: toEmail,
            to_name: input.toName ?? null,
            cc: normalizeEmailMessageRecipients(input.cc),
            bcc: normalizeEmailMessageRecipients(input.bcc),
            reply_to: input.replyTo ?? null,
            subject: input.subject,
            template_key: input.templateKey ?? null,
            template_label: input.templateLabel ?? null,
            message_type: input.messageType ?? 'other',
            source_module: input.sourceModule ?? 'email_service',
            patient_id: input.patientId ?? null,
            appointment_id: input.appointmentId ?? null,
            workflow_id: input.workflowId ?? null,
            treatment_id: input.treatmentId ?? null,
            scheduled_message_id: input.scheduledMessageId ?? null,
            idempotency_key: recipients.length === 1 ? input.idempotencyKey ?? null : null,
            html_snapshot: redactSensitiveEmailHtml(input.html),
            text_snapshot: input.textSnapshot ?? null,
            payload: input.payload ?? {},
            metadata: input.metadata ?? {},
            queued_at: new Date().toISOString(),
            created_by: input.createdBy ?? null,
        }));

        const { data, error } = await supabase
            .from('email_messages')
            .insert(rows)
            .select('id');

        if (error) {
            console.warn('[EmailService] email trace insert skipped:', error.message);
            return [];
        }

        return (data ?? []).map((row: { id: string }) => row.id);
    } catch (error) {
        console.warn('[EmailService] email trace insert failed:', error instanceof Error ? error.message : String(error));
        return [];
    }
}

async function updateEmailTrace(
    traceIds: string[],
    result: { success: boolean; id?: string; error?: unknown; provider?: string }
) {
    if (!traceIds.length || !canTraceEmailMessages()) return;

    try {
        const supabase = createAdminClient();
        const status = result.success ? 'sent' : 'failed';
        const update = {
            status,
            provider: result.provider ?? 'resend',
            provider_message_id: result.id ?? null,
            error_message: result.success ? null : String(result.error || 'unknown_error'),
            sent_at: result.success ? new Date().toISOString() : null,
        };

        const { error } = await supabase
            .from('email_messages')
            .update(update)
            .in('id', traceIds);

        if (error) {
            console.warn('[EmailService] email trace update skipped:', error.message);
        }
    } catch (error) {
        console.warn('[EmailService] email trace update failed:', error instanceof Error ? error.message : String(error));
    }
}

export const EmailService = {
    /**
     * Sends a generic email using Resend.
     */
    async send(input: SendEmailInput) {
        const {
            from,
            to,
            subject,
            html,
            attachments,
            cc,
            bcc,
            replyTo,
            idempotencyKey
        } = input;

        const traceIds = await createEmailTrace(input);
        const result = await sendResendEmail({
            from,
            to,
            subject,
            html,
            attachments,
            cc,
            bcc,
            replyTo,
            idempotencyKey
        });

        await updateEmailTrace(traceIds, result);
        return result;
    },


    /**
     * Sends a Welcome Email (Premium style)
     */
    async sendWelcome(name: string, email: string) {
        // Render current React Email template to HTML string
        const html = await render(PremiumWelcomeEmail({ patientName: name }));
        
        return this.send({
            to: email,
            subject: 'Bienvenido a la Experiencia AM Clínica ✨',
            html,
            messageType: 'portal_invitation',
            sourceModule: 'patients',
            templateKey: 'premium_welcome',
            templateLabel: 'Bienvenida premium',
        });
    },

    /**
     * Sends a Magic Link email
     */
    async sendMagicLink(name: string, email: string, link: string) {
        const html = templates.generatePatientMagicLinkEmail(name, link);
        
        return this.send({
            to: email,
            subject: 'Acceso Seguro — Tu Llave Digital está Lista',
            html,
            messageType: 'portal_invitation',
            sourceModule: 'patient_portal',
            templateKey: 'patient_magic_link',
            templateLabel: 'Acceso seguro paciente',
        });
    },

    /**
     * Sends an Invitation email (Team/Staff)
     */
    async sendInvitation(name: string, email: string, link: string, role?: string) {
        // Render current React Email template to HTML string
        const html = await render(PremiumInvitationEmail({ 
            name, 
            inviteLink: link,
            role: role || 'Equipo AM'
        }));
        
        return this.send({
            to: email,
            subject: `Únete al Equipo de AM Clínica 🏥`,
            html,
            messageType: 'portal_invitation',
            sourceModule: 'worker_portal',
            templateKey: 'premium_invitation',
            templateLabel: 'Invitacion equipo AM',
        });
    },

    /**
     * Sends a Payment Confirmation email
     */
    async sendPaymentConfirmation(name: string, email: string, amountUsd: number, description?: string) {
        const html = templates.generatePaymentConfirmationEmail(name, amountUsd, description);
        
        return this.send({
            to: email,
            subject: 'Comprobante de Pago Confirmado — AM Clínica',
            html,
            messageType: 'payment_confirmation',
            sourceModule: 'payments',
            templateKey: 'payment_confirmation',
            templateLabel: 'Confirmacion de pago',
        });
    },

    /**
     * Sends a Budget (Presupuesto) email
     */
    async sendBudget(name: string, email: string, budgetUrl: string, amount?: string) {
        const html = templates.generateBudgetEmail(name, budgetUrl, amount);

        return this.send({
            to: email,
            subject: 'Presupuesto Estimado — AM Estética Dental',
            html,
            messageType: 'budget',
            sourceModule: 'budgets',
            templateKey: 'budget',
            templateLabel: 'Presupuesto',
        });
    },

    /**
     * Sends a Form Submission Confirmation
     */
    async sendFormConfirmation(name: string, email: string, formName?: string) {
        const html = templates.generateFormSubmissionConfirmationEmail(name, formName);
        const subject = formName ? `Recibimos tu ${formName} — AM Clínica` : 'Formulario Recibido — AM Clínica';

        return this.send({
            to: email,
            subject,
            html,
            messageType: 'other',
            sourceModule: 'forms',
            templateKey: 'form_confirmation',
            templateLabel: 'Confirmacion formulario',
        });
    },

    /**
     * Sends a Password Reset email
     */
    async sendPasswordReset(name: string, email: string, link: string) {
        const html = templates.generatePasswordResetEmail(name, link);

        return this.send({
            to: email,
            subject: 'Restablecer tu Contraseña — AM Clínica',
            html,
            messageType: 'password_reset',
            sourceModule: 'auth',
            templateKey: 'password_reset',
            templateLabel: 'Restablecer contrasena',
        });
    }
};
