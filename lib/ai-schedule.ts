import { z } from 'zod';
import { calculateWorkedHours, inferSalidaDiaSiguiente } from './caja-admin/attendance-utils';

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
const scheduleSchema = z.object({
    registros: z.array(z.object({
        personal_id: z.uuid(),
        fecha: z.iso.date(),
        hora_ingreso: clockTime,
        hora_egreso: clockTime,
        estado: z.enum(['pending', 'observado']),
    })).max(5000),
    mensaje_al_usuario: z.string().max(4000),
});

export const aiScheduleJsonSchema = z.toJSONSchema(scheduleSchema);

/** Validate the entire batch before inserting anything; never trust model totals or IDs. */
export function parseAiSchedule(text: string, allowedPersonalIds: readonly string[]) {
    let input: unknown;
    try {
        input = JSON.parse(text);
    } catch {
        throw new Error('La IA devolvió una respuesta inválida. No se guardaron horarios.');
    }
    const parsed = scheduleSchema.safeParse(input);
    if (!parsed.success) {
        throw new Error('La IA devolvió horarios, fechas o datos inválidos. No se guardaron horarios.');
    }
    const allowed = new Set(allowedPersonalIds);
    const seen = new Set<string>();
    const registros = parsed.data.registros.map(record => {
        if (!allowed.has(record.personal_id)) {
            throw new Error('La IA indicó una persona fuera del personal activo. No se guardaron horarios.');
        }
        const key = JSON.stringify([record.personal_id, record.fecha, record.hora_ingreso, record.hora_egreso]);
        if (seen.has(key)) {
            throw new Error('La IA devolvió registros duplicados. No se guardaron horarios.');
        }
        seen.add(key);
        const horas = calculateWorkedHours({ horaIngreso: record.hora_ingreso, horaEgreso: record.hora_egreso });
        return {
            ...record,
            salida_dia_siguiente: inferSalidaDiaSiguiente(record.hora_ingreso, record.hora_egreso),
            horas,
            estado: !record.hora_ingreso || !record.hora_egreso || horas === 0 ? 'observado' : record.estado,
        };
    });
    return { registros, mensaje_al_usuario: parsed.data.mensaje_al_usuario };
}

const implicitHoursSchema = z.object({
    entrada: clockTime,
    salida: clockTime,
    incompleto: z.boolean(),
    observaciones: z.string().max(1000),
});

export const aiImplicitHoursJsonSchema = z.toJSONSchema(implicitHoursSchema);

export function parseAiImplicitHours(text: string) {
    const parsed = implicitHoursSchema.parse(JSON.parse(text));
    const horas = calculateWorkedHours({ horaIngreso: parsed.entrada, horaEgreso: parsed.salida });
    return {
        ...parsed,
        horas,
        incompleto: parsed.incompleto || !parsed.entrada || !parsed.salida || horas === 0,
    };
}
