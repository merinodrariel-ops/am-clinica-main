import { getAdmissionBookingUrl } from '@/lib/admission-booking-links';

export function generatePremiumWelcomeEmail(nombre: string, portalUrl?: string): string {
    const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica.ar';
    const bookingLink = getAdmissionBookingUrl('all', appBase);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a AM Clínica</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#050505;border:1px solid rgba(201,169,110,0.15);border-radius:4px;overflow:hidden;">
                    
                    <!-- Top Ribbon -->
                    <tr>
                        <td height="4" style="background:linear-gradient(90deg, transparent, #C9A96E, transparent);"></td>
                    </tr>

                    <!-- Logo Section -->
                    <tr>
                        <td align="center" style="padding:40px 0 20px;">
                            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM Clínica" height="35" style="display:block;height:35px;filter:brightness(0) invert(1);">
                        </td>
                    </tr>

                    <!-- Key Visual -->
                    <tr>
                        <td align="center" style="padding:10px 0 30px;">
                            <div style="width:70px;height:70px;background-color:rgba(201,169,110,0.05);border-radius:50%;border:1px solid rgba(201,169,110,0.2);display:inline-block;padding:15px;box-shadow: 0 0 20px rgba(201,169,110,0.1);">
                                <img src="https://cdn-icons-png.flaticon.com/512/3596/3596165.png" width="40" style="filter:invert(84%) sepia(21%) saturate(798%) hue-rotate(345deg) brightness(88%) contrast(85%);" alt="Welcome">
                            </div>
                        </td>
                    </tr>

                    <!-- Content Section -->
                    <tr>
                        <td align="center" style="padding:0 50px 30px;">
                            <p style="margin:0 0 12px;color:#C9A96E;font-size:10px;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Admisión Completada</p>
                            <h1 style="margin:0 0 24px;font-size:28px;font-weight:300;letter-spacing:-0.5px;line-height:1.2;color:#ffffff;font-family:'Times New Roman',serif;">
                                Bienvenido, <br><span style="color:#C9A96E;font-weight:700;">${nombre}.</span>
                            </h1>
                            <p style="margin:0 0 30px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.7;font-weight:400;">
                                Gracias por completar tu ficha clínica. Estás a solo dos pasos de confirmar tu experiencia en <strong>AM Estética Dental</strong>.
                            </p>
                        </td>
                    </tr>

                    <!-- Steps Container -->
                    <tr>
                        <td style="padding:0 40px 40px;">
                            
                            <!-- Step 1 -->
                            <div style="background-color:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);padding:30px;border-radius:4px;margin-bottom:20px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td width="50" valign="top">
                                            <div style="width:36px;height:36px;border-radius:50%;background-color:rgba(201,169,110,0.1);color:#C9A96E;font-weight:bold;text-align:center;line-height:36px;font-size:16px;border:1px solid rgba(201,169,110,0.3);">1</div>
                                        </td>
                                        <td>
                                            <h3 style="margin:0 0 10px;color:#ffffff;font-size:16px;font-weight:600;">Reserva tu lugar</h3>
                                            <p style="margin:0 0 20px;color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;">Abona la consulta para habilitar el calendario de turnos. Solo trabajamos con reservas confirmadas por estricto orden de agenda.</p>
                                            <a href="https://mpago.la/2rjmF2W" style="display:inline-block;padding:12px 25px;background-color:#111;border:1px solid #C9A96E;color:#C9A96E;text-decoration:none;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border-radius:2px;transition:all 0.3s ease;">
                                                Abonar Consulta
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Step 2 -->
                            <div style="background-color:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);padding:30px;border-radius:4px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td width="50" valign="top">
                                            <div style="width:36px;height:36px;border-radius:50%;background-color:rgba(255,255,255,0.05);color:#fff;font-weight:bold;text-align:center;line-height:36px;font-size:16px;border:1px solid rgba(255,255,255,0.1);">2</div>
                                        </td>
                                        <td>
                                            <h3 style="margin:0 0 10px;color:#ffffff;font-size:16px;font-weight:600;">Elige tu horario</h3>
                                            <p style="margin:0 0 20px;color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;">Una vez acreditado el pago, podrás acceder al calendario en tiempo real y seleccionar la ventana horaria que prefieras.</p>
                                            <a href="${bookingLink}" style="display:inline-block;padding:12px 25px;background-color:#C9A96E;color:#000;text-decoration:none;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border-radius:2px;">
                                                Ver Disponibilidad
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                        </td>
                    </tr>

                    <!-- Important Info Section -->
                    <tr>
                        <td style="padding:40px;background-color:#0a0a0a;border-top:1px solid rgba(255,255,255,0.05);">
                            <h4 style="margin:0 0 20px;color:#C9A96E;font-size:12px;letter-spacing:2px;text-transform:uppercase;text-align:center;">Detalles Importantes</h4>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;">
                                <tr>
                                    <td width="30" valign="top" style="color:rgba(255,255,255,0.3);padding-top:2px;font-size:16px;">📍</td>
                                    <td style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.5;">
                                        <strong>Location:</strong> Camila O'Gorman 412, Piso 17, Dpto. 1701, Puerto Madero. <br>
                                        <a href="https://maps.app.goo.gl/4uU7dtb4Q1RYHeVw8" style="color:#C9A96E;text-decoration:none;font-size:12px;">Cómo llegar &rarr;</a>
                                    </td>
                                </tr>
                            </table>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;">
                                <tr>
                                    <td width="30" valign="top" style="color:rgba(255,255,255,0.3);padding-top:2px;font-size:16px;">⏱️</td>
                                    <td style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.5;">
                                        <strong>Tolerancia:</strong> Máximo 15 minutos. Luego de ese tiempo, el turno se cancela automáticamente por respeto al siguiente paciente.
                                    </td>
                                </tr>
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;">
                                <tr>
                                    <td width="30" valign="top" style="color:rgba(255,255,255,0.3);padding-top:2px;font-size:16px;">👥</td>
                                    <td style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.5;">
                                        <strong>Acompañantes:</strong> Para mantener la exclusividad y tranquilidad del espacio, no está permitido concurrir con acompañantes.
                                    </td>
                                </tr>
                            </table>

                             <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="30" valign="top" style="color:rgba(255,255,255,0.3);padding-top:2px;font-size:16px;">📅</td>
                                    <td style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.5;">
                                        <strong>Cancelaciones:</strong> Deben realizarse con 24 horas de anticipación para poder reasignar el turno sin cargo.
                                    </td>
                                </tr>
                            </table>

                            <div style="text-align:center;margin-top:35px;">
                                <p style="margin:0;color:rgba(255,255,255,0.3);font-size:12px;">¿Necesitas ayuda personalizada?</p>
                                <a href="https://wa.link/zolb52" style="display:inline-block;margin-top:10px;color:#C9A96E;text-decoration:none;font-size:13px;font-weight:600;">Contactar vía WhatsApp</a>
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- Institutional Footer -->
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin-top:40px;">
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



export function generatePaymentConfirmationEmail(nombre: string, amountUsd: number, description?: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de Pago — AM Clínica</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;padding:60px 20px;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#050505;border:1px solid rgba(201,169,110,0.15);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding:45px 0 30px;">
                            <img src="https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png" alt="AM Clínica" height="35" style="display:block;height:35px;filter:brightness(0) invert(1);">
                        </td>
                    </tr>

                    <!-- Payment Visual -->
                    <tr>
                        <td align="center" style="padding:0 40px 40px;">
                            <div style="width:70px;height:70px;background-color:rgba(201,169,110,0.05);border-radius:50%;border:1px solid rgba(201,169,110,0.2);display:inline-block;padding:15px;box-shadow: 0 0 15px rgba(201,169,110,0.1);">
                                <img src="https://cdn-icons-png.flaticon.com/512/2169/2169864.png" width="40" style="filter:invert(84%) sepia(21%) saturate(798%) hue-rotate(345deg) brightness(88%) contrast(85%);" alt="Payment Success">
                            </div>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td align="center" style="padding:0 50px 50px;">
                            <p style="margin:0 0 14px;color:#C9A96E;font-size:9px;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Transacción Exitosa</p>
                            <h1 style="margin:0 0 28px;font-size:30px;font-weight:300;letter-spacing:-0.5px;line-height:1.2;color:#ffffff;font-family:'Times New Roman',serif;">
                                Pago <br><span style="color:#C9A96E;font-weight:700;">Confirmado.</span>
                            </h1>
                            <p style="margin:0 0 35px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.7;">
                                Hola <strong>${nombre}</strong>, hemos recibido tu pago correctamente. <br>
                                Tu tratamiento continúa bajo los más altos estándares de excelencia.
                            </p>

                            <!-- Amount Box -->
                            <div style="background-color:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);padding:30px;border-radius:2px;margin-bottom:40px;">
                                <p style="margin:0 0 5px;color:rgba(255,255,255,0.3);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Monto procesado</p>
                                <p style="margin:0;color:#C9A96E;font-size:32px;font-weight:700;letter-spacing:1px;">USD ${amountUsd}</p>
                                ${description ? `<p style="margin:15px 0 0;color:rgba(255,255,255,0.5);font-size:13px;font-style:italic;">${description}</p>` : ''}
                            </div>
                            
                            <p style="margin:0;color:rgba(255,255,255,0.3);font-size:12px;line-height:1.6;">
                                Gracias por tu puntualidad y compromiso con tu salud dental.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding:40px;background-color:#0a0a0a;border-top:1px solid rgba(255,255,255,0.05);">
                            <p style="margin:0;color:rgba(255,255,255,0.2);font-size:9px;letter-spacing:2px;text-transform:uppercase;">
                                AM Clínica Dental · Puerto Madero · Buenos Aires
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
