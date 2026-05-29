import type { Paciente } from '@/lib/patients';

export const PRELOADED_PATIENT_STATUS = 'Pendiente formulario';
export const PRELOADED_PATIENT_ORIGIN = 'Paciente propio profesional';

export function splitPatientDisplayName(displayName: string) {
    const parts = displayName
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(Boolean);

    if (parts.length === 0) return { nombre: 'Paciente', apellido: 'Sin apellido' };
    if (parts.length === 1) return { nombre: parts[0], apellido: 'Sin apellido' };

    return {
        nombre: parts.slice(0, -1).join(' '),
        apellido: parts[parts.length - 1],
    };
}

function normalizePhoneDigits(value?: string | null) {
    return (value || '').replace(/\D/g, '');
}

function normalizeEmail(value?: string | null) {
    const email = value?.trim().toLowerCase();
    if (!email) return undefined;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export function buildPreloadedPatientPayload(input: {
    displayName: string;
    whatsapp?: string;
    email?: string;
    doctorName?: string;
}): Partial<Paciente> {
    const { nombre, apellido } = splitPatientDisplayName(input.displayName);
    const whatsappNumero = normalizePhoneDigits(input.whatsapp);
    const email = normalizeEmail(input.email);
    const doctorSuffix = input.doctorName?.trim()
        ? ` Profesional responsable: ${input.doctorName.trim()}.`
        : '';

    return {
        nombre,
        apellido,
        ...(whatsappNumero ? {
            whatsapp_pais_code: '+54',
            whatsapp_numero: whatsappNumero,
            whatsapp: `+54${whatsappNumero}`,
        } : {}),
        ...(email ? { email } : {}),
        estado_paciente: PRELOADED_PATIENT_STATUS,
        origen_registro: PRELOADED_PATIENT_ORIGIN,
        referencia_origen: PRELOADED_PATIENT_ORIGIN,
        observaciones_generales: `Paciente precargado desde agenda. Pendiente completar formulario de admisión.${doctorSuffix}`,
        consentimiento_comunicacion: false,
    };
}
