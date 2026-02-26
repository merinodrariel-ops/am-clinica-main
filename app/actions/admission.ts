'use server';

import { createClient } from '@supabase/supabase-js';
import { ensureStandardPatientFolders, createPatientDocuments } from '@/lib/google-drive';
import { syncPatientToSheet } from '@/lib/google-sheets';
import { sendEmail } from '@/lib/nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export type AdmissionData = {
    nombre: string;
    apellido: string;
    dni: string;
    email: string;
    telefono: string;
    profesional: string;
};

export async function submitAdmissionAction(data: AdmissionData) {
    try {
        console.log('Starting admission process for:', data.nombre, data.apellido);

        // 1. Insert into Supabase
        const { data: created, error: createError } = await supabase
            .from('pacientes')
            .insert({
                nombre: data.nombre,
                apellido: data.apellido,
                dni: data.dni,
                email: data.email,
                telefono: data.telefono,
                fecha_alta: new Date().toISOString(),
                is_deleted: false,
            })
            .select()
            .single();

        if (createError) throw new Error(`Error saving patient: ${createError.message}`);

        // 2. Create Google Drive hierarchy
        let driveLink = '';
        let docResult: any = null;
        try {
            const driveResult = await ensureStandardPatientFolders(data.apellido, data.nombre);
            if (driveResult.motherFolderId && driveResult.motherFolderUrl) {
                driveLink = driveResult.motherFolderUrl;

                // Create Slides Documents (Ficha & Presupuesto)
                docResult = await createPatientDocuments(driveResult.motherFolderId, {
                    nombre: data.nombre,
                    apellido: data.apellido,
                    dni: data.dni,
                    fecha: new Date().toLocaleDateString('es-AR'),
                });

                // Update patient with the links
                await supabase
                    .from('pacientes')
                    .update({
                        link_historia_clinica: driveLink,
                        link_google_slides: docResult?.fichaUrl || null
                    })
                    .eq('id_paciente', created.id_paciente);
            }
        } catch (driveErr) {
            console.error('Error creating Drive folders:', driveErr);
        }

        // 3. Sync to Google Sheets (Legacy Excel)
        try {
            await syncPatientToSheet({
                nombre: data.nombre,
                apellido: data.apellido,
                documento: data.dni,
                email: data.email,
                telefono: data.telefono,
                observaciones_generales: `Profesional: ${data.profesional}`,
                link_google_slides: docResult?.fichaUrl || null,
                origen_registro: 'Admisión Directa',
            } as any);
        } catch (sheetErr) {
            console.error('Error syncing to Sheets:', sheetErr);
        }

        // 4. Send Welcome Email with Payment Info
        try {
            const isMerino = data.profesional.includes('Merino');
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

        return { success: true, patientId: created.id_paciente };
    } catch (error) {
        console.error('Admission error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
