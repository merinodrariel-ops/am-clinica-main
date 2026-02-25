/**
 * prospect-templates.ts
 *
 * Email + WhatsApp templates para el workflow "Prospectos - 1ra Consulta".
 * Pacientes que consultaron pero no convirtieron a tratamiento.
 *
 * Cada template aplica un disparador psicológico específico:
 *  T+48h   → Reciprocidad ("pensé en tu caso")
 *  T+7d    → Autoridad + Prueba social ("caso similar al tuyo")
 *  T+30d   → Aversión a la pérdida ("cada mes que pasa...")
 *  T+60d   → Escasez + Financiamiento ("solo X turnos disponibles")
 *  T+90d   → Último intento ("no quiero perder contacto")
 */

// ─── Shared styles ───────────────────────────────────────────────────────────

const LOGO_URL = 'https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png';
const GOLD = '#C9A96E';
const BLACK = '#0d0d0d';
const DARK_CARD = '#1a1a1a';
const WA_LINK = 'https://wa.link/zolb52';
const CALENDAR_LINK = 'https://calendar.app.google/oc4VZPzsDkhwB3r58';
const PORTAL_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica.vercel.app';

function emailWrapper(content: string, preheader = ''): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AM Estética Dental</title>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f5f5f5">
  <tr><td align="center" style="padding:24px 16px;">
    <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td align="center" style="background-color:${BLACK};padding:28px 0;border-radius:12px 12px 0 0;">
        <img src="${LOGO_URL}" alt="AM Estética Dental" height="48" style="display:block;">
      </td></tr>

      <!-- Gold accent line -->
      <tr><td style="height:3px;background:linear-gradient(90deg,${GOLD},#e8c98a,${GOLD});"></td></tr>

      <!-- Content -->
      ${content}

      <!-- Footer -->
      <tr><td style="background-color:${BLACK};padding:24px 32px;border-radius:0 0 12px 12px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="color:#666;font-size:12px;line-height:1.8;">
              <strong style="color:${GOLD};">AM Estética Dental · Puerto Madero</strong><br>
              Camila O'Gorman 412, Piso 17, Depto. 1701<br>
              <a href="${WA_LINK}" style="color:${GOLD};text-decoration:none;">WhatsApp</a> ·
              <a href="https://www.instagram.com/am.esteticadental" style="color:${GOLD};text-decoration:none;">Instagram</a>
            </td>
            <td align="right" style="vertical-align:top;">
              <a href="${WA_LINK}" style="background-color:${GOLD};color:#000;font-size:11px;font-weight:700;padding:8px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;">ESCRIBINOS</a>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function goldButton(text: string, url: string): string {
    return `<a href="${url}" style="display:inline-block;background-color:${GOLD};color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">${text}</a>`;
}

function highlightBox(text: string): string {
    return `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;">
      <tr><td style="background-color:${DARK_CARD};border-left:4px solid ${GOLD};border-radius:0 8px 8px 0;padding:18px 20px;">
        <p style="color:#e8e8e8;font-size:15px;line-height:1.7;margin:0;">${text}</p>
      </td></tr>
    </table>`;
}

// ─── T+48h: Reciprocidad ─────────────────────────────────────────────────────

