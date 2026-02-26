'use server';

import { createClient } from '@supabase/supabase-js';
import { Paciente } from '@/lib/patients';
import { syncPatientToSheet } from '@/lib/google-sheets';
import { sendWelcomeEmailAction } from '@/app/actions/email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must use Service Role for rls bypass if needed, or consistent server access
const supabase = createClient(supabaseUrl, supabaseKey);

export interface UpsertPatientResult {
    success: boolean;
    data?: Paciente;
    error?: string;
    action?: 'created' | 'updated';
    message?: string;
}

export async function upsertPatientAction(patientData: Partial<Paciente>): Promise<UpsertPatientResult> {
    try {
        console.log('Starting upsertPatientAction', patientData.email, patientData.documento);

        // 1. Check for duplicates
        let existingId: string | null = null;
        let existingData: Paciente | null = null;

        const { data: duplicates, error: searchError } = await supabase
            .from('pacientes')
            .select('*')
            .eq('is_deleted', false)
            .or(`documento.eq.${patientData.documento || 'nonexistent'},email.eq.${patientData.email || 'nonexistent'}`);

        if (searchError) throw new Error(searchError.message);

        // Refine duplicate check
        const normalization = (s: string | undefined | null) => s?.toString().trim().toLowerCase() || '';

        // Priority 1: DNI
        if (patientData.documento) {
            const byDni = duplicates?.find(p => normalization(p.documento) === normalization(patientData.documento));
            if (byDni) {
                existingId = byDni.id_paciente;
                existingData = byDni;
            }
        }

        // Priority 2: Email (if no DNI match yet)
        if (!existingId && patientData.email) {
            const byEmail = duplicates?.find(p => normalization(p.email) === normalization(patientData.email));
            if (byEmail) {
                existingId = byEmail.id_paciente;
                existingData = byEmail;
            }
        }

        // Priority 3: Name + Surname + Phone (need separate query if not covered by OR above)
        if (!existingId && !patientData.documento && !patientData.email) {
            const { data: nameDuplicates } = await supabase
                .from('pacientes')
                .select('*')
                .eq('is_deleted', false)
                .ilike('nombre', patientData.nombre || '')
                .ilike('apellido', patientData.apellido || '');

            if (nameDuplicates && nameDuplicates.length > 0) {
                const byPhone = nameDuplicates.find(p => normalization(p.telefono) === normalization(patientData.telefono));
                if (byPhone) {
                    existingId = byPhone.id_paciente;
                    existingData = byPhone;
                }
            }
        }

        if (existingId && existingData) {
            // UPDATE
            console.log('Duplicate found. Updating:', existingId);

            // Smart Merge Logic
            const updates: any = {};
            let hasChanges = false;

            // Fields to check
            const fields: (keyof Paciente)[] = [
                'nombre', 'apellido', 'documento', 'fecha_nacimiento',
                'email', 'telefono', 'ciudad', 'zona_barrio', 'direccion',
                'observaciones_generales', 'estado_paciente', 'origen_registro',
                'whatsapp_pais_code', 'whatsapp_numero', 'email_local', 'email_dominio'
            ];

            for (const key of fields) {
                const newValue = patientData[key];
                const oldValue = existingData[key];

                // Logic:
                // 1. If new value is empty, IGNORE (keep old value).
                // 2. If new value is NOT empty:
                //    - If old value was empty, UPDATE.
                //    - If old value was different, UPDATE (most recent wins).
                if (newValue !== undefined && newValue !== null && newValue !== '') {
                    if (newValue !== oldValue) {
                        updates[key] = newValue;
                        hasChanges = true;
                    }
                }
            }

            // Always update updated_at
            updates.updated_at = new Date().toISOString();

            if (hasChanges) {
                const { data: updated, error: updateError } = await supabase
                    .from('pacientes')
                    .update(updates)
                    .eq('id_paciente', existingId)
                    .select()
                    .single();

                if (updateError) throw new Error(updateError.message);

                // Audit Log (Update)
                await supabase.from('audit_log').insert({
                    modulo: 'Pacientes',
                    accion: 'UPDATE_SMART',
                    entidad_id: existingId,
                    entidad_tipo: 'paciente',
                    resumen_cambios: { updates },
                    fecha_hora: new Date().toISOString()
                });

                // Sync to Sheets
                await syncPatientToSheet(updated);

                return {
                    success: true,
                    data: updated,
                    action: 'updated',
                    message: `Paciente actualizado correctamente (se detectó duplicado y se unificaron datos).`
                };
            } else {
                // No changes needed, but sync to sheets just in case sheet is outdated
                await syncPatientToSheet(existingData);
                return {
                    success: true,
                    data: existingData,
                    action: 'updated',
                    message: 'Paciente ya existe con datos idénticos. Sincronizado.'
                };
            }

        } else {
            // CREATE
            console.log('No duplicate found. Creating new patient.');
            // Construct Helper fields if not present (though NuevoPacienteForm sends them)
            // ... Logic inferred from input. 
            // We just pass what we got.

            // Standardize some fields
            const newPatientData = {
                ...patientData,
                fecha_alta: new Date().toISOString(),
                is_deleted: false,
                welcome_email_sent: false
            };

            const { data: created, error: createError } = await supabase
                .from('pacientes')
                .insert(newPatientData)
                .select()
                .single();

            if (createError) throw new Error(createError.message);

            // NEW: Create Google Drive hierarchy for new patients
            try {
                const { ensureStandardPatientFolders } = await import('@/lib/google-drive');
                const driveResult = await ensureStandardPatientFolders(created.apellido, created.nombre);

                if (driveResult.motherFolderUrl) {
                    // Update patient with the link
                    await supabase
                        .from('pacientes')
                        .update({ link_historia_clinica: driveResult.motherFolderUrl })
                        .eq('id_paciente', created.id_paciente);

                    // Update the 'created' object for the return data
                    created.link_historia_clinica = driveResult.motherFolderUrl;
                }
            } catch (driveErr) {
                console.error('Error creating Drive folder for new patient:', driveErr);
                // We don't throw here to avoid failing patient creation due to Drive issues
            }

            // Audit Log (Create)
            await supabase.from('audit_log').insert({
                modulo: 'Pacientes',
                accion: 'CREATE_SMART',
                entidad_id: created.id_paciente,
                entidad_tipo: 'paciente',
                resumen_cambios: { created: newPatientData },
                fecha_hora: new Date().toISOString()
            });

            // Send Welcome Email
            if (patientData.consentimiento_comunicacion && created.email) {
                try {
                    const emailResult = await sendWelcomeEmailAction(
                        `${created.nombre} ${created.apellido}`,
                        created.email
                    );

                    // Log Email
                    await supabase.from('email_log').insert({
                        paciente_id: created.id_paciente,
                        tipo: 'Bienvenida',
                        estado: emailResult.success ? 'Enviado' : 'Fallido',
                        error: emailResult.error ? String(emailResult.error) : undefined,
                        fecha_hora: new Date().toISOString()
                    });

                    if (emailResult.success) {
                        await supabase
                            .from('pacientes')
                            .update({ welcome_email_sent: true })
                            .eq('id_paciente', created.id_paciente);
                    }

                } catch (e) {
                    console.error('Email send execution error', e);
                }
            }

            // Sync to Sheets
            await syncPatientToSheet(created);

            return {
                success: true,
                data: created,
                action: 'created',
                message: 'Paciente creado exitosamente y sincronizado.'
            };
        }

    } catch (error) {
        console.error('Error in upsertPatientAction:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido al procesar paciente.'
        };
    }
}
