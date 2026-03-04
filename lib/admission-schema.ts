import { z } from 'zod';

export const admissionModeSchema = z.enum(['online', 'manual']);

const textRequired = (label: string, min = 2) =>
    z.string().trim().min(min, `Ingresa ${label.toLowerCase()}`);

const optionalDni = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine((value) => !value || (value.length >= 7 && value.length <= 14), 'DNI inválido');

const draftDni = z
    .string()
    .trim()
    .refine((value) => value.length === 0 || (value.length >= 7 && value.length <= 14), 'DNI inválido');

const optionalText = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const admissionDraftShape = {
    id_paciente: z.string().uuid().optional().or(z.literal('')),
    nombre: textRequired('nombre'),
    apellido: textRequired('apellido'),
    dni: draftDni,
    cuit: z.string().trim().optional(),
    whatsapp_pais_code: z.string().trim().min(1, 'Selecciona código país'),
    whatsapp_numero: z.string().trim().min(6, 'Número de WhatsApp inválido'),
    whatsapp_custom_pais_code: optionalText,
    email_local: z.string().trim().min(1, 'Ingresa tu email'),
    email_dominio: z.string().trim().min(1, 'Selecciona dominio de email'),
    email_custom_domain: optionalText,
    ciudad: textRequired('ciudad'),
    pais_exterior: optionalText,
    zona_barrio: textRequired('barrio/zona'),
    custom_barrio: optionalText,
    motivo_consulta: textRequired('motivo de consulta'),
    referencia_origen: textRequired('cómo nos conociste'),
    referencia_recomendado_por: optionalText,
    profesional: textRequired('profesional elegido'),
    salud_alergias: z.boolean(),
    salud_alergias_detalle: optionalText,
    salud_condiciones: z.boolean(),
    salud_condiciones_detalle: optionalText,
    salud_medicacion: z.boolean(),
    salud_medicacion_detalle: optionalText,
    consentimiento_privacidad: z.boolean(),
    consentimiento_tratamiento: z.boolean(),
    firma_data_url: z.string().optional(),
};

export const admissionDraftBaseObject = z.object(admissionDraftShape);

export const admissionDraftSchema = admissionDraftBaseObject
    .superRefine((data, ctx) => {
        if (data.whatsapp_pais_code === 'otro' && !data.whatsapp_custom_pais_code) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Ingresa el código internacional',
                path: ['whatsapp_custom_pais_code'],
            });
        }

        if (data.email_dominio === 'otro' && !data.email_custom_domain) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Ingresa el dominio de email',
                path: ['email_custom_domain'],
            });
        }

        if (data.zona_barrio === 'Otro' && !data.custom_barrio) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Ingresa barrio/zona',
                path: ['custom_barrio'],
            });
        }

        if (data.referencia_origen === 'Recomendación de un Amigo' && !data.referencia_recomendado_por) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Indica quién te recomendó',
                path: ['referencia_recomendado_por'],
            });
        }

        if (data.salud_alergias && !data.salud_alergias_detalle) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Detalla alergias relevantes',
                path: ['salud_alergias_detalle'],
            });
        }

        if (data.salud_condiciones && !data.salud_condiciones_detalle) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Detalla condiciones médicas relevantes',
                path: ['salud_condiciones_detalle'],
            });
        }

        if (data.salud_medicacion && !data.salud_medicacion_detalle) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Detalla medicación activa',
                path: ['salud_medicacion_detalle'],
            });
        }

        if (!data.consentimiento_privacidad) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Debes aceptar privacidad',
                path: ['consentimiento_privacidad'],
            });
        }

        if (!data.consentimiento_tratamiento) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Debes aceptar términos de admisión',
                path: ['consentimiento_tratamiento'],
            });
        }

        if (!data.firma_data_url || data.firma_data_url.length < 100) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'La firma digital es obligatoria',
                path: ['firma_data_url'],
            });
        }
    });

