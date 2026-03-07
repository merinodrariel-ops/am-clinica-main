import { NextRequest, NextResponse } from 'next/server';
import {
    buildAvailableSlots,
    getDoctorAppointmentsForDate,
    getDoctorScheduleForDate,
    isDateWithinBookingWindow,
} from '@/lib/public-booking';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const doctorId = request.nextUrl.searchParams.get('doctorId') || '';
        const date = request.nextUrl.searchParams.get('date') || '';

        if (!doctorId || !date) {
            return NextResponse.json(
                { success: false, error: 'doctorId y date son obligatorios' },
                { status: 400 }
            );
        }

        if (!isDateWithinBookingWindow(date)) {
            return NextResponse.json(
                { success: false, error: 'Fecha fuera del rango permitido' },
                { status: 400 }
            );
        }

        const schedule = await getDoctorScheduleForDate(doctorId, date);
        if (!schedule) {
            return NextResponse.json({ success: true, slots: [] });
        }

        const appointments = await getDoctorAppointmentsForDate(doctorId, date);
        const slots = buildAvailableSlots(schedule, appointments, date);

        return NextResponse.json({
            success: true,
            slots,
            schedule: {
                start: schedule.start_time,
                end: schedule.end_time,
                slotDurationMinutes: schedule.slot_duration_minutes,
                bufferMinutes: schedule.buffer_minutes,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar horarios';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
