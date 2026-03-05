import { sendEmail } from '@/lib/nodemailer';
import { generatePremiumWelcomeEmail, generatePaymentConfirmationEmail } from '@/lib/email-templates';

export async function sendWelcomeEmail(toName: string, toEmail: string, whatsapp?: string) {
    try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://clinica.arielmerino.com';
        const portalUrl = `${siteUrl}/portal`;

        const html = generatePremiumWelcomeEmail(toName, portalUrl);

        const response = await sendEmail({
            to: toEmail,
            subject: 'Bienvenido a AM Estética Dental — Excelencia y Minimalismo',
            html
        });

        if (response.success) {
            console.log('Welcome Email Sent!', response.messageId);
            return { success: true };
        } else {
            console.error('Failed to send email:', response.error);
            return { success: false, error: String(response.error) };
        }
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error };
    }
}

export async function sendPaymentEmail(toName: string, toEmail: string, amountUsd: number, description?: string) {
    try {
        const html = generatePaymentConfirmationEmail(toName, amountUsd, description);

        const response = await sendEmail({
            to: toEmail,
            subject: 'Comprobante de Pago Confirmado — AM Clínica',
            html
        });

        if (response.success) {
            console.log('Payment Email Sent!', response.messageId);
            return { success: true };
        } else {
            console.error('Failed to send payment email:', response.error);
            return { success: false, error: String(response.error) };
        }
    } catch (error) {
        console.error('Failed to send payment email:', error);
        return { success: false, error };
    }
}