export function generateProspectEmail48h(params: {
    nombre: string;
    mainInterest?: string; // "carillas" | "ortodoncia" | "implantes" | "blanqueamiento"
    portalUrl?: string;
}): string {
    const { nombre, mainInterest, portalUrl } = params;
    const treatmentLabel = {
        carillas: 'Carillas / Diseño de Sonrisa',
        ortodoncia: 'Ortodoncia Invisible',
        implantes: 'Implantes Dentales',
        blanqueamiento: 'Blanqueamiento Dental',
    }[mainInterest ?? ''] ?? 'tu tratamiento';

    const content = `
    <tr><td style="background-color:#fff;padding:40px 40px 32px;">
      <p style="color:#888;font-size:13px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">MENSAJE DEL DR. ARIEL MERINO</p>
      <h1 style="color:${BLACK};font-size:26px;font-weight:700;margin:0 0 20px;line-height:1.3;">
        Hola ${nombre}, todavía pienso en tu caso.
      </h1>
      <p style="color:#444;font-size:16px;line-height:1.8;">
        Pasaron 48 horas desde tu consulta y quería escribirte personalmente.<br><br>
        Cuando un paciente viene a vernos por primera vez, me quedo pensando en su caso mucho más allá de la consulta. El tuyo no es la excepción.
      </p>
      ${highlightBox(`Tu interés principal era <strong>${treatmentLabel}</strong>. Hay algo que quiero que sepas: <strong>cuanto antes se inicia, mejores son los resultados finales</strong> — y el proceso es mucho más llevadero de lo que imaginás.`)}
      <p style="color:#444;font-size:16px;line-height:1.8;">
        No te escribo para presionarte. Te escribo porque creo que podemos ayudarte, y no me gustaría que se te pase el momento ideal.
      </p>
      <p style="color:#444;font-size:15px;line-height:1.8;">
        <strong>¿Podemos hablar 5 minutos esta semana para responder tus dudas?</strong><br>
        Sin compromiso. Solo queremos que tomes la mejor decisión, sea con nosotros o no.
      </p>
      <div style="text-align:center;margin:32px 0;">
        ${goldButton('Reservar una llamada con el equipo', WA_LINK)}
      </div>
      <p style="color:#888;font-size:13px;text-align:center;line-height:1.6;">
        También podés responder directo a este email o escribirnos por WhatsApp.<br>
        Estamos disponibles de lunes a viernes de 10 a 19hs.
      </p>
    </td></tr>
    <tr><td style="background-color:${DARK_CARD};padding:28px 40px;">
      <p style="color:${GOLD};font-size:12px;margin:0 0 12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">SOBRE AM ESTÉTICA DENTAL</p>
      <p style="color:#aaa;font-size:14px;line-height:1.8;margin:0;">
        Somos especialistas en Diseño de Sonrisa, Ortodoncia Invisible e Implantes en Puerto Madero desde hace más de 15 años.
        Más de <strong style="color:#ddd;">2.000 sonrisas transformadas</strong>, y seguimos trabajando para que la próxima sea la tuya.
      </p>
    </td></tr>`;

    return emailWrapper(content, `${nombre}, el Dr. Merino pensó en tu caso y tiene algo para decirte.`);
}

// ─── T+7d: Autoridad + Prueba Social ─────────────────────────────────────────

