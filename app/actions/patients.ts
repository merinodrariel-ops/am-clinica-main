'use server';

import { createClient } from '@/utils/supabase/server';
import { Paciente, softDeletePaciente, updatePaciente } from '@/lib/patients';

import { syncPatientToSheet } from '@/lib/google-sheets';
import { sendWelcomeEmailAction } from '@/app/actions/email';

export interface UpsertPatientResult {
    success: boolean;
    data?: Paciente;
    error?: string;
    action?: 'created' | 'updated';
    message?: string;
}

export interface ListPatientsFilters {
    search?: string;
    estado?: string;
    ciudad?: string;
    limit?: number;
    offset?: number;
}

export async function listPatientsAction(filters: ListPatientsFilters = {}) {
    try {
        const supabase = await createClient();

        let query = supabase
            .from('pacientes')
            .select('*')
            .eq('is_deleted', false)
            .order('fecha_alta', { ascending: false });

        if (filters.search) {
            const term = `%${filters.search}%`;
            query = query.or(`apellido.ilike.${term},nombre.ilike.${term},email.ilike.${term},documento.ilike.${term},whatsapp.ilike.${term}`);
        }

        if (filters.estado) {
            query = query.eq('estado_paciente', filters.estado);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        if (filters.offset) {
            query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
        }

        const { data, error } = await query;
        if (error) throw error;

        return { success: true, data: data as Paciente[] };
    } catch (error) {
        console.error('Error listing patients:', error);
        return { success: false, error: 'No se pudieron cargar los pacientes' };
    }
}

export async function getPatientsCountAction(filters: ListPatientsFilters = {}) {
    try {
        const supabase = await createClient();

        let query = supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', false);

        if (filters.search) {
            const term = `%${filters.search}%`;
            query = query.or(`apellido.ilike.${term},nombre.ilike.${term},email.ilike.${term},documento.ilike.${term},whatsapp.ilike.${term}`);
        }

        if (filters.estado) {
            query = query.eq('estado_paciente', filters.estado);
        }

        const { count, error } = await query;
        if (error) throw error;

        return { success: true, count: count || 0 };
    } catch (error) {
        console.error('Error counting patients:', error);
        return { success: false, count: 0 };
    }
}

export async function upsertPatientAction(patientData: Partial<Paciente>): Promise<UpsertPatientResult> {
    try {
        const supabase = await createClient();
        console.log('Starting upsertPatientAction', patientData.email, patientData.documento);

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: 'Sesión no autorizada. Por favor, inicia sesión.' };
        }

        const { data: profile } = await supabase.from('profiles').select('categoria').eq('id', user.id).maybeSingle();
        const role = profile?.categoria || '';
        const allowedRoles = ['admin', 'owner', 'reception', 'asistente', 'dr', 'developer'];

        if (!allowedRoles.includes(role.toLowerCase())) {
            return { success: false, error: 'No tienes permisos para gestionar pacientes.' };
        }

        // 1. Check for duplicates
        let existingId: string | null = null;
        let existingData: Paciente | null = null;

        const { data: duplicates, error: searchError } = await supabase
            .from('pacientes')
            .select('*')
            .eq('is_deleted', false)
            .or(`documento.eq.${patientData.documento || 'nonexistent'},email.eq.${patientData.email || 'nonexistent'}`);

        if (searchError) throw new Error(searchError.message);

        const normalization = (s: string | undefined | null) => s?.toString().trim().toLowerCase() || '';

        if (patientData.documento) {
            const byDni = duplicates?.find(p => normalization(p.documento) === normalization(patientData.documento));
            if (byDni) {
                existingId = byDni.id_paciente;
                existingData = byDni as Paciente;
            }
        }

        if (!existingId && patientData.email) {
            const byEmail = duplicates?.find(p => normalization(p.email) === normalization(patientData.email));
            if (byEmail) {
                existingId = byEmail.id_paciente;
                existingData = byEmail as Paciente;
            }
        }

        if (existingId && existingData) {
            const updates: Partial<Paciente> & { updated_at?: string } = {};
            let hasChanges = false;
            const fields: (keyof Paciente)[] = [
                'nombre', 'apellido', 'documento', 'fecha_nacimiento',
                'email', 'whatsapp', 'cuit', 'ciudad', 'zona_barrio', 'direccion',
                'observaciones_generales', 'estado_paciente', 'origen_registro',
                'whatsapp_pais_code', 'whatsapp_numero', 'email_local', 'email_dominio'
            ];

            for (const key of fields) {
                const newValue = patientData[key];
                const oldValue = existingData[key];
                if (newValue !== undefined && newValue !== null && newValue !== '') {
                    if (newValue !== oldValue) {
                        (updates as any)[key] = newValue;
                        hasChanges = true;
                    }
                }
            }

            updates.updated_at = new Date().toISOString();

            if (hasChanges) {
                const { data: updated, error: updateError } = await supabase
                    .from('pacientes')
                    .update(updates)
                    .eq('id_paciente', existingId)
                    .select()
                    .single();

                if (updateError) throw new Error(updateError.message);

                await syncPatientToSheet(updated);

                return {
                    success: true,
                    data: updated as Paciente,
                    action: 'updated',
                    message: `Paciente actualizado correctamente.`
                };
            } else {
                return {
                    success: true,
                    data: existingData,
                    action: 'updated',
                    message: 'Paciente ya existe con datos idénticos.'
                };
            }
        } else {
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

            try {
                const { ensureStandardPatientFolders } = await import('@/lib/google-drive');
                const driveResult = await ensureStandardPatientFolders(
                    created.apellido,
                    created.nombre,
                    created.link_historia_clinica || undefined
                );

                if (driveResult.motherFolderUrl) {
                    await supabase
                        .from('pacientes')
                        .update({ link_historia_clinica: driveResult.motherFolderUrl })
                        .eq('id_paciente', created.id_paciente);
                    created.link_historia_clinica = driveResult.motherFolderUrl;
                }
            } catch (driveErr) {
                console.error('Error Drive:', driveErr);
            }

            if (patientData.consentimiento_comunicacion && created.email) {
                try {
                    const emailResult = await sendWelcomeEmailAction(
                        `${created.nombre} ${created.apellido}`,
                        created.email
                    );
                    if (emailResult.success) {
                        await supabase
                            .from('pacientes')
                            .update({ welcome_email_sent: true })
                            .eq('id_paciente', created.id_paciente);
                    }
                } catch (e) {
                    console.error('Email error:', e);
                }
            }

            await syncPatientToSheet(created);

            return {
                success: true,
                data: created as Paciente,
                action: 'created',
                message: 'Paciente creado exitosamente.'
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

export async function softDeletePatientAction(id: string, motivo: string, usuario?: string) {
    try {
        const supabase = await createClient();
        return await softDeletePaciente(supabase, id, motivo, usuario);
    } catch (error) {
        console.error('Error in softDeletePatientAction:', error);
        return { success: false, error: 'Error al eliminar el paciente' };
    }
}

export async function updatePatientAction(id: string, updates: Partial<Paciente>, motivo?: string) {
    try {
        const supabase = await createClient();
        return await updatePaciente(supabase, id, updates, motivo);
    } catch (error) {
        console.error('Error in updatePatientAction:', error);
        return { data: null, error: error instanceof Error ? error : new Error('Error al actualizar el paciente') };
    }
}

export async function createHistoriaClinicaEntry(entry: {
    paciente_id: string;
    fecha: string;
    profesional: string;
    tratamiento_realizado: string;
    motivo_consulta?: string;
    observaciones_clinicas?: string;
}): Promise<{ data?: { id: string; fecha: string; profesional: string; tratamiento_realizado: string }; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const { data, error } = await supabase
            .from('historia_clinica')
            .insert({
                paciente_id: entry.paciente_id,
                fecha: entry.fecha,
                profesional: entry.profesional,
                tratamiento_realizado: entry.tratamiento_realizado,
                ...(entry.motivo_consulta ? { motivo_consulta: entry.motivo_consulta } : {}),
                ...(entry.observaciones_clinicas ? { observaciones_clinicas: entry.observaciones_clinicas } : {}),
            })
            .select('id, fecha, profesional, tratamiento_realizado')
            .single();

        if (error) return { error: error.message };
        return { data: data as { id: string; fecha: string; profesional: string; tratamiento_realizado: string } };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
