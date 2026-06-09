'use server';

import { createClient } from '@/utils/supabase/server';
import { Paciente, softDeletePaciente, updatePaciente } from '@/lib/patients';
import { buildFreeTextHistoriaEntry } from '@/lib/clinical-history';

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
    onlyWithPhotos?: boolean;
}

function normalizePatientText(value: string | null | undefined): string {
    return (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function sanitizeDocumento(value: unknown): string | undefined {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return undefined;

    const normalized = normalizePatientText(raw).replace(/[\s._-]+/g, '');
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

    if (placeholders.has(normalized) || /^0+$/.test(normalized)) return undefined;

    return raw;
}

function namesLookLikeSamePatient(existing: Paciente, incoming: Partial<Paciente>): boolean {
    const existingNombre = normalizePatientText(existing.nombre);
    const existingApellido = normalizePatientText(existing.apellido);
    const incomingNombre = normalizePatientText(incoming.nombre);
    const incomingApellido = normalizePatientText(incoming.apellido);

    if (!incomingNombre || !incomingApellido) return false;
    return existingNombre === incomingNombre && existingApellido === incomingApellido;
}

function patientDisplayName(patient: Pick<Paciente, 'nombre' | 'apellido'>): string {
    return `${patient.nombre || ''} ${patient.apellido || ''}`.trim() || 'otro paciente';
}

function getSearchTokens(search?: string): string[] {
    return normalizePatientText(search)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function escapeSupabaseSearchTerm(term: string): string {
    return term.replace(/[%_,]/g, '\\$&');
}

function buildSearchOrClause(tokens: string[]): string {
    const terms = Array.from(new Set([tokens.join(' '), ...tokens])).filter(Boolean);
    return terms
        .flatMap((rawTerm) => {
            const term = `%${escapeSupabaseSearchTerm(rawTerm)}%`;
            return [
                `apellido.ilike.${term}`,
                `nombre.ilike.${term}`,
                `email.ilike.${term}`,
                `documento.ilike.${term}`,
                `whatsapp.ilike.${term}`,
            ];
        })
        .join(',');
}

function patientMatchesSearch(patient: Paciente, tokens: string[]): boolean {
    if (!tokens.length) return true;

    const haystack = normalizePatientText([
        patient.apellido,
        patient.nombre,
        `${patient.apellido || ''} ${patient.nombre || ''}`,
        `${patient.nombre || ''} ${patient.apellido || ''}`,
        patient.email,
        patient.documento,
        patient.whatsapp,
    ].filter(Boolean).join(' '));

    return tokens.every((token) => haystack.includes(token));
}

export async function listPatientsAction(filters: ListPatientsFilters = {}) {
    try {
        const supabase = await createClient();
        const searchTokens = getSearchTokens(filters.search);

        let selectFields = '*';
        if (filters.onlyWithPhotos) {
            selectFields = '*, patient_treatments!inner(metadata)';
        }

        let query = supabase
            .from('pacientes')
            .select(selectFields)
            .eq('is_deleted', false)
            .order('fecha_alta', { ascending: false });

        if (filters.onlyWithPhotos) {
            query = query.not('patient_treatments.metadata->>drive_folder_id', 'is', null);
        }

        if (searchTokens.length) {
            query = query.or(buildSearchOrClause(searchTokens));
        }

        if (filters.estado) {
            query = query.eq('estado_paciente', filters.estado);
        }

        if (filters.limit && searchTokens.length <= 1) {
            query = query.limit(filters.limit);
        }

        if (filters.offset && searchTokens.length <= 1) {
            query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
        }

        const { data, error } = await query;
        if (error) throw error;

        let patients = (data as unknown as Paciente[]) || [];
        if (searchTokens.length > 1) {
            const offset = filters.offset || 0;
            const limit = filters.limit || patients.length;
            patients = patients
                .filter((patient) => patientMatchesSearch(patient, searchTokens))
                .slice(offset, offset + limit);
        }

        if (!patients.length) {
            return { success: true, data: patients };
        }

        const patientIds = patients.map((p) => p.id_paciente).filter(Boolean);
        const { data: patientFiles, error: filesError } = await supabase
            .from('patient_files')
            .select('patient_id, thumbnail_url, file_url, created_at')
            .in('patient_id', patientIds)
            .eq('file_type', 'photo_before')
            .order('created_at', { ascending: false });

        if (filesError) {
            console.error('Error loading patient profile photos:', filesError);
            return { success: true, data: patients };
        }

        const photoByPatientId = new Map<string, string>();
        for (const file of patientFiles || []) {
            const patientId = typeof file.patient_id === 'string' ? file.patient_id : null;
            if (!patientId || photoByPatientId.has(patientId)) continue;

            const photoUrl = typeof file.thumbnail_url === 'string' && file.thumbnail_url.trim().length > 0
                ? file.thumbnail_url
                : (typeof file.file_url === 'string' ? file.file_url : null);

            if (photoUrl) {
                photoByPatientId.set(patientId, photoUrl);
            }
        }

        const enriched = patients.map((patient) => ({
            ...patient,
            profile_photo_url: patient.profile_photo_url || photoByPatientId.get(patient.id_paciente) || null,
        }));

        return { success: true, data: enriched };
    } catch (error) {
        console.error('Error listing patients:', error);
        return { success: false, error: 'No se pudieron cargar los pacientes' };
    }
}

export async function getPatientsCountAction(filters: ListPatientsFilters = {}) {
    try {
        const supabase = await createClient();
        const searchTokens = getSearchTokens(filters.search);

        // If searchTokens.length > 1, we must fetch in memory to perform the AND match.
        // We select the minimal search fields to keep it as light as possible.
        if (searchTokens.length > 1) {
            let selectStr = 'id_paciente, nombre, apellido, email, documento, whatsapp';
            if (filters.onlyWithPhotos) {
                selectStr += ', patient_treatments!inner(metadata)';
            }
            let dataQuery = supabase
                .from('pacientes')
                .select(selectStr)
                .eq('is_deleted', false);

            if (filters.onlyWithPhotos) {
                dataQuery = dataQuery.not('patient_treatments.metadata->>drive_folder_id', 'is', null);
            }
            dataQuery = dataQuery.or(buildSearchOrClause(searchTokens));

            if (filters.estado) {
                dataQuery = dataQuery.eq('estado_paciente', filters.estado);
            }

            const { data, error } = await dataQuery;
            if (error) throw error;

            const patients = (data as unknown as Paciente[]) || [];
            const filtered = patients.filter((patient) => patientMatchesSearch(patient, searchTokens));
            return { success: true, count: filtered.length };
        }

        // For 0 or 1 search tokens, do a 100% database-side count query (head: true)
        let query;
        if (filters.onlyWithPhotos) {
            query = supabase
                .from('pacientes')
                .select('id_paciente, patient_treatments!inner(metadata)', { count: 'exact', head: true })
                .not('patient_treatments.metadata->>drive_folder_id', 'is', null);
        } else {
            query = supabase
                .from('pacientes')
                .select('id_paciente', { count: 'exact', head: true });
        }

        query = query.eq('is_deleted', false);

        if (searchTokens.length) {
            query = query.or(buildSearchOrClause(searchTokens));
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
        const cleanedPatientData: Partial<Paciente> = {
            ...patientData,
            documento: sanitizeDocumento(patientData.documento),
            email: typeof patientData.email === 'string' && patientData.email.trim()
                ? patientData.email.trim().toLowerCase()
                : undefined,
        };
        console.log('Starting upsertPatientAction', cleanedPatientData.email, cleanedPatientData.documento);

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

        const duplicateFilters: string[] = [];
        if (cleanedPatientData.documento) {
            duplicateFilters.push(`documento.eq.${cleanedPatientData.documento}`);
        } else if (cleanedPatientData.email) {
            duplicateFilters.push(`email.eq.${cleanedPatientData.email}`);
        }

        let duplicates: Paciente[] = [];
        if (duplicateFilters.length > 0) {
            const { data, error: searchError } = await supabase
                .from('pacientes')
                .select('*')
                .eq('is_deleted', false)
                .or(duplicateFilters.join(','));

            if (searchError) throw new Error(searchError.message);
            duplicates = (data || []) as Paciente[];
        }

        const normalization = (s: string | undefined | null) => s?.toString().trim().toLowerCase() || '';

        if (cleanedPatientData.documento) {
            const byDni = duplicates?.find(p => normalization(p.documento) === normalization(cleanedPatientData.documento));
            if (byDni) {
                if (!namesLookLikeSamePatient(byDni, cleanedPatientData)) {
                    return {
                        success: false,
                        error: `Ese DNI ya está asociado a ${patientDisplayName(byDni)}. Revisá el documento o editá esa ficha si corresponde.`,
                    };
                }
                existingId = byDni.id_paciente;
                existingData = byDni as Paciente;
            }
        }

        if (!existingId && !cleanedPatientData.documento && cleanedPatientData.email) {
            const byEmail = duplicates?.find(p => normalization(p.email) === normalization(cleanedPatientData.email));
            if (byEmail) {
                if (!namesLookLikeSamePatient(byEmail, cleanedPatientData)) {
                    return {
                        success: false,
                        error: 'Ese email ya está asociado a otra ficha. Para una ficha provisoria dejá el email vacío hasta confirmar los datos reales.',
                    };
                }
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

            const mutableUpdates = updates as Record<string, unknown>;
            for (const key of fields) {
                const newValue = cleanedPatientData[key];
                const oldValue = existingData[key];
                if (newValue !== undefined && newValue !== null && newValue !== '') {
                    if (newValue !== oldValue) {
                        mutableUpdates[key] = newValue;
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
                ...cleanedPatientData,
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

            if (cleanedPatientData.consentimiento_comunicacion && created.email) {
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
    tratamiento_realizado?: string;
    historia_texto?: string;
    motivo_consulta?: string;
    observaciones_clinicas?: string;
    proximo_control?: string;
}): Promise<{ data?: { id: string; fecha: string; profesional: string; tratamiento_realizado: string; observaciones_clinicas?: string | null; proximo_control?: string | null }; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const freeTextEntry = buildFreeTextHistoriaEntry({
            text: entry.historia_texto ?? entry.observaciones_clinicas ?? entry.tratamiento_realizado ?? '',
        });

        const { data, error } = await supabase
            .from('historia_clinica')
            .insert({
                paciente_id: entry.paciente_id,
                fecha: entry.fecha,
                profesional: entry.profesional,
                tratamiento_realizado: entry.tratamiento_realizado?.trim() || freeTextEntry.tratamiento_realizado,
                ...(entry.motivo_consulta ? { motivo_consulta: entry.motivo_consulta } : {}),
                observaciones_clinicas: entry.observaciones_clinicas?.trim() || freeTextEntry.observaciones_clinicas,
                ...(entry.proximo_control ? { proximo_control: entry.proximo_control } : {}),
            })
            .select('id, fecha, profesional, tratamiento_realizado, observaciones_clinicas, proximo_control')
            .single();

        if (error) return { error: error.message };
        return { data: data as { id: string; fecha: string; profesional: string; tratamiento_realizado: string; observaciones_clinicas?: string | null; proximo_control?: string | null } };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
