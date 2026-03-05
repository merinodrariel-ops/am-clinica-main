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
    <title>Acceso Exclusivo — Portal de Pacientes</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;padding:60px 20px;">
        <tr>
            <td align="center">
                <table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background-color:#050505;border:1px solid rgba(201,169,110,0.15);border-radius:2px;">
                    
                    <!-- Top Ribbon -->
                    <tr>
                        <td height="3" style="background:linear-gradient(90deg, transparent, #C9A96E, transparent);"></td>
                    </tr>

                    <!-- Logo Section -->
                    <tr>
                        <td align="center" style="padding:40px 0 20px;">
                            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM Clínica" height="35" style="display:block;height:35px;filter:brightness(0) invert(1);">
                        </td>
                    </tr>

                    <!-- Key Visual -->
                    <tr>
                        <td align="center" style="padding:20px 0 40px;">
                            <div style="width:80px;height:80px;background-color:rgba(201,169,110,0.05);border-radius:50%;border:1px solid rgba(201,169,110,0.2);display:inline-block;padding:20px;box-shadow: 0 0 20px rgba(201,169,110,0.1);">
                                <img src="https://cdn-icons-png.flaticon.com/512/2589/2589174.png" width="40" style="filter:invert(84%) sepia(21%) saturate(798%) hue-rotate(345deg) brightness(88%) contrast(85%);" alt="Magic Key">
                            </div>
                        </td>
                    </tr>

                    <!-- Content Section -->
                    <tr>
                        <td align="center" style="padding:0 50px 50px;">
                            <p style="margin:0 0 12px;color:#C9A96E;font-size:10px;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Acceso Seguro</p>
                            <h1 style="margin:0 0 24px;font-size:28px;font-weight:300;letter-spacing:-0.5px;line-height:1.2;color:#ffffff;font-family:'Times New Roman',serif;">
                                Tu Llave Digital <br><span style="color:#C9A96E;font-weight:700;">está Lista.</span>
                            </h1>
                            <p style="margin:0 0 35px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.7;font-weight:400;">
                                Hola <strong>${nombre}</strong>. <br>
                                Haz clic en el siguiente enlace para ingresar a tu portal de paciente. Por tu seguridad, este enlace es de un solo uso y expirará en 24 horas.
                            </p>
                            
                            <!-- CTA Button -->
                            <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" style="background-color:#C9A96E;border-radius:2px;box-shadow: 0 4px 15px rgba(201,169,110,0.2);">
                                        <a href="${link}" style="display:inline-block;padding:18px 45px;color:#000000;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">
                                            INGRESAR AHORA
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:35px 0 0;color:rgba(255,255,255,0.3);font-size:12px;line-height:1.6;">
                                Si el botón no funciona, <a href="${link}" style="color:#C9A96E;text-decoration:none;">puedes pulsar aquí</a> para acceder directamente.
                            </p>
                        </td>
                    </tr>

                    <!-- Social / Security Note -->
                    <tr>
                        <td style="padding:30px;background-color:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05);">
                            <p style="margin:0;color:rgba(255,255,255,0.4);font-size:11px;text-align:center;">
                                Este es un correo automatizado. Por favor, no respondas a este mensaje.
                            </p>
                        </td>
                    </tr>
                </table>

                <!-- Institutional Footer -->
                <table width="540" cellpadding="0" cellspacing="0" border="0" style="margin-top:40px;">
                    <tr>
                        <td align="center">
                            <p style="margin:0;color:rgba(255,255,255,0.2);font-size:10px;letter-spacing:1px;text-transform:uppercase;">
                                AM Clínica Dental · Excellence in Puerto Madero
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
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
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invitación Exclusiva — Equipo AM</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;padding:60px 20px;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#050505;border:1px solid rgba(201,169,110,0.18);">
                    
                    <!-- Decorative Top Glow -->
                    <tr>
                        <td align="center" style="padding:0;">
                            <div style="height:1px;width:80%;background:radial-gradient(circle, #C9A96E, transparent);opacity:0.6;"></div>
                        </td>
                    </tr>

                    <!-- Logo -->
                    <tr>
                        <td align="center" style="padding:45px 0 35px;">
                            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM Clínica" height="38" style="display:block;height:38px;filter:brightness(0) invert(1);">
                        </td>
                    </tr>

                    <!-- Invitation Visual -->
                    <tr>
                        <td align="center" style="padding:0 40px 45px;">
                            <div style="border:1px solid rgba(201,169,110,0.3);padding:25px;background-color:rgba(201,169,110,0.02);display:inline-block;position:relative;">
                                <img src="https://cdn-icons-png.flaticon.com/512/3596/3596165.png" width="50" style="filter:invert(84%) sepia(21%) saturate(798%) hue-rotate(345deg) brightness(88%) contrast(85%);" alt="Privileged Access">
                            </div>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td align="center" style="padding:0 50px 50px;">
                            <p style="margin:0 0 14px;color:#C9A96E;font-size:9px;letter-spacing:6px;text-transform:uppercase;font-weight:700;">Convocatoria de Élite</p>
                            <h1 style="margin:0 0 28px;font-size:32px;font-weight:300;letter-spacing:-0.8px;line-height:1.1;color:#ffffff;font-family:'Times New Roman',serif;">
                                Bienvenido al <br><span style="color:#C9A96E;font-weight:700;">Equipo AM.</span>
                            </h1>
                            <p style="margin:0 0 40px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.8;font-weight:400;max-width:400px;">
                                Estimad@ <strong>${nombre}</strong>, es un honor invitarte a formar parte de nuestra operativa 360. <br>
                                Tu perfil ha sido seleccionado para integrarse a una experiencia de gestión dental sin precedentes.
                            </p>
                            
                            <!-- Invitation CTA -->
                            <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" style="background-color:#C9A96E;border-radius:2px;box-shadow: 0 0 20px rgba(201,169,110,0.3);">
                                        <a href="${link}" style="display:inline-block;padding:22px 55px;color:#000000;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">
                                            ACEPTAR CONVOCATORIA
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:45px 0 0;color:rgba(255,255,255,0.25);font-size:11px;line-height:1.6;">
                                Este enlace es de carácter estrictamente personal y expira en 24 horas. <br>
                                Si no esperabas esta invitación, te pedimos disculpas y que ignores este mensaje.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer Details -->
                    <tr>
                        <td align="center" style="padding:40px;background-color:#0a0a0a;border-top:1px solid rgba(255,255,255,0.05);">
                            <p style="margin:0;color:rgba(255,255,255,0.2);font-size:9px;letter-spacing:2px;text-transform:uppercase;">
                                AM Clínica Dental · Operativa 360 · Puerto Madero
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

