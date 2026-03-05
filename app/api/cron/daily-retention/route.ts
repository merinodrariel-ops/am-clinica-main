import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendNotification } from '@/lib/am-scheduler/notification-service';

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
