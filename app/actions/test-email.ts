'use server';

import { sendEmail } from '@/lib/nodemailer';

export async function testEmailAction(toEmail: string) {
    const result = await sendEmail({
        to: toEmail,
        subject: '🧪 Prueba de Email - AM Clínica',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #000;">¡El sistema de emails funciona! 🎉</h2>
                <p>Este es un correo de prueba enviado desde AM Clínica usando Resend (infraestructura centralizada).</p>
                <p style="color: #666; font-size: 14px;">Fecha: ${new Date().toLocaleString('es-AR')}</p>
            </div>
        `
    });

    return result;
}