export function generatePremiumWelcomeEmail(nombre: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenid@ a la experiencia AM</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;padding:60px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#000000;border:1px solid rgba(221,180,44,0.1);">
                    <!-- Top Neon Accent -->
                    <tr>
                        <td align="center" style="padding:0;">
                            <div style="height:2px;width:100%;background:linear-gradient(90deg, transparent, #ddb42c, transparent);box-shadow: 0 0 10px #ddb42c;"></div>
                        </td>
                    </tr>

                    <!-- Header / Logo -->
                    <tr>
                        <td align="center" style="padding:50px 0 40px;">
                            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM Clínica" height="40" style="display:block;height:40px;filter:brightness(0) invert(1);">
                        </td>
                    </tr>

                    <!-- Hero Visual (Neon Aesthetic) -->
                    <tr>
                        <td style="padding:0 30px 50px;">
                            <div style="border-radius:4px;overflow:hidden;border:1px solid #ddb42c;box-shadow: 0 0 15px rgba(221,180,44,0.3);">
                                <img src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=1200" alt="Excellence" width="540" style="display:block;width:100%;height:auto;filter:contrast(1.2) brightness(0.8) sepia(0.2);">
                            </div>
                        </td>
                    </tr>

                    <!-- Headline -->
                    <tr>
                        <td align="center" style="padding:0 40px 40px;">
                            <p style="margin:0 0 16px;color:#ddb42c;font-size:10px;letter-spacing:7px;text-transform:uppercase;font-weight:700;text-shadow: 0 0 5px rgba(221,180,44,0.5);">Premium Identity</p>
                            <h1 style="margin:0 0 24px;font-size:38px;font-weight:300;letter-spacing:-1px;line-height:1.1;color:#ffffff;font-family:'Times New Roman',serif;">Bienvenid@ <br>a la <span style="font-weight:700;color:#ddb42c;text-shadow: 0 0 8px rgba(221,180,44,0.4);">Experiencia AM.</span></h1>
                            <div style="height:1px;width:40px;background-color:#ddb42c;margin:0 auto 30px;box-shadow: 0 0 5px #ddb42c;"></div>
                            <p style="margin:0 0 44px;color:rgba(255,255,255,0.7);font-size:16px;line-height:1.8;font-weight:400;max-width:420px;">
                                Estimad@ <strong>${nombre}</strong>, es un privilegio recibirte. <br>
                                Tu portal exclusivo está listo para brindarte un seguimiento de vanguardia con la distinción que mereces.
                            </p>
                            
                            <!-- Premium CTA with Glow -->
                            <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" style="background-color:#ddb42c;box-shadow: 0 0 20px rgba(221,180,44,0.5);border-radius:2px;">
                                        <a href="${portalUrl}" style="display:inline-block;padding:20px 50px;color:#000000;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">
                                            INGRESAR AL PORTAL
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Values Section -->
                    <tr>
                        <td style="padding:50px 0;background-color:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.05);">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" width="33%" style="padding:0 10px;">
                                        <p style="margin:0 0 8px;color:#ddb42c;font-size:18px;font-weight:700;">✦</p>
                                        <p style="margin:0;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Privacidad</p>
                                    </td>
                                    <td align="center" width="33%" style="padding:0 10px;">
                                        <p style="margin:0 0 8px;color:#ddb42c;font-size:18px;font-weight:700;">✦</p>
                                        <p style="margin:0;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Boutique</p>
                                    </td>
                                    <td align="center" width="33%" style="padding:0 10px;">
                                        <p style="margin:0 0 8px;color:#ddb42c;font-size:18px;font-weight:700;">✦</p>
                                        <p style="margin:0;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Innovación</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding:60px 40px;background-color:#050505;">
                            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM" height="25" style="display:block;height:25px;margin-bottom:30px;filter:grayscale(1) brightness(0.7);opacity:0.5;">
                            <p style="margin:0 0 24px;color:rgba(255,255,255,0.3);font-size:11px;line-height:1.6;letter-spacing:0.5px;">
                                AM Clínica Dental · Dr. Ariel Merino<br>
                                Camila O'Gorman 412, Piso 17, Puerto Madero<br>
                                Buenos Aires, Argentina
                            </p>
                            <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="padding:0 15px;">
                                        <a href="#" style="color:rgba(255,255,255,0.4);text-decoration:none;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Instagram</a>
                                    </td>
                                    <td style="padding:0 15px;color:rgba(255,255,255,0.1);">|</td>
                                    <td style="padding:0 15px;">
                                        <a href="#" style="color:rgba(255,255,255,0.4);text-decoration:none;font-size:10px;letter-spacing:1px;text-transform:uppercase;">WhatsApp</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:30px 0 0;color:rgba(221,180,44,0.2);font-size:9px;text-transform:uppercase;letter-spacing:2px;">
                                © 2024 Excelencia sin Concesiones
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}
