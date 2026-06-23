'use server';

import { createClient } from '@supabase/supabase-js';
import { ensureStandardPatientFolders } from '@/lib/google-drive';
import { syncPatientToSheet } from '@/lib/google-sheets';
import { EmailService } from '@/lib/email-service';
import { admissionSubmissionSchema, type AdmissionSubmission } from '@/lib/admission-schema';
import type { Paciente } from '@/lib/patients';

function getAdmissionSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Faltan variables de entorno de Supabase para admisión');
    }

    return createClient(supabaseUrl, supabaseKey);
}

export type AdmissionData = AdmissionSubmission;

type TriggerStatus = {
    ok: boolean;
    detail: string;
};

export type AdmissionTriggerMap = {
    database: TriggerStatus;
    drive: TriggerStatus;
    slides: TriggerStatus;
    sheets: TriggerStatus;
    todo: TriggerStatus;
};

const buildDefaultTriggers = (): AdmissionTriggerMap => ({
    database: { ok: false, detail: 'Pendiente' },
    drive: { ok: false, detail: 'Pendiente' },
    slides: { ok: false, detail: 'Pendiente' },
    sheets: { ok: false, detail: 'Pendiente' },
    todo: { ok: false, detail: 'Pendiente' },
});

type AdmissionIdentityMatch = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    documento: string | null;
    email: string | null;
    whatsapp: string | null;
    cuit: string | null;
    ciudad: string | null;
    zona_barrio: string | null;
};

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();
const normalizeDni = (value?: string | null) => (value || '').replace(/\D/g, '');

const safeFilterValue = (value: string) => value.replace(/[(),]/g, '');

function sanitizeAdmissionDni(value?: string | null): string {
    const raw = (value || '').trim();
    if (!raw) return '';

    const normalizedText = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s._-]+/g, '');

    const placeholders = new Set([
        'dni',
        'udni',
        'sindni',
        'nodni',
        'notiene',
        'pendiente',
        'provisorio',
        'provisoria',
        'desconocido',
        'desconocida',
        'xxx',
        'xxxx',
    ]);

    if (placeholders.has(normalizedText)) return '';

    const digits = normalizeDni(raw);
    if (!digits || /^0+$/.test(digits)) return '';
    return digits;
}

function composeClinicalNotes(data: AdmissionSubmission) {
    const sections: string[] = [];

    if (data.motivo_consulta) {
        sections.push(`Motivo admisión: ${data.motivo_consulta}`);
    }

    if (data.health_notes) {
        sections.push(`Alertas de salud: ${data.health_notes}`);
    }

    return sections.join('\n');
}

