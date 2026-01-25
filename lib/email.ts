
import emailjs from '@emailjs/nodejs';

const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

// You need to get these IDs from your EmailJS dashboard
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'contact_service';
const TEMPLATE_ID_WELCOME = process.env.EMAILJS_TEMPLATE_ID_WELCOME || 'welcome_template';

interface EmailParams {
    to_name: string;
    to_email: string;
    message?: string;
    [key: string]: string | undefined;
}

export async function sendWelcomeEmail(toName: string, toEmail: string, whatsapp?: string) {
    if (!PUBLIC_KEY || !PRIVATE_KEY) {
        console.warn('EmailJS keys missing. Skipping email.');
        return;
    }

    try {
        const templateParams = {
            to_name: toName,
            to_email: toEmail,
            whatsapp_link: whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : '',
            message: 'Bienvenido a AM Clínica. Estamos felices de acompañarte en tu tratamiento.',
        };

        const response = await emailjs.send(
            SERVICE_ID,
            TEMPLATE_ID_WELCOME,
            templateParams,
            {
                publicKey: PUBLIC_KEY,
                privateKey: PRIVATE_KEY,
            }
        );

        console.log('Welcome Email Sent!', response.status, response.text);
        return { success: true, response };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error };
    }
}

/**
 * Send a payment confirmation email.
 * Uses the EMAILJS_TEMPLATE_ID_PAYMENT environment variable.
 */
export async function sendPaymentEmail(toName: string, toEmail: string, amountUsd: number, description?: string) {
    if (!PUBLIC_KEY || !PRIVATE_KEY) {
        console.warn('EmailJS keys missing. Skipping email.');
        return;
    }
    const TEMPLATE_ID_PAYMENT = process.env.EMAILJS_TEMPLATE_ID_PAYMENT || 'payment_template_placeholder';
    try {
        const templateParams = {
            to_name: toName,
            to_email: toEmail,
            amount_usd: amountUsd.toString(),
            description: description || '',
        };
        const response = await emailjs.send(
            SERVICE_ID,
            TEMPLATE_ID_PAYMENT,
            templateParams,
            {
                publicKey: PUBLIC_KEY,
                privateKey: PRIVATE_KEY,
            }
        );
        console.log('Payment Email Sent!', response.status, response.text);
        return { success: true, response };
    } catch (error) {
        console.error('Failed to send payment email:', error);
        return { success: false, error };
    }
}
