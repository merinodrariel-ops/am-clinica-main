import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendNotification } from '@/lib/am-scheduler/notification-service';
import { sendResendEmail } from '@/lib/resend-email';
import { sendEmail } from '@/lib/nodemailer';
import {
    buildAvailableSlots,
    getDoctorAppointmentsForDate,
    getDoctorScheduleForDate,
    getPublicDoctorById,
    isDateWithinBookingWindow,
    isTimeAlignedWithSchedule,
    parseDateOnlyLocal,
    toArIso,
} from '@/lib/public-booking';

type BookingPayload = {
    doctorId?: string;
    date?: string;
    time?: string;
    nombre?: string;
    apellido?: string;
    email?: string;
    whatsapp?: string;
    notes?: string;
};

type PatientRow = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    email: string | null;
    whatsapp: string | null;
};

function sanitizeText(value: string | undefined, maxLength: number): string {
    return (value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function findOrCreatePatient(admin: ReturnType<typeof createAdminClient>, payload: {
    nombre: string;
    apellido: string;
    email: string;
    whatsapp: string | null;
}): Promise<PatientRow> {
    const normalizedEmail = payload.email.toLowerCase();

    const { data: byEmail, error: byEmailError } = await admin
        .from('pacientes')
        .select('id_paciente, nombre, apellido, email, whatsapp')
        .eq('is_deleted', false)
        .ilike('email', normalizedEmail)
        .limit(1);

    if (byEmailError) throw new Error(byEmailError.message);
    if (byEmail && byEmail.length > 0) {
        return byEmail[0] as PatientRow;
    }

    if (payload.whatsapp) {
        const { data: byPhone, error: byPhoneError } = await admin
            .from('pacientes')
            .select('id_paciente, nombre, apellido, email, whatsapp')
            .eq('is_deleted', false)
            .eq('whatsapp', payload.whatsapp)
            .limit(1);

        if (byPhoneError) throw new Error(byPhoneError.message);
        if (byPhone && byPhone.length > 0) {
            return byPhone[0] as PatientRow;
        }
    }

    const { data: created, error: createError } = await admin
        .from('pacientes')
        .insert({
            nombre: payload.nombre,
            apellido: payload.apellido,
            email: normalizedEmail,
            whatsapp: payload.whatsapp,
            estado_paciente: 'activo',
            origen_registro: 'agenda_publica',
            fecha_alta: new Date().toISOString(),
            is_deleted: false,
        })
        .select('id_paciente, nombre, apellido, email, whatsapp')
        .single();

    if (createError || !created) {
        throw new Error(createError?.message || 'No se pudo crear el paciente');
    }

    return created as PatientRow;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const payload = (await request.json()) as BookingPayload;

        const doctorId = sanitizeText(payload.doctorId, 100);
        const date = sanitizeText(payload.date, 10);
        const time = sanitizeText(payload.time, 5);
        const nombre = sanitizeText(payload.nombre, 80);
        const apellido = sanitizeText(payload.apellido, 80);
        const email = sanitizeText(payload.email, 160).toLowerCase();
        const whatsapp = sanitizeText(payload.whatsapp, 40) || null;
        const notes = sanitizeText(payload.notes, 500) || null;

        if (!doctorId || !date || !time || !nombre || !apellido || !email) {
            return NextResponse.json(
                { success: false, error: 'Faltan datos obligatorios para agendar el turno' },
                { status: 400 }
            );
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { success: false, error: 'El email no tiene un formato válido' },
                { status: 400 }
            );
        }

        const parsedDate = parseDateOnlyLocal(date);
        if (!parsedDate || !isDateWithinBookingWindow(date)) {
            return NextResponse.json(
                { success: false, error: 'La fecha seleccionada no es válida' },
                { status: 400 }
            );
        }

        const doctor = await getPublicDoctorById(doctorId);
        if (!doctor) {
            return NextResponse.json(
                { success: false, error: 'El profesional seleccionado no está disponible' },
                { status: 400 }
            );
        }

        const schedule = await getDoctorScheduleForDate(doctorId, date);
        if (!schedule || !isTimeAlignedWithSchedule(time, schedule)) {
            return NextResponse.json(
                { success: false, error: 'El horario elegido no es válido para este profesional' },
                { status: 400 }
            );
        }

        const dayAppointments = await getDoctorAppointmentsForDate(doctorId, date);
        const availableSlots = buildAvailableSlots(schedule, dayAppointments, date);
        const selectedSlot = availableSlots.find((slot) => slot.time === time);

        if (!selectedSlot) {
            return NextResponse.json(
                { success: false, error: 'El horario ya no está disponible. Elegí otro por favor.' },
                { status: 409 }
            );
        }

        const startTimeIso = toArIso(date, time);
        const endTimeIso = selectedSlot.endIso;
        const now = Date.now();

        if (new Date(startTimeIso).getTime() <= now) {
            return NextResponse.json(
                { success: false, error: 'El turno debe ser en un horario futuro' },
                { status: 400 }
            );
        }

        const admin = createAdminClient();
        const patient = await findOrCreatePatient(admin, {
            nombre,
            apellido,
            email,
            whatsapp,
        });

        const appointmentTitle = `Primera consulta - ${nombre} ${apellido}`;

        const { data: createdAppointment, error: appointmentError } = await admin
            .from('agenda_appointments')
            .insert({
                title: appointmentTitle,
                patient_id: patient.id_paciente,
                doctor_id: doctorId,
                start_time: startTimeIso,
                end_time: endTimeIso,
                status: 'confirmed',
                type: 'consulta',
                source: 'public_booking',
                notes: notes
                    ? `Reserva pública (primera consulta). ${notes}`
                    : 'Reserva pública (primera consulta).',
            })
            .select('id, start_time, end_time')
            .single();

        if (appointmentError || !createdAppointment) {
            return NextResponse.json(
                { success: false, error: appointmentError?.message || 'No se pudo crear el turno' },
                { status: 500 }
            );
        }

        const warnings: string[] = [];

        const patientNotification = await sendNotification({
            appointmentId: createdAppointment.id,
            templateKey: 'appointment_confirmed',
            channel: 'email',
            patientName: `${nombre} ${apellido}`,
            patientEmail: email,
            patientPhone: whatsapp,
            doctorName: doctor.full_name,
            startTime: createdAppointment.start_time,
            endTime: createdAppointment.end_time,
            appointmentType: 'consulta',
            clinicName: 'AM Clínica',
        });

        if (!patientNotification.success) {
            warnings.push('No se pudo enviar el email de confirmación al paciente.');
        }

        const notifyEmail =
            process.env.PUBLIC_BOOKING_NOTIFY_EMAIL ||
            process.env.ADMIN_EMAIL ||
            process.env.GMAIL_USER ||
            '';

        if (notifyEmail) {
            const prettyDate = new Date(createdAppointment.start_time).toLocaleString('es-AR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Argentina/Buenos_Aires',
            });

            const clinicSubject = `Nuevo turno agendado (primera consulta) - ${nombre} ${apellido}`;
            const clinicHtml = `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;">
                    <h2 style="margin:0 0 12px;">Nuevo turno agendado desde link público</h2>
                    <p style="margin:0 0 18px;">Se registró una primera consulta en la agenda interna.</p>
                    <ul style="margin:0 0 18px;padding-left:18px;line-height:1.6;">
                        <li><strong>Paciente:</strong> ${escapeHtml(nombre)} ${escapeHtml(apellido)}</li>
                        <li><strong>Email:</strong> ${escapeHtml(email)}</li>
                        <li><strong>WhatsApp:</strong> ${escapeHtml(whatsapp || 'No informado')}</li>
                        <li><strong>Profesional:</strong> ${escapeHtml(doctor.full_name)}</li>
                        <li><strong>Fecha y hora:</strong> ${escapeHtml(prettyDate)}</li>
                        <li><strong>ID turno:</strong> ${escapeHtml(createdAppointment.id)}</li>
                    </ul>
                    ${notes ? `<p style="margin:0 0 8px;"><strong>Notas:</strong> ${escapeHtml(notes)}</p>` : ''}
                </div>
            `;

            const resendResult = await sendResendEmail({
                to: notifyEmail,
                subject: clinicSubject,
                html: clinicHtml,
            });

            if (!resendResult.success) {
                const gmailResult = await sendEmail({
                    to: notifyEmail,
                    subject: clinicSubject,
                    html: clinicHtml,
                });

                if (!gmailResult.success) {
                    warnings.push('No se pudo enviar el email interno de aviso al contacto de la clínica.');
                }
            }
        } else {
            warnings.push('No hay email interno configurado para recibir avisos de agenda pública.');
        }

        return NextResponse.json({
            success: true,
            appointment: {
                id: createdAppointment.id,
                startTime: createdAppointment.start_time,
                endTime: createdAppointment.end_time,
                doctorName: doctor.full_name,
                patientName: `${nombre} ${apellido}`,
            },
            warnings,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado al reservar turno';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