export function generateProspectEmail7d(params: {
    nombre: string;
    mainInterest?: string;
    portalUrl?: string;
}): string {
    const { nombre, mainInterest } = params;

    const casesMap: Record<string, { title: string; result: string; time: string }> = {
        carillas:       { title: 'Diseño de Sonrisa con Carillas', result: '10 carillas superiores en 3 sesiones', time: '3 semanas' },
        ortodoncia:     { title: 'Ortodoncia con Alineadores', result: 'Corrección completa de apiñamiento', time: '14 meses' },
        implantes:      { title: 'Implante + Corona definitiva', result: 'Funcionalidad completa recuperada', time: '4 meses' },
        blanqueamiento: { title: 'Blanqueamiento profesional', result: '6 tonos de diferencia en 2 sesiones', time: '10 días' },
    };
    const caseInfo = casesMap[mainInterest ?? ''] ?? casesMap['carillas'];

    const content = `
    <tr><td style="background-color:#fff;padding:40px 40px 32px;">
      <p style="color:#888;font-size:13px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">CASO SIMILAR AL TUYO</p>
      <h1 style="color:${BLACK};font-size:24px;font-weight:700;margin:0 0 20px;line-height:1.3;">
        ${nombre}, te cuento sobre un paciente que estuvo donde estás vos hoy.
      </h1>
      <p style="color:#444;font-size:16px;line-height:1.8;">
        Hace unos meses atendimos a un paciente con una situación muy parecida a la tuya. Como vos, vino a consultar, tenía dudas, no sabía si el momento era el adecuado.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${DARK_CARD};border-radius:12px;padding:0;margin:24px 0;">
        <tr><td style="padding:28px 28px;">
          <p style="color:${GOLD};font-size:11px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">CASO REAL · ${caseInfo.title.toUpperCase()}</p>
          <p style="color:#fff;font-size:18px;font-weight:700;margin:0 0 12px;">Resultado: ${caseInfo.result}</p>
          <p style="color:#aaa;font-size:14px;margin:0;">Tiempo total del tratamiento: <strong style="color:#ddd;">${caseInfo.time}</strong></p>
          <hr style="border:none;border-top:1px solid #333;margin:16px 0;">
          <p style="color:#bbb;font-size:13px;font-style:italic;margin:0;">
            "No lo podía creer. Vine con miedo, sin saber si era lo mío. Hoy sonrío diferente, y eso cambió cómo me veo a mí misma."
          </p>
        </td></tr>
      </table>
      ${highlightBox('¿Querés ver el antes y el después de este caso? <strong>Te lo mandamos por WhatsApp</strong> — así podés ver qué esperar del proceso con ojos propios.')}
      <p style="color:#444;font-size:15px;line-height:1.8;">
        Cada caso es único, pero si algo nos enseñaron 15 años de trabajo, es que el miedo a empezar siempre es más grande que el proceso en sí.
      </p>
      <div style="text-align:center;margin:32px 0;">
        ${goldButton('Ver antes y después de mi caso →', WA_LINK)}
      </div>
    </td></tr>`;

    return emailWrapper(content, `Un paciente similar a vos tomó la decisión — mirá qué pasó.`);
}

// ─── T+30d: Aversión a la pérdida ────────────────────────────────────────────

export function generateProspectEmail30d(params: {
    nombre: string;
    mainInterest?: string;
}): string {
    const { nombre, mainInterest } = params;

    const lossMap: Record<string, string> = {
        carillas:       'Las carillas de composite tienen resultados más predecibles cuando el tejido gingival está en buen estado. Cuanto antes empezamos, más simples son los pasos preparatorios.',
        ortodoncia:     'La ortodoncia funciona mejor con hueso alveolar en buen estado. Con el tiempo, los dientes pueden seguir moviéndose — y eso complica el pronóstico.',
        implantes:      'Después de una extracción, el hueso que rodea el lugar del diente se reabsorbe. Cuanto más se espera, más compleja (y más cara) puede volverse la cirugía.',
        blanqueamiento: 'Si bien el blanqueamiento es un proceso sin urgencia biológica, los pigmentos se van acumulando con el tiempo — el resultado mejora cuando el esmalte está en buen estado.',
    };
    const lossInfo = lossMap[mainInterest ?? ''] ?? lossMap['carillas'];

    const content = `
    <tr><td style="background-color:#fff;padding:40px 40px 32px;">
      <p style="color:#888;font-size:13px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">UN MES DESPUÉS DE TU CONSULTA</p>
      <h1 style="color:${BLACK};font-size:24px;font-weight:700;margin:0 0 20px;line-height:1.3;">
        ${nombre}, el tiempo juega a favor o en contra. Depende de cuándo empezamos.
      </h1>
      <p style="color:#444;font-size:16px;line-height:1.8;">
        Pasó un mes desde que nos visitaste. Seguimos pensando en tu caso.
      </p>
      ${highlightBox(`<strong style="color:${GOLD};">Lo que muchos pacientes no saben:</strong><br><br>${lossInfo}`)}
      <p style="color:#444;font-size:15px;line-height:1.8;">
        No te digo esto para generarte ansiedad. Te lo digo porque creemos en la honestidad con nuestros pacientes — y queremos que sepas exactamente en qué punto está tu caso.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;">
        <tr>
          <td width="48%" style="background:${DARK_CARD};border-radius:10px;padding:20px;text-align:center;vertical-align:top;">
            <p style="color:${GOLD};font-size:28px;font-weight:700;margin:0 0 6px;">15+</p>
            <p style="color:#aaa;font-size:13px;margin:0;line-height:1.5;">años de experiencia<br>en estética dental</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:${DARK_CARD};border-radius:10px;padding:20px;text-align:center;vertical-align:top;">
            <p style="color:${GOLD};font-size:28px;font-weight:700;margin:0 0 6px;">2.000+</p>
            <p style="color:#aaa;font-size:13px;margin:0;line-height:1.5;">sonrisas<br>transformadas</p>
          </td>
        </tr>
      </table>
      <p style="color:#444;font-size:15px;line-height:1.8;">
        <strong>¿Tenés dudas sobre el costo o los tiempos?</strong> Es completamente normal. Podemos armar un plan de pago personalizado para vos, sin mover un turno hasta que no estés seguro/a.
      </p>
      <div style="text-align:center;margin:32px 0;">
        ${goldButton('Quiero retomar la conversación →', WA_LINK)}
      </div>
    </td></tr>`;

    return emailWrapper(content, `Han pasado 30 días — lo que necesitás saber sobre tu caso, ${nombre}.`);
}

