'use server';

import { createClient } from '@supabase/supabase-js';
import { ensureStandardPatientFolders, createPatientDocuments } from '@/lib/google-drive';
import { syncPatientToSheet } from '@/lib/google-sheets';
import { sendEmail } from '@/lib/nodemailer';
import { admissionSubmissionSchema, type AdmissionSubmission } from '@/lib/admission-schema';
import type { Paciente } from '@/lib/patients';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export type AdmissionData = AdmissionSubmission;

type TriggerStatus = {
    ok: boolean;
    detail: string;
};

type PatientDocumentsResult = Awaited<ReturnType<typeof createPatientDocuments>>;

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
    telefono: string | null;
    cuit: string | null;
    ciudad: string | null;
    zona_barrio: string | null;
};

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();
const normalizeDni = (value?: string | null) => (value || '').replace(/\D/g, '');

const safeFilterValue = (value: string) => value.replace(/[(),]/g, '');

function composeClinicalNotes(data: AdmissionSubmission) {
    const sections: string[] = [];

    if (data.motivo_consulta) {
        sections.push(`Motivo admisión: ${data.motivo_consulta}`);
    }

    if (data.health_notes) {
        sections.push(`Alertas de salud: ${data.health_notes}`);
    }

    if (data.documento_identidad_nombre || data.cobertura_nombre) {
        sections.push(
            `Adjuntos identidad: ${data.documento_identidad_nombre || 'No enviado'} | Obra social/prepaga: ${data.cobertura_nombre || 'No enviado'}`,
        );
    }

    sections.push(`Consentimiento digital: privacidad=${data.consentimiento_privacidad ? 'si' : 'no'}, admision=${data.consentimiento_tratamiento ? 'si' : 'no'}`);
    sections.push(`Firma digital: ${data.firma_data_url ? 'capturada' : 'no capturada'}`);

    return sections.join('\n');
}