export const admissionIdentityStepSchema = z.object({
    nombre: admissionDraftShape.nombre,
    apellido: admissionDraftShape.apellido,
    dni: admissionDraftShape.dni,
    cuit: admissionDraftShape.cuit,
});

export const admissionContactStepSchema = z.object({
    whatsapp_pais_code: admissionDraftShape.whatsapp_pais_code,
    whatsapp_numero: admissionDraftShape.whatsapp_numero,
    whatsapp_custom_pais_code: admissionDraftShape.whatsapp_custom_pais_code,
    email_local: admissionDraftShape.email_local,
    email_dominio: admissionDraftShape.email_dominio,
    email_custom_domain: admissionDraftShape.email_custom_domain,
    ciudad: admissionDraftShape.ciudad,
    zona_barrio: admissionDraftShape.zona_barrio,
    custom_barrio: admissionDraftShape.custom_barrio,
});

export const admissionHealthStepSchema = z.object({
    salud_alergias: admissionDraftShape.salud_alergias,
    salud_alergias_detalle: admissionDraftShape.salud_alergias_detalle,
    salud_condiciones: admissionDraftShape.salud_condiciones,
    salud_condiciones_detalle: admissionDraftShape.salud_condiciones_detalle,
    salud_medicacion: admissionDraftShape.salud_medicacion,
    salud_medicacion_detalle: admissionDraftShape.salud_medicacion_detalle,
});

export const admissionObjectiveStepSchema = z.object({
    motivo_consulta: admissionDraftShape.motivo_consulta,
    referencia_origen: admissionDraftShape.referencia_origen,
    referencia_recomendado_por: admissionDraftShape.referencia_recomendado_por,
    profesional: admissionDraftShape.profesional,
});

export const admissionConsentStepSchema = z.object({
    consentimiento_privacidad: admissionDraftShape.consentimiento_privacidad,
    consentimiento_tratamiento: admissionDraftShape.consentimiento_tratamiento,
    firma_data_url: admissionDraftShape.firma_data_url,
});

export const admissionSubmissionSchema = z.object({
    id_paciente: z.string().uuid().optional(),
    nombre: textRequired('nombre'),
    apellido: textRequired('apellido'),
    dni: optionalDni,
    cuit: optionalText,
    email: z.string().trim().email('Email inválido'),
    telefono: z.string().trim().min(8, 'WhatsApp inválido'),
    ciudad: optionalText,
    zona_barrio: optionalText,
    profesional: optionalText,
    motivo_consulta: optionalText,
    referencia_origen: optionalText,
    referencia_recomendado_por: optionalText,
    health_alerts: z.array(z.string()).default([]),
    health_notes: optionalText,
    consentimiento_privacidad: z.boolean().default(true),
    consentimiento_tratamiento: z.boolean().default(true),
    firma_data_url: z.string().optional(),
    mode: admissionModeSchema,
});

export type AdmissionDraft = z.infer<typeof admissionDraftSchema>;
export type AdmissionMode = z.infer<typeof admissionModeSchema>;
export type AdmissionSubmission = z.infer<typeof admissionSubmissionSchema>;

export const admissionDefaultValues: AdmissionDraft = {
    id_paciente: '',
    nombre: '',
    apellido: '',
    dni: '',
    cuit: '',
    whatsapp_pais_code: '+54',
    whatsapp_numero: '',
    whatsapp_custom_pais_code: '',
    email_local: '',
    email_dominio: 'gmail.com',
    email_custom_domain: '',
    ciudad: 'CABA',
    pais_exterior: '',
    zona_barrio: '',
    custom_barrio: '',
    motivo_consulta: '',
    referencia_origen: '',
    referencia_recomendado_por: '',
    profesional: 'Consulta con Dr. Ariel Merino',
    salud_alergias: false,
    salud_alergias_detalle: '',
    salud_condiciones: false,
    salud_condiciones_detalle: '',
    salud_medicacion: false,
    salud_medicacion_detalle: '',
    consentimiento_privacidad: false,
    consentimiento_tratamiento: false,
    firma_data_url: '',
};