// ─── T+60d: Escasez + Financiamiento ─────────────────────────────────────────

export function generateProspectEmail60d(params: {
    nombre: string;
    mainInterest?: string;
}): string {
    const { nombre } = params;

    const content = `
    <tr><td style="background-color:#fff;padding:40px 40px 32px;">
      <p style="color:#888;font-size:13px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">ACTUALIZACIÓN IMPORTANTE</p>
      <h1 style="color:${BLACK};font-size:24px;font-weight:700;margin:0 0 20px;line-height:1.3;">
        ${nombre}, guardamos tu caso — y tenemos algo nuevo para ofrecerte.
      </h1>
      <p style="color:#444;font-size:16px;line-height:1.8;">
        Somos conscientes de que muchas veces el costo inicial es lo que frena dar el primer paso. Por eso diseñamos planes de pago que se adaptan a tu realidad.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border:2px solid ${GOLD};border-radius:12px;margin:24px 0;overflow:hidden;">
        <tr><td style="background:${GOLD};padding:16px 24px;">
          <p style="color:#000;font-size:14px;font-weight:700;margin:0;letter-spacing:0.5px;text-transform:uppercase;">OPCIONES DE FINANCIAMIENTO</p>
        </td></tr>
        <tr><td style="background:${DARK_CARD};padding:24px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr style="border-bottom:1px solid #333;">
              <td style="padding:12px 0;color:#ddd;font-size:14px;">Pago en efectivo / transferencia</td>
              <td align="right" style="padding:12px 0;color:${GOLD};font-weight:700;font-size:14px;">Mejor precio</td>
            </tr>
            <tr style="border-bottom:1px solid #333;">
              <td style="padding:12px 0;color:#ddd;font-size:14px;">Plan en cuotas personalizado</td>
              <td align="right" style="padding:12px 0;color:#ddd;font-weight:700;font-size:14px;">Hasta 12 cuotas</td>
            </tr>
            <tr>
              <td style="padding:12px 0;color:#ddd;font-size:14px;">Inicio con señal mínima</td>
              <td align="right" style="padding:12px 0;color:#ddd;font-weight:700;font-size:14px;">Reserva tu lugar</td>
            </tr>
          </table>
        </td></tr>
      </table>
      ${highlightBox(`Actualmente tenemos disponibilidad para iniciar tratamientos este mes. <strong>Los turnos de inicio se agotan rápido</strong> — si querés uno, te recomendamos reservar cuanto antes, aunque el tratamiento empiece más adelante.`)}
      <p style="color:#444;font-size:15px;line-height:1.8;">
        Reservar tu lugar no implica compromiso total. Solo una seña pequeña para separar el turno de inicio.
      </p>
      <div style="text-align:center;margin:32px 0;">
        ${goldButton('Consultar financiamiento para mi caso →', WA_LINK)}
      </div>
    </td></tr>`;

    return emailWrapper(content, `${nombre}: opciones de pago para que nada te frene.`);
}