export async function submitAdmissionAction(rawData: AdmissionData) {
    const triggers = buildDefaultTriggers();

    try {
        const supabase = getAdmissionSupabase();
        const parsed = admissionSubmissionSchema.safeParse(rawData);
        if (!parsed.success) {
            return {
                success: false,
                error: parsed.error.issues[0]?.message || 'Datos de admisión inválidos',
                triggers,
            };
        }

        const data = parsed.data;
        console.log('Starting admission process for:', data.nombre, data.apellido, 'DOB:', data.fecha_nacimiento, 'Keys:', Object.keys(data).join(', '));

        let patientUUID = data.id_paciente || undefined;
        const clinicalNotes = composeClinicalNotes(data);

        // Prevent duplicates: if no UUID supplied, look for an existing patient by DNI or email
        if (!patientUUID) {
            const cleanDni = sanitizeAdmissionDni(data.dni);
            const cleanEmail = (data.email || '').trim().toLowerCase();
            const orParts: string[] = [];
            if (cleanDni) orParts.push(`documento.eq.${safeFilterValue(cleanDni)}`);
            if (cleanEmail) orParts.push(`email.eq.${safeFilterValue(cleanEmail)}`);

            if (orParts.length > 0) {
                const { data: existing } = await supabase
                    .from('pacientes')
                    .select('id_paciente')
                    .eq('is_deleted', false)
                    .or(orParts.join(','))
                    .limit(1)
                    .maybeSingle();
                if (existing?.id_paciente) {
                    patientUUID = existing.id_paciente;
                }
            }

            // Name-only fallback when neither DNI nor email are available
            if (!patientUUID && data.nombre && data.apellido) {
                const { data: byName } = await supabase
                    .from('pacientes')
                    .select('id_paciente')
                    .eq('is_deleted', false)
                    .ilike('nombre', data.nombre.trim())
                    .ilike('apellido', data.apellido.trim())
                    .limit(1)
                    .maybeSingle();
                if (byName?.id_paciente) {
                    patientUUID = byName.id_paciente;
                }
            }
        }

        const { data: created, error: createError } = await supabase
            .from('pacientes')
            .upsert({
                id_paciente: patientUUID,
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni || null,
                email: data.email,
                whatsapp: data.whatsapp,
                cuit: data.cuit,
                ciudad: data.ciudad,
                zona_barrio: data.zona_barrio,
                fecha_nacimiento: data.fecha_nacimiento || null,
                observaciones_generales: clinicalNotes,
                referencia_origen: data.referencia_origen,
                como_nos_conocio: data.referencia_origen,
                origen_registro: 'Admisión Directa',
                fecha_alta: patientUUID ? undefined : new Date().toISOString(), // Only set on create
                is_deleted: false,
            })
            .select()
            .single();

        if (createError) throw new Error(`Error saving patient: ${createError.message}`);
        triggers.database = { ok: true, detail: 'Paciente registrado en Supabase' };

        let driveLink = '';

        try {
            console.log('Starting Drive folder creation for:', data.apellido, data.nombre);
            const driveResult = await ensureStandardPatientFolders(
                data.apellido,
                data.nombre,
                created.link_historia_clinica || undefined
            );
            console.log('Drive result:', JSON.stringify(driveResult));
            if (driveResult.motherFolderId) {
                // If motherFolderUrl is missing, try to build a generic one or use the one from ensure
                driveLink = driveResult.motherFolderUrl || `https://drive.google.com/drive/folders/${driveResult.motherFolderId}`;
                
                triggers.drive = { 
                    ok: true, 
                    detail: driveResult.motherFolderUrl 
                        ? 'Carpeta de paciente creada/validada' 
                        : 'Carpeta creada (URL generada manualmente)' 
                };
                triggers.slides = { ok: true, detail: 'Omitido: las admisiones ya no generan presentaciones' };

                await supabase
                    .from('pacientes')
                    .update({
                        link_historia_clinica: driveLink,
                    })
                    .eq('id_paciente', created.id_paciente);
            } else {
                triggers.drive = { ok: false, detail: driveResult.error || 'No se pudo crear la carpeta en Drive' };
            }
        } catch (driveErr) {
            console.error('Error creating Drive folders:', driveErr);
            triggers.drive = { ok: false, detail: driveErr instanceof Error ? driveErr.message : String(driveErr) };
            triggers.slides = { ok: true, detail: 'Omitido: las admisiones ya no generan presentaciones' };
        }

        try {
            const sheetPayload: Paciente = {
                id_paciente: created.id_paciente,
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni || null,
                email: data.email,
                whatsapp: data.whatsapp,
                cuit: data.cuit || null,
                fecha_nacimiento: data.fecha_nacimiento || null,
                ciudad: data.ciudad || undefined,
                observaciones_generales: clinicalNotes,
                link_google_slides: null,
                origen_registro: 'Admisión Directa',
            };

            await syncPatientToSheet(sheetPayload);
            triggers.sheets = { ok: true, detail: 'Registro sincronizado en Google Sheets' };
        } catch (sheetErr) {
            console.error('Error syncing to Sheets:', sheetErr);
            triggers.sheets = { ok: false, detail: sheetErr instanceof Error ? sheetErr.message : String(sheetErr) };
        }

        try {
            // Deshabilitado por solicitud del usuario: Se omite la creación automática del todo "Primer Diagnóstico" para evitar saturar el módulo de tareas internas
            triggers.todo = { ok: true, detail: 'Omitido (deshabilitado por solicitud)' };
        } catch (todoErr) {
            console.error('Error:', todoErr);
            triggers.todo = { ok: false, detail: todoErr instanceof Error ? todoErr.message : String(todoErr) };
        }

        try {
            // Send premium welcome email
            await EmailService.sendWelcome(data.nombre, data.email);
            
            // Send form submission confirmation (admission form)
            await EmailService.sendFormConfirmation(data.nombre, data.email, 'Formulario de Admisión');
        } catch (emailErr) {
            console.error('Error sending admission emails:', emailErr);
        }

        return {
            success: true,
            patientId: created.id_paciente,
            triggers,
            links: {
                drive: driveLink || null,
                slides: null,
            },
        };
    } catch (error) {
        console.error('Admission error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            triggers,
        };
    }
}

