'use server';

import { EmailService } from '@/lib/email-service';

export async function sendWelcomeEmailAction(toName: string, toEmail: string) {
    try {
        const response = await EmailService.sendWelcome(toName, toEmail);

        if (response.success) {
            console.log('Welcome Email Sent (Action)!', (response as any).id);
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
        const response = await EmailService.sendInvitation(toName, toEmail, link);

        if (response.success) {
            return { success: true };
        } else {
            return { success: false, error: String(response.error) };
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function sendMagicLinkEmailAction(toName: string, toEmail: string, link: string) {
    try {
        const response = await EmailService.sendMagicLink(toName, toEmail, link);
        return response;
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

export async function sendBudgetEmailAction(toName: string, toEmail: string, budgetUrl: string, amount?: string) {
    try {
        const response = await EmailService.sendBudget(toName, toEmail, budgetUrl, amount);
        return response;
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

export async function sendFormConfirmationEmailAction(toName: string, toEmail: string, formName?: string) {
    try {
        const response = await EmailService.sendFormConfirmation(toName, toEmail, formName);
        return response;
    } catch (error) {
        return { success: false, error: String(error) };
    }
}
export async function sendSecurityAlertAction(details: {
    userName: string;
    movementId: string;
    field: string;
    oldValue: string;
    newValue: string;
    reason: string;
    patientName?: string;
}) {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
        if (!adminEmail) {
            console.error('No admin email configured for security alerts');
            return { success: false, error: 'No admin email configured' };
        }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 12px; overflow: hidden;">
                <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
                    <h2 style="margin: 0;">⚠️ ALERTA DE SEGURIDAD</h2>
                    <p style="margin: 5px 0 0 0;">Modificación de Registro Crítico</p>
                </div>
                <div style="padding: 24px; background-color: #ffffff;">
                    <p>Se ha detectado una modificación manual en un registro de caja que requiere atención:</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Editor:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">${details.userName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Paciente:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6;">${details.patientName || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Campo Modificado:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #ef4444; font-weight: bold;">${details.field.toUpperCase()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Valor Anterior:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; text-decoration: line-through; color: #9ca3af;">${details.oldValue}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Valor Nuevo:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #059669; font-weight: bold;">${details.newValue}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Motivo Declarado:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; font-style: italic;">"${details.reason}"</td>
                        </tr>
                    </table>

                    <div style="margin-top: 30px; padding: 15px; background-color: #f9fafb; border-radius: 8px; font-size: 13px; color: #6b7280;">
                        ID de Movimiento: ${details.movementId}<br>
                        Fecha del Reporte: ${new Date().toLocaleString('es-AR')}
                    </div>
                </div>
                <div style="background-color: #fef2f2; padding: 15px; text-align: center; font-size: 12px; color: #991b1b;">
                    Este es un aviso automático generado por AM Clínica Operativa 360.
                </div>
            </div>
        `;

        const response = await EmailService.send({
            to: adminEmail,
            subject: `⚠️ ALERTA: Modificación en Caja - ${details.userName}`,
            html
        });

        return response;
    } catch (error) {
        console.error('Failed to send security alert:', error);
        return { success: false, error: String(error) };
    }
}

export async function sendReciboEmailAction(payload: {
    toEmail: string;
    pacienteNombre: string;
    reciboNumero: string;
    concepto: string;
    monto: number;
    moneda: string;
    imageDataUrl: string;
    storageUrl?: string;
}) {
    try {
        const email = (payload.toEmail || '').trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return { success: false, error: 'Email invalido' };
        }

        const base64Image = payload.imageDataUrl?.split(',')[1];
        if (!base64Image) {
            return { success: false, error: 'No se pudo adjuntar el comprobante' };
        }

        const currencyCode = (payload.moneda || 'ARS').toUpperCase();
        const safeCurrencyCode = currencyCode === 'USD' || currencyCode === 'ARS' ? currencyCode : 'ARS';
        const amountLabel = `${safeCurrencyCode} ${new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(payload.monto || 0)}`;

        const html = `
            <div style="font-family: Arial, sans-serif; color: #111827; max-width: 640px; margin: 0 auto;">
                <h2 style="margin: 0 0 10px;">Comprobante de Pago</h2>
                <p style="margin: 0 0 12px;">Hola ${payload.pacienteNombre || 'Paciente'}, te compartimos tu comprobante de pago.</p>
                <ul style="margin: 0 0 14px; padding-left: 18px;">
                    <li><strong>Numero:</strong> ${payload.reciboNumero}</li>
                    <li><strong>Concepto:</strong> ${payload.concepto}</li>
                    <li><strong>Monto:</strong> ${amountLabel}</li>
                </ul>
                ${payload.storageUrl ? `<p style="margin: 0 0 12px;"><a href="${payload.storageUrl}">Ver comprobante online</a></p>` : ''}
                <p style="margin: 0; color: #4b5563;">Gracias por confiar en AM Clinica.</p>
            </div>
        `;

        const response = await EmailService.send({
            to: email,
            subject: `Comprobante de Pago - Recibo ${payload.reciboNumero}`,
            html,
            attachments: [
                {
                    filename: `recibo-${payload.reciboNumero}.jpg`,
                    content: base64Image,
                    contentType: 'image/jpeg',
                },
            ],
        });

        if (!response.success) {
            return { success: false, error: String(response.error || 'No se pudo enviar email') };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
