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

export function generateTreatmentTimelineEmail(params: {
    nombre: string;
    workflowName: string;
    currentStageName: string;
    currentStageOrder: number;
    allStages: Array<{ name: string; order_index: number }>;
    portalUrl: string;
    nextAppointmentDate?: string | null;
}): string {
    const { nombre, workflowName, currentStageName, currentStageOrder, allStages, portalUrl, nextAppointmentDate } = params;

    const totalStages = allStages.length || 1;
    const progressPercent = Math.min(100, Math.round((currentStageOrder / totalStages) * 100));

    const stagesHtml = allStages
        .sort((a, b) => a.order_index - b.order_index)
        .map((stage, idx) => {
            const isDone = stage.order_index < currentStageOrder;
            const isCurrent = stage.order_index === currentStageOrder;
            const isLast = idx === allStages.length - 1;

            const dotBg = isDone ? '#C9A96E' : isCurrent ? '#1e1a12' : '#1a1a1a';
            const dotBorder = isDone || isCurrent ? '#C9A96E' : '#2e2e2e';
            const dotLabel = isDone ? '&#10003;' : isCurrent ? '&#9679;' : '';
            const dotColor = isDone ? '#000000' : '#C9A96E';
            const textColor = isDone ? 'rgba(255,255,255,0.35)' : isCurrent ? '#ffffff' : 'rgba(255,255,255,0.22)';
            const textDecoration = isDone ? 'line-through' : 'none';
            const connectorColor = isDone ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.07)';

            return `
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="top" width="30" style="padding-right:14px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="28">
                    <tr>
                      <td align="center" valign="middle"
                          style="width:28px;height:28px;background:${dotBg};border:1.5px solid ${dotBorder};border-radius:50%;font-size:13px;font-weight:700;color:${dotColor};text-align:center;line-height:26px;">
                        ${dotLabel}
                      </td>
                    </tr>
                    ${!isLast ? `<tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:1px;height:18px;background:${connectorColor};margin:2px auto;display:block;">&nbsp;</td></tr></table></td></tr>` : ''}
                  </table>
                </td>
                <td valign="top" style="padding-top:3px;padding-bottom:${isLast ? '0' : '18px'};">
                  <p style="margin:0;font-size:13px;font-weight:${isCurrent ? '700' : '500'};color:${textColor};text-decoration:${textDecoration};line-height:1.4;">${stage.name}</p>
                  ${isCurrent ? `<p style="margin:2px 0 0;font-size:9px;color:#C9A96E;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Etapa actual</p>` : ''}
                </td>
              </tr>
            </table>`;
        })
        .join('');

    const appointmentRow = nextAppointmentDate ? `
        <tr>
          <td style="background:#111111;padding:0 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#1a1a1a;border:1px solid rgba(201,169,110,0.2);border-radius:10px;padding:14px 18px;">
              <tr>
                <td>
                  <p style="margin:0 0 3px;color:#C9A96E;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Pr&#243;ximo turno</p>
                  <p style="margin:0;color:#ffffff;font-size:15px;font-weight:700;">${nextAppointmentDate}</p>
                </td>
                <td align="right" valign="middle">
                  <p style="margin:0;font-size:22px;">&#128197;</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu tratamiento avanza &#8212; AM Cl&#237;nica</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d0d0d;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td align="center"
              style="background:linear-gradient(160deg,#1c1c1c 0%,#111111 60%,#0f0e0a 100%);border-radius:16px 16px 0 0;padding:36px 40px 24px;border-bottom:1px solid rgba(201,169,110,0.18);">
            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM Cl&#237;nica" height="40"
                 style="display:block;margin:0 auto 18px;opacity:0.95;">
            <p style="margin:0 0 6px;color:#C9A96E;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">
              Tu tratamiento avanza
            </p>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.4px;">${workflowName}</h1>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td style="background:#111111;padding:28px 40px 20px;">
            <p style="margin:0;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">
              Hola <strong style="color:#ffffff;">${nombre}</strong>, tu tratamiento acaba de avanzar a una nueva etapa.
              Aqu&#237; est&#225; el estado completo de tu progreso.
            </p>
          </td>
        </tr>

        <!-- CURRENT STAGE BADGE -->
        <tr>
          <td style="background:#111111;padding:0 40px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:linear-gradient(135deg,#1e1a12,#141008);border:1px solid rgba(201,169,110,0.45);border-radius:12px;">
              <tr>
                <td style="padding:18px 20px;">
                  <p style="margin:0 0 4px;color:#C9A96E;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;">
                    &#9679;&nbsp; Etapa actual
                  </p>
                  <p style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">${currentStageName}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- PROGRESS BAR -->
        <tr>
          <td style="background:#111111;padding:0 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:7px;">
              <tr>
                <td style="color:rgba(255,255,255,0.35);font-size:11px;letter-spacing:1px;text-transform:uppercase;">Progreso</td>
                <td align="right" style="color:#C9A96E;font-size:12px;font-weight:700;">${progressPercent}%</td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#1e1e1e;border-radius:100px;height:5px;overflow:hidden;">
                  <table cellpadding="0" cellspacing="0" border="0" style="width:${progressPercent}%;">
                    <tr>
                      <td style="background:linear-gradient(90deg,#C9A96E 0%,#e8c98a 100%);height:5px;border-radius:100px;display:block;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.25);font-size:11px;">Etapa ${currentStageOrder} de ${totalStages}</p>
          </td>
        </tr>

        <!-- TIMELINE -->
        <tr>
          <td style="background:#111111;padding:0 40px 28px;">
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.3);font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">
              Recorrido completo
            </p>
            ${stagesHtml}
          </td>
        </tr>

        ${appointmentRow}

        <!-- CTA -->
        <tr>
          <td style="background:#111111;padding:0 40px 36px;" align="center">
            <a href="${portalUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#C9A96E 0%,#a8853a 100%);color:#000000;text-decoration:none;font-size:14px;font-weight:800;padding:14px 44px;border-radius:10px;letter-spacing:0.4px;">
              Ver mi portal completo &#8594;
            </a>
            <p style="margin:12px 0 0;color:rgba(255,255,255,0.2);font-size:11px;">
              Acced&#233; a tu historial, estudios y dise&#241;o de sonrisa desde el portal.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td align="center"
              style="background:#0a0a0a;border-radius:0 0 16px 16px;border-top:1px solid rgba(255,255,255,0.06);padding:24px 40px;">
            <p style="margin:0;color:rgba(255,255,255,0.2);font-size:11px;line-height:1.8;">
              AM Cl&#237;nica &middot; Camila O&#39;Gorman 412, Piso 17 &middot; Puerto Madero, CABA<br>
              Este correo fue enviado autom&#225;ticamente al avanzar tu tratamiento.
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
