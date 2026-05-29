import { loadEnvConfig } from '@next/env';
import path from 'path';

// Cargar variables de entorno del archivo .env.local
const projectDir = path.resolve(__dirname, '..');
loadEnvConfig(projectDir);

import { render } from '@react-email/render';
import { SurveyFirstVisitEmail } from '../emails/SurveyFirstVisit';
import { sendResendEmail } from '../lib/resend-email';

async function sendTestSurvey() {
  const recipient = 'drarielmerino@gmail.com';
  console.log(`[Test Survey] Iniciando envío de prueba a ${recipient}...`);

  const patientName = 'Dr. Ariel Merino';
  const surveyToken = 'test-token-google-review';

  try {
    // 1. Renderizar la plantilla React Email
    const html = await render(
      SurveyFirstVisitEmail({
        patientName,
        surveyToken,
      })
    );

    // 2. Enviar el email usando el servicio de Resend
    const res = await sendResendEmail({
      to: recipient,
      subject: '¿Cómo fue tu primera visita? — AM Clínica',
      html,
    });

    if (res.success) {
      console.log(`[Test Survey] ¡Email de prueba enviado con éxito! ID: ${res.id}`);
    } else {
      console.error('[Test Survey] Error al enviar el email:', res.error);
    }
  } catch (err) {
    console.error('[Test Survey] Excepción durante el proceso:', err);
  }
}

sendTestSurvey();
