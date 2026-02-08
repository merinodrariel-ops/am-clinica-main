import { sendEmail } from '@/lib/nodemailer';

export async function sendWelcomeEmail(toName: string, toEmail: string, whatsapp?: string) {
    try {
        const whatsappLink = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : '';
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <h2>Bienvenido a AM Clínica</h2>
                <p>Hola ${toName},</p>
                <p>Estamos felices de acompañarte en tu tratamiento.</p>
                ${whatsappLink ? `<p>WhatsApp: <a href="${whatsappLink}">${whatsappLink}</a></p>` : ''}
            </body>
            </html>
        `;

        const response = await sendEmail({
            to: toEmail,
            subject: 'Bienvenido a AM Clínica',
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
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <h2>Confirmación de Pago</h2>
                <p>Hola ${toName},</p>
                <p>Hemos recibido tu pago de <strong>USD ${amountUsd}</strong>.</p>
                ${description ? `<p>Concepto: ${description}</p>` : ''}
                <p>Gracias por confiar en nosotros.</p>
            </body>
            </html>
        `;

        const response = await sendEmail({
            to: toEmail,
            subject: 'Comprobante de Pago - AM Clínica',
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