/**
 * Partial save for lead capture.
 * Saves only essential data to ensure contact info is kept early.
 */
export async function upsertAdmissionLeadAction(data: Partial<AdmissionData>) {
    try {
        const supabase = getAdmissionSupabase();
        const patientUUID = data.id_paciente || undefined;

        const { data: upserted, error } = await supabase
            .from('pacientes')
            .upsert({
                id_paciente: patientUUID,
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni || null,
                email: data.email,
                whatsapp: data.whatsapp,
                observaciones_generales: data.motivo_consulta,
                referencia_origen: data.referencia_origen,
                como_nos_conocio: data.referencia_origen,
                cuit: data.cuit,
                is_deleted: false,
                fecha_alta: patientUUID ? undefined : new Date().toISOString(),
                origen_registro: 'Admisión Web (Lead)'
            })
            .select()
            .single();

        if (error) {
            console.error('Lead upsert error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, patientId: upserted.id_paciente };
    } catch (err) {
        console.error('Unexpected lead upsert error:', err);
        return { success: false, error: 'Error inesperado' };
    }
}

export async function checkAdmissionIdentityAction(params: {
    dni?: string;
    email?: string;
    excludePatientId?: string;
}) {
    try {
        const supabase = getAdmissionSupabase();
        const dni = sanitizeAdmissionDni(params.dni);
        const email = normalize(params.email);

        if (!dni && !email) {
            return { success: true, exists: false, patient: null as AdmissionIdentityMatch | null };
        }

        const filters: string[] = [];
        if (dni) {
            filters.push(`documento.eq.${safeFilterValue(dni)}`);
            if (params.dni && params.dni.trim() !== dni) {
                filters.push(`documento.eq.${safeFilterValue(params.dni.trim())}`);
            }
        } else if (email) {
            filters.push(`email.eq.${safeFilterValue(email)}`);
        }

        let query = supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento, email, whatsapp, cuit, ciudad, zona_barrio')
            .eq('is_deleted', false)
            .or(filters.join(','))
            .limit(6);

        if (params.excludePatientId) {
            query = query.neq('id_paciente', params.excludePatientId);
        }

        const { data, error } = await query;
        if (error) return { success: false, exists: false, patient: null, error: error.message };

        const exactMatch = (data || []).find((patient) => {
            if (dni) return normalizeDni(patient.documento) === dni;
            return Boolean(email && normalize(patient.email) === email);
        }) as AdmissionIdentityMatch | undefined;

        return {
            success: true,
            exists: Boolean(exactMatch),
            patient: exactMatch || null,
            candidates: data || [],
        };
    } catch (error) {
        return {
            success: false,
            exists: false,
            patient: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function searchAdmissionPatientsAction(query: string) {
    try {
        const supabase = getAdmissionSupabase();
        const term = query.trim();
        if (term.length < 2) {
            return { success: true, patients: [] as AdmissionIdentityMatch[] };
        }

        const safe = safeFilterValue(term);
        const filter = `%${safe}%`;

        const { data, error } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento, email, whatsapp, cuit, ciudad, zona_barrio')
            .eq('is_deleted', false)
            .or(`nombre.ilike.${filter},apellido.ilike.${filter},documento.ilike.${filter},email.ilike.${filter}`)
            .order('fecha_alta', { ascending: false })
            .limit(8);

        if (error) {
            return { success: false, patients: [], error: error.message };
        }

        return { success: true, patients: (data || []) as AdmissionIdentityMatch[] };
    } catch (error) {
        return {
            success: false,
            patients: [] as AdmissionIdentityMatch[],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
