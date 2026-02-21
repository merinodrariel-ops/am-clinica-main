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

export function generatePatientMagicLinkEmail(nombre: string, link: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso a tu Portal — AM Clínica</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:40px 40px 32px;">
            <p style="margin:0 0 8px;color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:3px;text-transform:uppercase;">AM Clínica · Puerto Madero</p>
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Portal de Pacientes</h1>
            <p style="margin:12px 0 0;color:rgba(255,255,255,0.5);font-size:13px;">Acceso seguro y personalizado</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Hola, ${nombre}</p>
            <h2 style="margin:0 0 20px;color:#0f172a;font-size:22px;font-weight:700;line-height:1.3;">Tu portal de clínica está listo para que lo explores</h2>
            <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;">
              Desde tu portal podés ver tu historia clínica, estudios, diseño de sonrisa y mucho más.
              Pulsá el botón de abajo para entrar. <strong>Este enlace expira en 24 horas</strong> y es de uso personal.
            </p>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:0 0 32px;">
                <a href="${link}"
                   style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:12px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(99,102,241,0.35);">
                  ✨ &nbsp; Ingresar a Mi Portal
                </a>
              </td></tr>
            </table>

            <!-- Security note -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;">
              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
                🔒 <strong>Enlace de uso único.</strong> Si no solicitaste este acceso, podés ignorar este correo — nadie podrá entrar sin el enlace.<br><br>
                ¿Problemas? Escribinos por WhatsApp o respondé este mail.
              </p>
            </div>
          </td>
        </tr>

        <!-- Fallback link -->
        <tr>
          <td style="padding:0 40px 16px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Si el botón no funciona, copiá este enlace en tu navegador:</p>
            <p style="margin:4px 0 0;"><a href="${link}" style="color:#6366f1;font-size:11px;word-break:break-all;">${link}</a></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              AM Clínica · Camila O'Gorman 412, Piso 17 · Puerto Madero, CABA<br>
              Este correo fue enviado de forma segura y automática.
            </p>
          </td>
        </tr>

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
