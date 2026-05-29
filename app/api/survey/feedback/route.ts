import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service';

export async function POST(req: NextRequest) {
  try {
    const { token, feedback, rating, nombre, email } = await req.json() as {
      token: string;
      feedback: string;
      rating?: number;
      nombre?: string;
      email?: string;
    };

    if (!token || !feedback) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Obtener la encuesta para verificar datos
    const { data: survey, error: surveyError } = await supabase
      .from('satisfaction_surveys')
      .select('*, agenda_appointments(patient_id, doctor_id)')
      .eq('token', token)
      .single();

    if (surveyError || !survey) {
      console.error('[Survey Feedback] Survey not found:', surveyError);
      return NextResponse.json({ error: 'Encuesta no encontrada' }, { status: 404 });
    }

    // 2. Actualizar el feedback en la base de datos
    const finalRating = rating ?? survey.rating;
    const { error: updateError } = await supabase
      .from('satisfaction_surveys')
      .update({
        feedback,
        responded_at: new Date().toISOString()
      })
      .eq('token', token);

    if (updateError) {
      console.error('[Survey Feedback] Update error:', updateError);
      return NextResponse.json({ error: 'Error al actualizar feedback' }, { status: 500 });
    }

    // 3. Obtener nombres del paciente y doctor para el email
    let patientName = nombre || 'Paciente';
    let patientEmail = email || '';
    let doctorName = 'Clínica';

    if (survey.appointment_id) {
      const { data: appt } = await supabase
        .from('agenda_appointments')
        .select(`
          id,
          pacientes:patient_id (nombre, apellido, email),
          profiles:doctor_id (full_name)
        `)
        .eq('id', survey.appointment_id)
        .single();

      if (appt) {
        if ((appt as any).pacientes) {
          if (!nombre) {
            patientName = `${(appt as any).pacientes.nombre} ${(appt as any).pacientes.apellido}`;
          }
          if (!email) {
            patientEmail = (appt as any).pacientes.email || '';
          }
        }
        if ((appt as any).profiles) {
          doctorName = (appt as any).profiles.full_name;
        }
      }
    }

    // 4. Si la calificación es baja (1, 2 o 3 estrellas), enviar alerta al equipo médico/administrativo
    const ratingValue = Number(finalRating);
    if (ratingValue <= 3) {
      const alertEmail = process.env.ADMIN_FEEDBACK_EMAIL ?? 'feedback@amesteticadental.com';

      const emailSubject = `⚠️ Feedback Crítico (${ratingValue}★) - ${patientName}`;
      const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:550px;margin:0 auto;padding:32px;background:#fafafa;border:1px solid #eaeaea;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:24px;font-weight:800;color:#dc2626;">AM CLÍNICA - ALERTA</span>
          </div>
          <h2 style="font-size:18px;font-weight:700;color:#111;margin:0 0 16px;text-align:center;">
            Se ha recibido un feedback de satisfacción bajo (${ratingValue}/5 ⭐)
          </h2>
          <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e5e7eb;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">
              <strong>Paciente:</strong> ${patientName}
            </p>
            <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">
              <strong>Email de Contacto:</strong> ${patientEmail || 'No informado'}
            </p>
            <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">
              <strong>Profesional atendiendo:</strong> ${doctorName}
            </p>
            <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">
              <strong>Calificación:</strong> 
              <span style="color:#d97706;font-weight:bold;">${'★'.repeat(ratingValue)}${'☆'.repeat(5 - ratingValue)}</span> (${ratingValue}/5)
            </p>
            <p style="margin:16px 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;font-weight:bold;">Comentario del Paciente</p>
            <p style="margin:0;font-size:15px;color:#111827;background:#fef2f2;padding:16px;border-left:4px solid #ef4444;border-radius:4px;font-style:italic;line-height:22px;">
              "${feedback}"
            </p>
          </div>
          <p style="font-size:12px;color:#6b7280;text-align:center;margin-top:24px;line-height:18px;">
            Por favor, tome contacto con el paciente a la brevedad para comprender su molestia y ofrecer soluciones.
          </p>
        </div>
      `;

      await EmailService.send({
        to: alertEmail,
        subject: emailSubject,
        html: emailHtml,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Survey Feedback Exception]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
