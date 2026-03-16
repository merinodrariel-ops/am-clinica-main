import { EmailService } from './email-service';

export async function sendWelcomeEmail(toName: string, toEmail: string, whatsapp?: string) {
    try {
        const response = await EmailService.sendWelcome(toName, toEmail);

        if (response.success) {
            console.log('Welcome Email Sent!', (response as any).id);
            return { success: true };
        } else {
            console.error('Failed to send email:', (response as any).error);
            return { success: false, error: String((response as any).error) };
        }
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function sendPaymentEmail(toName: string, toEmail: string, amountUsd: number, description?: string) {
    try {
        const response = await EmailService.sendPaymentConfirmation(toName, toEmail, amountUsd, description);

        if (response.success) {
            console.log('Payment Email Sent!', (response as any).id);
            return { success: true };
        } else {
            console.error('Failed to send payment email:', (response as any).error);
            return { success: false, error: String((response as any).error) };
        }
    } catch (error) {
        console.error('Failed to send payment email:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
