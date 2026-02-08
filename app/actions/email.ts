'use server';

import { sendEmail } from '@/lib/nodemailer';
import { generateWelcomeMessage, generateInvitationMessage } from '@/lib/email-templates';

export async function sendWelcomeEmailAction(toName: string, toEmail: string, whatsapp?: string) {
    try {
        // Use the template generator if available, or fallback to simple HTML
        const html = generateWelcomeMessage(toName);

        const response = await sendEmail({
            to: toEmail,
            subject: 'Bienvenido a AM Clínica',
            html
        });

        if (response.success) {
            console.log('Welcome Email Sent (Action)!', response.messageId);
            return { success: true };
        } else {
            console.error('Failed to send email (Action):', response.error);
            return { success: false, error: String(response.error) };
        }
    } catch (error) {
        console.error('Failed to send email (Action):', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function sendInvitationEmailAction(toName: string, toEmail: string, link: string) {
    try {
        const html = generateInvitationMessage(toName, link);

        const response = await sendEmail({
            to: toEmail,
            subject: `Invitación a AM Clínica - ${toName}`,
            html
        });

        if (response.success) {
            return { success: true };
        } else {
            return { success: false, error: String(response.error) };
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
