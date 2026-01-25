// EmailJS Configuration
// https://www.emailjs.com/

const EMAILJS_PUBLIC_KEY = 'WLKfesrk0_vbak-FE';
const EMAILJS_SERVICE_ID = 'default_service'; // You may need to update this
const EMAILJS_TEMPLATE_ID = 'template_welcome'; // You may need to update this

interface EmailData {
    to_email: string;
    to_name: string;
    message: string;
    website_link?: string;
    whatsapp_link?: string;
    maps_link?: string;
}

export async function sendWelcomeEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                service_id: EMAILJS_SERVICE_ID,
                template_id: EMAILJS_TEMPLATE_ID,
                user_id: EMAILJS_PUBLIC_KEY,
                template_params: {
                    to_email: data.to_email,
                    to_name: data.to_name,
                    message: data.message,
                    website_link: data.website_link || 'https://amesteticadental.com',
                    whatsapp_link: data.whatsapp_link || 'https://wa.me/5491112345678',
                    maps_link: data.maps_link || 'https://goo.gl/maps/example',
                },
            }),
        });

        if (response.ok) {
            return { success: true };
        } else {
            const errorText = await response.text();
            return { success: false, error: errorText };
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export function generateWelcomeMessage(nombre: string): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
        <tr><td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0;">
            <tr><td align="center" style="background-color: #000000; padding: 20px 0;">
              <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="Logo AM Estética Dental" height="50" style="display: block; height: 50px;">
            </td></tr>
            <tr><td style="padding: 30px;">
              <h2 style="color: #333333;">¡Hola, ${nombre}!</h2>
              <p style="color: #555555; line-height: 1.6;">Gracias por completar tu ficha. Estás a solo dos pasos de confirmar tu cita en AM Estética Dental - Puerto Madero.</p>
              
              <h3 style="color: #333333; border-bottom: 1px solid #eeeeee; padding-bottom: 10px;">Paso 1: Realiza el pago</h3>
              <p style="color: #555555;">Para poder acceder a la agenda, primero es necesario completar el pago a través del siguiente enlace:</p>
              <p style="text-align: center; margin: 20px 0;">
                <a href="https://mpago.la/2rjmF2W" style="background-color: #111111; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">Pagar Consulta Dr. Merino</a>
              </p>

              <h3 style="color: #333333; border-bottom: 1px solid #eeeeee; padding-bottom: 10px;">Paso 2: Elige tu turno</h3>
              <p style="color: #555555;">Una vez realizado el pago, haz clic aquí para ver la disponibilidad y seleccionar tu horario:</p>
              <p style="text-align: center; margin: 20px 0;">
                <a href="https://calendar.app.google/oc4VZPzsDkhwB3r58" style="background-color: #111111; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">Ver Disponibilidad y Agendar</a>
              </p>
              <p style="font-size: 14px; text-align: center; color: #777777;">¿No encuentras un horario? <a href="https://wa.link/zolb52" style="color: #111111;">Contáctanos por WhatsApp</a>.</p>
            </td></tr>
            <tr><td style="background-color: #f8f8f8; padding: 20px 30px;">
              <h4 style="color: #333333; margin-top: 0;">Información Importante</h4>
              <p style="color: #555555; font-size: 14px; line-height: 1.8;">
                <strong>Dirección:</strong> Camila O'Gorman 412, Piso 17, Depto. 1701, Puerto Madero. <a href="https://maps.app.goo.gl/4uU7dtb4Q1RYHeVw8" style="color: #111111;">Ver mapa</a>.<br>
                <strong>Tolerancia:</strong> 15 minutos. Luego, el turno se cancela.<br>
                <strong>Acompañantes:</strong> No está permitido concurrir con acompañantes.<br>
                <strong>Cancelación:</strong> Debe ser con 24hs de anticipación para reasignar sin cargo.
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;
}
