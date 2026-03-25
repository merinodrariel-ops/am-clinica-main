import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendNotification } from '@/lib/am-scheduler/notification-service';
import { createRecallsFromAppointment } from '@/app/actions/recalls';
import { EmailService } from '@/lib/email-service';

export const maxDuration = 300; // 5 minutes max duration for Vercel Cron

export async function GET(request: Request) {
    // 1. Verify Authorization (Vercel Cron convention)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const results = {
        birthdays: 0,
        postTreatment: 0,
        recalls: 0,
        primeraConsultaBackfill: 0,
        autoCompleted: 0,
        recallsCreated: 0,
        scheduledMessagesSent: 0,
        errors: [] as string[]
    };

    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');

        // ─── 1. Birthdays ───────────────────────────────────────
        try {
            // Find patients whose birthday matches today's -MM-DD
            const { data: bdays, error: bdayError } = await supabase
                .from('pacientes')
                .select('*')
                .like('fecha_nacimiento', `%-${mm}-${dd}`);

            if (bdayError) throw bdayError;

            if (bdays) {
                for (const patient of bdays) {
                    if (!patient.whatsapp && !patient.email) continue;

                    await sendNotification({
                        appointmentId: '00000000-0000-0000-0000-000000000000', // Dummy UUID for non-appointment notifications
                        templateKey: 'birthday_greeting',
                        channel: patient.whatsapp ? 'whatsapp' : 'email',
                        patientName: patient.nombre || patient.full_name || 'Paciente',
                        patientEmail: patient.email || undefined,
                        patientPhone: patient.whatsapp || undefined,
                        startTime: new Date().toISOString(),
                        endTime: new Date().toISOString()
                    });
                    results.birthdays++;
                }
            }
        } catch (err: any) {
            results.errors.push(`Birthdays error: ${err.message || String(err)}`);
        }

        // ─── 2. Post-Treatment Follow-up (1 Day) ────────────────
        try {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yStart = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
            const yEnd = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();

            // Find specific complex treatments from yesterday
            const { data: followups, error: followupsError } = await supabase
                .from('agenda_appointments')
                .select('*, patient:pacientes(*), doctor:doctor_profiles(*)')
                .eq('status', 'completed')
                .gte('start_time', yStart)
                .lte('start_time', yEnd)
                .in('type', ['cirugia', 'extraccion', 'implante', 'endodoncia']);

            if (followupsError) throw followupsError;

            if (followups) {
                for (const apt of followups) {
                    const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient;
                    const doctor = Array.isArray(apt.doctor) ? apt.doctor[0] : apt.doctor;

                    if (!patient || (!patient.whatsapp && !patient.email)) continue;

                    await sendNotification({
                        appointmentId: apt.id,
                        templateKey: 'post_treatment_followup',
                        channel: patient.whatsapp ? 'whatsapp' : 'email', // Prefer WhatsApp for quick follow-up
                        patientName: patient.nombre || patient.full_name || 'Paciente',
                        patientEmail: patient.email || undefined,
                        patientPhone: patient.whatsapp || undefined,
                        doctorName: doctor?.full_name || undefined,
                        startTime: apt.start_time,
                        endTime: apt.end_time
                    });
                    results.postTreatment++;
                }
            }
        } catch (err: any) {
            results.errors.push(`Post-Treatment error: ${err.message || String(err)}`);
        }

        // ─── 3. 6-Month Recall ──────────────────────────────────
        try {
            const sixMonthsAgo = new Date(today);
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const smStart = new Date(sixMonthsAgo.setHours(0, 0, 0, 0)).toISOString();
            const smEnd = new Date(sixMonthsAgo.setHours(23, 59, 59, 999)).toISOString();

            const { data: recallCandidates, error: recallError } = await supabase
                .from('agenda_appointments')
                .select('*, patient:pacientes(*)')
                .eq('status', 'completed')
                .gte('start_time', smStart)
                .lte('start_time', smEnd);

            if (recallError) throw recallError;

            if (recallCandidates) {
                // To avoid sending multiple recalls to the same patient, we group them by patientId
                const uniquePatients = new Map();
                for (const apt of recallCandidates) {
                    if (apt.patient_id) uniquePatients.set(apt.patient_id, apt);
                }

                // Now check if they have any upcoming appointments
                for (const [patientId, apt] of uniquePatients.entries()) {
                    const { count, error: countError } = await supabase
                        .from('agenda_appointments')
                        .select('*', { count: 'exact', head: true })
                        .eq('patient_id', patientId)
                        .gte('start_time', new Date().toISOString());

                    if (countError) {
                        console.error('Error checking future appointments for', patientId, countError);
                        continue;
                    }

                    // If count is 0, they have no future appointments -> Send recall
                    if (count === 0) {
                        const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient;
                        if (!patient || (!patient.whatsapp && !patient.email)) continue;

                        await sendNotification({
                            appointmentId: apt.id, // Using their last appointment ID as reference
                            templateKey: 'recall_6_months',
                            channel: patient.whatsapp ? 'whatsapp' : 'email',
                            patientName: patient.nombre || patient.full_name || 'Paciente',
                            patientEmail: patient.email || undefined,
                            patientPhone: patient.whatsapp || undefined,
                            startTime: new Date().toISOString(),
                            endTime: new Date().toISOString()
                        });
                        results.recalls++;
                    }
                }
            }
        } catch (err: any) {
            results.errors.push(`Recalls error: ${err.message || String(err)}`);
        }

        // ─── 4. Backfill primera_consulta_fecha ─────────────────
        // Turno pasado + no cancelado = paciente que vino.
        // Seteamos la fecha de la primera visita real si todavía está en NULL.
        try {
            const todayStart = new Date(today);
            todayStart.setHours(0, 0, 0, 0);

            const { data: pastApts, error: pastError } = await supabase
                .from('agenda_appointments')
                .select('patient_id, start_time')
                .lt('start_time', todayStart.toISOString())
                .not('status', 'in', '("cancelled","no_show")')
                .not('patient_id', 'is', null)
                .order('start_time', { ascending: true });

            if (pastError) throw pastError;

            // Agrupar: quedarnos con el turno más antiguo por paciente
            const earliest = new Map<string, string>();
            for (const apt of pastApts ?? []) {
                if (apt.patient_id && !earliest.has(apt.patient_id)) {
                    earliest.set(apt.patient_id, apt.start_time.split('T')[0]);
                }
            }

            for (const [patientId, visitDate] of earliest.entries()) {
                const { data: pac } = await supabase
                    .from('pacientes')
                    .select('primera_consulta_fecha')
                    .eq('id_paciente', patientId)
                    .single();

                if (pac && !pac.primera_consulta_fecha) {
                    await supabase
                        .from('pacientes')
                        .update({ primera_consulta_fecha: visitDate })
                        .eq('id_paciente', patientId);
                    results.primeraConsultaBackfill++;
                }
            }
        } catch (err: any) {
            results.errors.push(`PrimeraConsulta backfill error: ${err.message || String(err)}`);
        }

        // ─── 5. Recordatorio de confirmación para turnos tentativos ─
        // 14 días antes de un turno pending → WhatsApp al paciente para confirmar
        try {
            const in14 = new Date(today);
            in14.setDate(in14.getDate() + 14);
            const in14Start = new Date(in14.getFullYear(), in14.getMonth(), in14.getDate(), 0, 0, 0).toISOString();
            const in14End   = new Date(in14.getFullYear(), in14.getMonth(), in14.getDate(), 23, 59, 59).toISOString();

            const { data: tentativeApts } = await supabase
                .from('agenda_appointments')
                .select(`
                    id, start_time, end_time, type,
                    patient:pacientes(nombre, apellido, whatsapp, email),
                    doctor:profiles(full_name)
                `)
                .eq('status', 'pending')
                .gte('start_time', in14Start)
                .lte('start_time', in14End)
                .not('patient_id', 'is', null);

            for (const apt of tentativeApts ?? []) {
                const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient;
                const doctor  = Array.isArray(apt.doctor)  ? apt.doctor[0]  : apt.doctor;
                if (!patient?.whatsapp && !patient?.email) continue;

                await sendNotification({
                    appointmentId: apt.id,
                    templateKey: 'reminder_24h',
                    channel: patient.whatsapp ? 'whatsapp' : 'email',
                    patientName: `${patient.nombre ?? ''} ${patient.apellido ?? ''}`.trim(),
                    patientPhone: patient.whatsapp ?? null,
                    patientEmail: patient.email ?? null,
                    doctorName: doctor?.full_name ?? null,
                    startTime: apt.start_time,
                    endTime: apt.end_time,
                });
            }
        } catch (err: any) {
            results.errors.push(`Tentative confirmation: ${err.message || String(err)}`);
        }

        // ─── 6. Auto-completar turnos pasados no cancelados ─────
        // Lógica: si el turno pasó y no fue cancelado → se dio el turno → completed.
        // Esto dispara la creación de recalls automáticamente.
        try {
            const now = new Date();

            const { data: pendingApts } = await supabase
                .from('agenda_appointments')
                .select('id, patient_id, doctor_id, type, start_time, end_time')
                .lt('end_time', now.toISOString())
                .not('status', 'in', '("cancelled","no_show","completed")')
                .not('patient_id', 'is', null);

            for (const apt of pendingApts ?? []) {
                // Marcar como completado
                const { error: updateErr } = await supabase
                    .from('agenda_appointments')
                    .update({ status: 'completed', updated_at: now.toISOString() })
                    .eq('id', apt.id);

                if (updateErr) {
                    results.errors.push(`Auto-complete ${apt.id}: ${updateErr.message}`);
                    continue;
                }
                results.autoCompleted++;

                // Disparar recalls automáticos si el tipo tiene reglas
                if (apt.patient_id && apt.type) {
                    try {
                        await createRecallsFromAppointment(apt.id, apt.type, apt.patient_id, apt.start_time, apt.doctor_id ?? null);
                        results.recallsCreated++;
                    } catch (e: any) {
                        results.errors.push(`Recall for ${apt.id}: ${e.message}`);
                    }
                }
            }
        } catch (err: any) {
            results.errors.push(`Auto-complete error: ${err.message || String(err)}`);
        }

        // ─── 7. Enviar mensajes programados (fotos al paciente) ─────
        try {
            const now = new Date();

            const { data: pendingMsgs } = await supabase
                .from('scheduled_messages')
                .select('*')
                .eq('status', 'pending')
                .lte('scheduled_for', now.toISOString());

            for (const msg of pendingMsgs ?? []) {
                let sent = false;
                let sendError = '';

                try {
                    if (msg.channel === 'whatsapp' && msg.phone) {
                        const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
                        const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
                        const FROM_WA = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

                        if (!ACCOUNT_SID || !AUTH_TOKEN) {
                            sendError = 'Twilio not configured';
                        } else {
                            const toPhone = msg.phone.startsWith('+') ? msg.phone : `+${msg.phone}`;
                            const body = new URLSearchParams({
                                From: FROM_WA.startsWith('whatsapp:') ? FROM_WA : `whatsapp:${FROM_WA}`,
                                To: `whatsapp:${toPhone}`,
                                Body: msg.message,
                                ...(msg.media_url ? { MediaUrl: msg.media_url } : {}),
                            });
                            const resp = await fetch(
                                `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/x-www-form-urlencoded',
                                        Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
                                    },
                                    body: body.toString(),
                                }
                            );
                            if (resp.ok) sent = true;
                            else sendError = `Twilio HTTP ${resp.status}`;
                        }
                    } else if (msg.channel === 'email' && msg.email) {
                        const emailResult = await EmailService.send({
                            to: msg.email,
                            subject: 'Fotos de tu tratamiento — AM Clínica',
                            html: `<p>${msg.message.replace(/\n/g, '<br>')}</p>${msg.media_url ? `<p><a href="${msg.media_url}">Ver foto</a></p>` : ''}`,
                        });
                        if (emailResult?.id) sent = true;
                        else sendError = 'Email send failed';
                    }
                } catch (e: any) {
                    sendError = e.message || String(e);
                }

                await supabase
                    .from('scheduled_messages')
                    .update({
                        status: sent ? 'sent' : 'error',
                        sent_at: sent ? now.toISOString() : null,
                        error: sendError || null,
                    })
                    .eq('id', msg.id);

                if (sent) results.scheduledMessagesSent++;
                else results.errors.push(`ScheduledMsg ${msg.id}: ${sendError}`);
            }
        } catch (err: any) {
            results.errors.push(`Scheduled messages error: ${err.message || String(err)}`);
        }

        return NextResponse.json({
            success: true,
            runDate: today.toISOString(),
            processed: results
        });

    } catch (error: any) {
        console.error('[CRON] Daily Retention Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || String(error), processed: results },
            { status: 500 }
        );
    }
}
