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

export function generateInvitationMessage(nombre: string, link: string): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
        <tr><td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0;">
            <tr><td align="center" style="background-color: #000000; padding: 20px 0;">
              <h2 style="color: #ffffff; margin: 0;">AM Clínica</h2>
            </td></tr>
            <tr><td style="padding: 30px;">
              <h2 style="color: #333333;">¡Hola, ${nombre}!</h2>
              <p style="color: #555555; line-height: 1.6;">Has sido invitado a formar parte del equipo de <strong>AM Clínica – Operativa 360</strong>.</p>
              
              <p style="color: #555555;">Para activar tu cuenta y establecer tu contraseña, por favor haz clic en el siguiente enlace:</p>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="background-color: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  Aceptar Invitación
                </a>
              </p>
              
              <p style="font-size: 14px; color: #777777; line-height: 1.5;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${link}" style="color: #333333;">${link}</a>
              </p>
              
              <p style="font-size: 14px; text-align: center; color: #999999; margin-top: 40px;">
                Este enlace es válido por 24 horas. Si no solicitaste esta invitación, puedes ignorar este correo.
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;
}
