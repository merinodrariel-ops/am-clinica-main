import 'server-only';
import { sendResendEmail } from './resend-email';
import * as templates from './email-templates';

/**
 * Centralized Email Service using Resend.
 * This service replaces all previous instances of Nodemailer/Gmail/EmailJS.
 */

interface Attachment {
    filename: string;
    content: string; // Base64
    contentType?: string;
}

export const EmailService = {
    /**
     * Sends a generic email using Resend.
     */
    async send({
        to,
        subject,
        html,
        attachments,
        cc,
        bcc,
        replyTo
    }: {
        to: string | string[];
        subject: string;
        html: string;
        attachments?: Attachment[];
        cc?: string | string[];
        bcc?: string | string[];
        replyTo?: string;
    }) {
        return sendResendEmail({
            to,
            subject,
            html,
            attachments,
            cc,
            bcc,
            replyTo
        });
    },

    /**
     * Sends a Welcome Email (Premium style)
     */
    async sendWelcome(name: string, email: string) {
        const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/portal`;
        const html = templates.generatePremiumWelcomeEmail(name, portalUrl);
        
        return this.send({
            to: email,
            subject: 'Bienvenido a AM Clínica — Excelencia y Minimalismo',
            html
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
            html
        });
    },

    /**
     * Sends an Invitation email
     */
    async sendInvitation(name: string, email: string, link: string) {
        const html = templates.generateInvitationMessage(name, link);
        
        return this.send({
            to: email,
            subject: `Invitación Exclusiva — Equipo AM`,
            html
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
            html
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
            html
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
            html
        });
    }
};