// ─── T+90d: Último contacto ───────────────────────────────────────────────────

export function generateProspectEmail90d(params: {
    nombre: string;
    mainInterest?: string;
}): string {
    const { nombre } = params;

    const content = `
    <tr><td style="background-color:#fff;padding:40px 40px 32px;">
      <p style="color:#888;font-size:13px;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">MENSAJE PERSONAL</p>
      <h1 style="color:${BLACK};font-size:24px;font-weight:700;margin:0 0 20px;line-height:1.3;">
        ${nombre}, no quiero perder contacto con vos.
      </h1>
      <p style="color:#444;font-size:16px;line-height:1.8;">
        Han pasado tres meses desde tu consulta. No te escribí para molestarte — te escribí porque me importa lo que pasa con tu caso.
      </p>
      <p style="color:#444;font-size:15px;line-height:1.8;">
        Entiendo perfectamente que los tiempos de cada persona son diferentes. Que a veces las prioridades cambian, el momento no es el ideal, o simplemente necesitás más tiempo para decidir. Todo eso está bien.
      </p>
      ${highlightBox(`Lo único que te pido es que si algún día decidís avanzar, <strong style="color:${GOLD};">vengas con nosotros</strong>. Tu caso está guardado con nosotros. No tendrás que explicar todo de vuelta.`)}
      <p style="color:#444;font-size:15px;line-height:1.8;">
        Y si ya tomaste una decisión diferente, o si hay algo en lo que no cumplimos tus expectativas en la consulta, me gustaría saberlo. Toda respuesta nos ayuda a mejorar.
      </p>
      <div style="text-align:center;margin:32px 0 20px;">
        ${goldButton('Retomar mi caso con el equipo →', WA_LINK)}
      </div>
      <p style="color:#aaa;font-size:13px;text-align:center;">
        Si preferís que no te contactemos más, simplemente respondé "No gracias" a este email.<br>Lo respetamos completamente.
      </p>
    </td></tr>
    <tr><td style="background-color:${DARK_CARD};padding:28px 40px;">
      <p style="color:${GOLD};font-weight:700;font-size:14px;margin:0 0 8px;">Dr. Ariel Merino</p>
      <p style="color:#888;font-size:13px;margin:0;line-height:1.7;">
        Director · AM Estética Dental · Puerto Madero<br>
        Especialista en Diseño de Sonrisa, Ortodoncia Invisible e Implantes
      </p>
    </td></tr>`;

    return emailWrapper(content, `Un mensaje personal para vos, ${nombre}.`);
}

// ─── WhatsApp message sequences ───────────────────────────────────────────────

export interface WhatsAppProspectMessage {
    delay: string;         // when to send ("2h", "48h", "7d", "30d", "60d", "90d")
    trigger: string;       // psychological trigger name
    template: (nombre: string, interest?: string) => string;
}

