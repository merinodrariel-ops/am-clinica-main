import { z } from 'zod';

export const admissionModeSchema = z.enum(['online', 'manual']);

const textRequired = (label: string, min = 2) =>
    z.string().trim().min(min, `Ingresa ${label.toLowerCase()}`);

const optionalText = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

export const admissionDraftBaseObject = z.object({
    id_paciente: z.string().uuid().optional().or(z.literal('')),
    nombre: textRequired('nombre'),
    apellido: textRequired('apellido'),
    dni: z.string().trim().min(7, 'DNI inválido').max(14, 'DNI inválido'),
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
    documento_identidad_nombre: optionalText,
    cobertura_nombre: optionalText,
});

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

export const admissionIdentityStepSchema = admissionDraftBaseObject.pick({
    nombre: true,
    apellido: true,
    dni: true,
    cuit: true,
});

export const admissionContactStepSchema = admissionDraftBaseObject.pick({
    whatsapp_pais_code: true,
    whatsapp_numero: true,
    whatsapp_custom_pais_code: true,
    email_local: true,
    email_dominio: true,
    email_custom_domain: true,
    ciudad: true,
    zona_barrio: true,
    custom_barrio: true,
});

export const admissionHealthStepSchema = admissionDraftBaseObject.pick({
    salud_alergias: true,
    salud_alergias_detalle: true,
    salud_condiciones: true,
    salud_condiciones_detalle: true,
    salud_medicacion: true,
    salud_medicacion_detalle: true,
    documento_identidad_nombre: true,
    cobertura_nombre: true,
});

export const admissionObjectiveStepSchema = admissionDraftBaseObject.pick({
    motivo_consulta: true,
    referencia_origen: true,
    referencia_recomendado_por: true,
    profesional: true,
});

export const admissionConsentStepSchema = admissionDraftBaseObject.pick({
    consentimiento_privacidad: true,
    consentimiento_tratamiento: true,
    firma_data_url: true,
});

export const admissionSubmissionSchema = z.object({
    id_paciente: z.string().uuid().optional(),
    nombre: textRequired('nombre'),
    apellido: textRequired('apellido'),
    dni: z.string().trim().min(7).max(14),
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
    consentimiento_privacidad: z.literal(true),
    consentimiento_tratamiento: z.literal(true),
    firma_data_url: z.string().min(100),
    documento_identidad_nombre: optionalText,
    cobertura_nombre: optionalText,
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
    documento_identidad_nombre: '',
    cobertura_nombre: '',
};