async function createFirstDiagnosisTodo(params: {
    patientId: string;
    patientName: string;
    reason?: string;
    healthAlerts: string[];
    driveLink?: string;
    slidesLink?: string;
}) {
    const { data: doctor, error: doctorError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .ilike('full_name', '%Ariel%Merino%')
        .limit(1)
        .maybeSingle();

    if (doctorError) {
        return { ok: false, detail: `Sin responsable: ${doctorError.message}` };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const descriptionParts = [
        `Paciente: ${params.patientName}`,
        `ID paciente: ${params.patientId}`,
        params.reason ? `Motivo: ${params.reason}` : null,
        params.healthAlerts.length ? `Alertas clínicas: ${params.healthAlerts.join('; ')}` : null,
        params.driveLink ? `Carpeta Drive: ${params.driveLink}` : null,
        params.slidesLink ? `Presentación diagnóstico: ${params.slidesLink}` : null,
        'Origen: formulario de admisión',
    ].filter(Boolean);

    const { error } = await supabase.from('todos').insert({
        title: `Primer Diagnóstico · ${params.patientName}`,
        description: descriptionParts.join('\n'),
        status: 'pending',
        priority: params.healthAlerts.length > 0 ? 'urgent' : 'high',
        created_by: null,
        created_by_name: 'Motor de Admisión',
        assigned_to_id: doctor?.id || null,
        assigned_to_name: doctor?.full_name || 'Dr. Ariel Merino',
        due_date: dueDate.toISOString().slice(0, 10),
        is_pinned: params.healthAlerts.length > 0,
    });

    if (error) {
        return { ok: false, detail: error.message };
    }

    return { ok: true, detail: `Asignada a ${doctor?.full_name || 'Dr. Ariel Merino'}` };
}

export async function submitAdmissionAction(rawData: AdmissionData) {
    const triggers = buildDefaultTriggers();

    try {
        const parsed = admissionSubmissionSchema.safeParse(rawData);
        if (!parsed.success) {
            return {
                success: false,
                error: parsed.error.issues[0]?.message || 'Datos de admisión inválidos',
                triggers,
            };
        }

        const data = parsed.data;
        console.log('Starting admission process for:', data.nombre, data.apellido);

        const patientUUID = data.id_paciente || undefined;
        const clinicalNotes = composeClinicalNotes(data);

        const { data: created, error: createError } = await supabase
            .from('pacientes')
            .upsert({
                id_paciente: patientUUID,
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni,
                email: data.email,
                telefono: data.telefono,
                cuit: data.cuit,
                ciudad: data.ciudad,
                zona_barrio: data.zona_barrio,
                observaciones_generales: clinicalNotes,
                referencia_origen: data.referencia_origen,
                fecha_alta: patientUUID ? undefined : new Date().toISOString(), // Only set on create
                is_deleted: false,
            })
            .select()
            .single();

        if (createError) throw new Error(`Error saving patient: ${createError.message}`);
        triggers.database = { ok: true, detail: 'Paciente registrado en Supabase' };

        let driveLink = '';
        let docResult: PatientDocumentsResult | null = null;

        try {
            const driveResult = await ensureStandardPatientFolders(data.apellido, data.nombre);
            if (driveResult.motherFolderId && driveResult.motherFolderUrl) {
                driveLink = driveResult.motherFolderUrl;
                triggers.drive = { ok: true, detail: 'Carpeta de paciente creada/validada' };

                docResult = await createPatientDocuments(driveResult.motherFolderId, {
                    nombre: data.nombre,
                    apellido: data.apellido,
                    dni: data.dni,
                    fecha: new Date().toLocaleDateString('es-AR'),
                });

                if (docResult?.fichaUrl || docResult?.presupuestoUrl) {
                    triggers.slides = { ok: true, detail: 'Presentación diagnóstica generada desde template' };
                } else {
                    triggers.slides = { ok: false, detail: docResult?.error || 'No se pudo generar Google Slides' };
                }

                await supabase
                    .from('pacientes')
                    .update({
                        link_historia_clinica: driveLink,
                        link_google_slides: docResult?.fichaUrl || null
                    })
                    .eq('id_paciente', created.id_paciente);
            } else {
                triggers.drive = { ok: false, detail: driveResult.error || 'No se pudo crear la carpeta en Drive' };
            }
        } catch (driveErr) {
            console.error('Error creating Drive folders:', driveErr);
            triggers.drive = { ok: false, detail: driveErr instanceof Error ? driveErr.message : String(driveErr) };
            triggers.slides = { ok: false, detail: 'No ejecutado por error de Drive' };
        }

        try {
            const sheetPayload: Paciente = {
                id_paciente: created.id_paciente,
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni,
                email: data.email,
                telefono: data.telefono,
                cuit: data.cuit || null,
                fecha_nacimiento: null,
                ciudad: data.ciudad || undefined,
                observaciones_generales: clinicalNotes,
                link_google_slides: docResult?.fichaUrl || null,
                origen_registro: 'Admisión Directa',
            };

            await syncPatientToSheet(sheetPayload);
            triggers.sheets = { ok: true, detail: 'Registro sincronizado en Google Sheets' };
        } catch (sheetErr) {
            console.error('Error syncing to Sheets:', sheetErr);
            triggers.sheets = { ok: false, detail: sheetErr instanceof Error ? sheetErr.message : String(sheetErr) };
        }

        try {
            const todoResult = await createFirstDiagnosisTodo({
                patientId: created.id_paciente,
                patientName: `${created.apellido || data.apellido}, ${created.nombre || data.nombre}`,
                reason: data.motivo_consulta,
                healthAlerts: data.health_alerts,
                driveLink,
                slidesLink: docResult?.fichaUrl,
            });
            triggers.todo = todoResult;
        } catch (todoErr) {
            console.error('Error creating first diagnosis todo:', todoErr);
            triggers.todo = { ok: false, detail: todoErr instanceof Error ? todoErr.message : String(todoErr) };
        }

        try {
            const isMerino = data.profesional?.includes('Merino') ?? false;
            const paymentLink = isMerino ? 'https://mpago.la/2rjmF2W' : 'https://mpago.la/2MJhrW6';
            const agendaLink = isMerino ? 'https://calendar.app.google/oc4VZPzsDkhwB3r58' : 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0dDbh9UiGp7dk-OBTfyppeCwNcooGMRJdRwt4GGLrYYRuRXhhOVQV6E-yvCkZRdkjqp5xrpjO4';
            const buttonText = isMerino ? 'Pagar Dr. Merino' : 'Pagar Staff';

            const logoUrl = "https://i.ibb.co/bJC2S6s/am-logo-horizontal-final.png";
            const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <div style="background: #000; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <img src="${logoUrl}" height="40" alt="AM Estética Dental">
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #1e293b;">¡Hola ${data.nombre}!</h2>
            <p style="color: #475569; line-height: 1.6;">Estamos felices de recibirte en AM Estética Dental. Para confirmar tu cita, por favor sigue estos pasos:</p>
            
            <div style="margin: 30px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border-left: 4px solid #2563eb;">
              <p style="margin: 0 0 10px 0;"><strong>1. Realiza el pago:</strong></p>
              <a href="${paymentLink}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">${buttonText}</a>
            </div>

            <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border-left: 4px solid #2563eb;">
              <p style="margin: 0 0 10px 0;"><strong>2. Reserva tu horario:</strong></p>
              <a href="${agendaLink}" style="display: inline-block; color: #2563eb; font-weight: bold; text-decoration: underline;">Ver disponibilidad en el calendario</a>
            </div>

            <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">Si tienes alguna duda, puedes responder a este email.</p>
          </div>
        </div>
      `;

            await sendEmail({
                to: data.email,
                subject: "Confirma tu consulta en AM Estética Dental",
                html: html
            });
        } catch (emailErr) {
            console.error('Error sending welcome email:', emailErr);
        }

        return {
            success: true,
            patientId: created.id_paciente,
            triggers,
            links: {
                drive: driveLink || null,
                slides: docResult?.fichaUrl || null,
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
        const patientUUID = data.id_paciente || undefined;

        const { data: upserted, error } = await supabase
            .from('pacientes')
            .upsert({
                id_paciente: patientUUID,
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni,
                email: data.email,
                telefono: data.telefono,
                observaciones_generales: data.motivo_consulta,
                referencia_origen: data.referencia_origen,
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
        const dni = normalizeDni(params.dni);
        const email = normalize(params.email);

        if (!dni && !email) {
            return { success: true, exists: false, patient: null as AdmissionIdentityMatch | null };
        }

        const filters: string[] = [];
        if (dni) filters.push(`documento.ilike.%${safeFilterValue(dni)}%`);
        if (email) filters.push(`email.eq.${safeFilterValue(email)}`);

        let query = supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento, email, telefono, cuit, ciudad, zona_barrio')
            .eq('is_deleted', false)
            .or(filters.join(','))
            .limit(6);

        if (params.excludePatientId) {
            query = query.neq('id_paciente', params.excludePatientId);
        }

        const { data, error } = await query;
        if (error) return { success: false, exists: false, patient: null, error: error.message };

        const exactMatch = (data || []).find((patient) => {
            const byDni = dni && normalizeDni(patient.documento) === dni;
            const byEmail = email && normalize(patient.email) === email;
            return Boolean(byDni || byEmail);
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
        const term = query.trim();
        if (term.length < 2) {
            return { success: true, patients: [] as AdmissionIdentityMatch[] };
        }

        const safe = safeFilterValue(term);
        const filter = `%${safe}%`;

        const { data, error } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento, email, telefono, cuit, ciudad, zona_barrio')
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