export const PROSPECT_WHATSAPP_SEQUENCE: WhatsAppProspectMessage[] = [
    {
        delay: '2h',
        trigger: 'Gratitud inmediata',
        template: (nombre, _interest) =>
            `Hola ${nombre} 👋 Fue un placer recibirte hoy en AM Estética Dental.\n\nEl Dr. Ariel quedó pensando en tu caso. Si tenés alguna duda sobre lo que hablaron, respondé este mensaje y te respondemos en el día.\n\n¡Gracias por tu visita! 🦷✨`,
    },
    {
        delay: '48h',
        trigger: 'Reciprocidad + oferta de información',
        template: (nombre, interest) => {
            const interestLabel: Record<string, string> = {
                carillas: 'carillas y diseño de sonrisa 😁',
                ortodoncia: 'ortodoncia invisible 📐',
                implantes: 'implantes 🦷',
                blanqueamiento: 'blanqueamiento ✨',
            };
            const label = interestLabel[interest ?? ''] ?? 'tu tratamiento 🦷';
            return `Hola ${nombre}! Soy del equipo de AM.\n\nEl Dr. Merino nos pidió que te escribamos — está preparando algo personalizado sobre ${label} para tu caso específico.\n\n¿Te lo enviamos por email o preferís que te lo contemos por acá?`;
        },
    },
    {
        delay: '7d',
        trigger: 'Prueba social + visualización',
        template: (nombre, interest) => {
            const caseLabel: Record<string, string> = {
                carillas: 'un diseño de sonrisa con carillas',
                ortodoncia: 'una corrección con alineadores',
                implantes: 'una rehabilitación con implantes',
                blanqueamiento: 'un blanqueamiento profesional',
            };
            const c = caseLabel[interest ?? ''] ?? 'un tratamiento similar al tuyo';
            return `Hola ${nombre} 👋 Esta semana terminamos ${c} con un resultado increíble.\n\nMe acordé de tu caso y pensé que te gustaría ver el antes y el después 📸\n\n¿Te lo mando?`;
        },
    },
    {
        delay: '30d',
        trigger: 'Check-in + aversión a pérdida',
        template: (nombre, _interest) =>
            `Hola ${nombre}! Pasó un mes desde tu consulta con nosotros 🗓️\n\nNo quiero ser insistente, pero sí quiero que sepas que tu caso file sigue con nosotros y que estamos para cuando estés listo/a.\n\n¿Hay algo que te esté frenando en la decisión? Podemos ayudarte a resolverlo 🙏`,
    },
    {
        delay: '60d',
        trigger: 'Escasez + financiamiento',
        template: (nombre, _interest) =>
            `Hola ${nombre} 🙌 Queríamos contarte que tenemos disponibilidad para iniciar tratamientos este mes.\n\nY también armamos nuevas opciones de financiamiento — hasta 12 cuotas sin necesidad de tarjeta especial.\n\n¿Te interesa que te contemos los detalles?`,
    },
    {
        delay: '90d',
        trigger: 'Cierre con puerta abierta',
        template: (nombre, _interest) =>
            `Hola ${nombre}, es nuestro último mensaje para no molestarte 🙏\n\nSolo quería que sepas que tu caso está guardado con nosotros. Si en algún momento decidís avanzar, no tendrás que explicar todo de vuelta.\n\nY si ya tomaste una decisión, lo respetamos completamente. ¡Gracias por haber confiado en nosotros para tu consulta! 😊`,
    },
];

// ─── Internal team alert templates ───────────────────────────────────────────

export function generateTeamAlertNewProspect(params: {
    patientName: string;
    consultaDate: string;
    interest?: string;
    patientId: string;
    appUrl: string;
}): string {
    const { patientName, consultaDate, interest, patientId, appUrl } = params;
    const interestBadge = interest
        ? `<span style="background:${GOLD};color:#000;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;">${interest.toUpperCase()}</span>`
        : '';
    return `<div style="font-family:sans-serif;max-width:480px;background:#1a1a1a;border-radius:10px;overflow:hidden;">
  <div style="background:#C9A96E;padding:14px 20px;">
    <strong style="color:#000;">🔔 NUEVO PROSPECTO — 1RA CONSULTA</strong>
  </div>
  <div style="padding:20px;color:#ddd;">
    <p style="margin:0 0 8px;"><strong>Paciente:</strong> ${patientName} ${interestBadge}</p>
    <p style="margin:0 0 8px;"><strong>Consulta:</strong> ${consultaDate}</p>
    <p style="margin:0 0 16px;"><strong>Interés principal:</strong> ${interest ?? 'No especificado'}</p>
    <a href="${appUrl}/workflows?patient=${patientId}" style="background:${GOLD};color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;">Ver en el sistema →</a>
  </div>
</div>`;
}

// ─── Export map for use in server actions ─────────────────────────────────────

export const PROSPECT_EMAIL_BY_STAGE: Record<number, (p: { nombre: string; mainInterest?: string }) => string> = {
    2: generateProspectEmail48h,
    3: generateProspectEmail7d,
    4: generateProspectEmail30d,
    5: generateProspectEmail60d,
    7: generateProspectEmail90d,
};
