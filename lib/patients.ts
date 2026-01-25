import { supabase } from './supabase';

// =============================================
// Types
// =============================================

export interface Paciente {
    id_paciente: string;
    id_sede?: number;
    nombre: string;
    apellido: string;
    documento?: string | null;
    fecha_nacimiento?: string | null;
    email?: string | null;
    telefono?: string | null;
    fecha_alta?: string | null;
    etiquetas?: string[];
    link_historia_clinica?: string | null;
    link_google_slides?: string | null;
    presupuesto_total?: number | null;
    // New fields
    whatsapp_pais_code?: string;
    whatsapp_numero?: string;
    email_local?: string;
    email_dominio?: string;
    ciudad?: string;
    zona_barrio?: string;
    direccion?: string;
    observaciones_generales?: string;
    estado_paciente?: string;
    origen_registro?: string;
    consentimiento_comunicacion?: boolean;
    is_deleted?: boolean;
    welcome_email_sent?: boolean; // tracks if welcome email was sent
}

export interface HistoriaClinica {
    id: string;
    paciente_id: string;
    fecha: string;
    profesional: string;
    motivo_consulta?: string;
    diagnostico?: string;
    tratamiento_realizado?: string;
    materiales?: string;
    observaciones_clinicas?: string;
    proximo_control?: string;
    adjuntos?: string[];
}

export interface PlanTratamiento {
    id: string;
    paciente_id: string;
    fecha_creacion: string;
    profesional?: string;
    descripcion?: string;
    items?: object[];
    total_usd: number;
    senal_usd: number;
    saldo_usd: number;
    financiado: boolean;
    plazo_meses: number;
    interes_mensual_pct: number;
    cuota_estimada_usd: number;
    estado_plan: string;
    fecha_aceptacion?: string;
    observaciones?: string;
}

// =============================================
// CRUD Operations
// =============================================

export async function getPacientes(options?: {
    search?: string;
    estado?: string;
    ciudad?: string;
    limit?: number;
}): Promise<Paciente[]> {
    let query = supabase
        .from('pacientes')
        .select('*')
        .eq('is_deleted', false)
        .order('apellido', { ascending: true });

    if (options?.search) {
        const searchTerm = `%${options.search}%`;
        query = query.or(`apellido.ilike.${searchTerm},nombre.ilike.${searchTerm},email.ilike.${searchTerm},documento.ilike.${searchTerm},telefono.ilike.${searchTerm}`);
    }

    if (options?.estado) {
        query = query.eq('estado_paciente', options.estado);
    }

    if (options?.ciudad) {
        query = query.eq('ciudad', options.ciudad);
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching pacientes:', error);
        return [];
    }

    return data || [];
}

export async function getPacienteById(id: string): Promise<Paciente | null> {
    const { data, error } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id_paciente', id)
        .single();

    if (error) {
        console.error('Error fetching paciente:', error);
        return null;
    }

    return data;
}

export async function createPaciente(paciente: Partial<Paciente>): Promise<{ data: Paciente | null; error: Error | null }> {
    // Construct WhatsApp E164 format
    const whatsappE164 = paciente.whatsapp_numero
        ? `${paciente.whatsapp_pais_code || '+54'}${paciente.whatsapp_numero.replace(/\D/g, '')}`
        : null;

    // Construct email if parts provided
    const emailCompleto = paciente.email_local && paciente.email_dominio
        ? `${paciente.email_local}@${paciente.email_dominio}`
        : paciente.email;

    const { data, error } = await supabase
        .from('pacientes')
        .insert({
            ...paciente,
            email: emailCompleto,
            telefono: whatsappE164 || paciente.telefono,
            fecha_alta: new Date().toISOString(),
            estado_paciente: paciente.estado_paciente || 'Activo',
            origen_registro: paciente.origen_registro || 'Recepción',
            consentimiento_comunicacion: paciente.consentimiento_comunicacion ?? true,
            is_deleted: false,
            welcome_email_sent: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating paciente:', error);
        return { data: null, error: new Error(error.message) };
    }

    // Log to audit
    await logAudit({
        modulo: 'Pacientes',
        accion: 'CREATE',
        entidad_id: data.id_paciente,
        entidad_tipo: 'paciente',
        resumen_cambios: { created: paciente },
    });

    // Send Welcome Email if not already sent
    if (data.email && !data.welcome_email_sent) {
        import('./email').then(async ({ sendWelcomeEmail }) => {
            const result = await sendWelcomeEmail(data.nombre, data.email!, data.whatsapp_numero);
            await logEmail(
                data.id_paciente,
                'WELCOME',
                result?.success ? 'SENT' : 'FAILED',
                result?.error ? String(result.error) : undefined
            );
            // Update flag after attempt
            await supabase
                .from('pacientes')
                .update({ welcome_email_sent: true })
                .eq('id_paciente', data.id_paciente);
        });
    }

    return { data, error: null };
}

export async function updatePaciente(
    id: string,
    updates: Partial<Paciente>,
    motivo?: string
): Promise<{ data: Paciente | null; error: Error | null }> {
    // Get current data for audit
    const { data: current } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id_paciente', id)
        .single();

    const { data, error } = await supabase
        .from('pacientes')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id_paciente', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating paciente:', error);
        return { data: null, error: new Error(error.message) };
    }

    // Log to audit
    await logAudit({
        modulo: 'Pacientes',
        accion: 'UPDATE',
        entidad_id: id,
        entidad_tipo: 'paciente',
        resumen_cambios: { before: current, after: updates },
        motivo,
    });

    return { data, error: null };
}

export async function softDeletePaciente(
    id: string,
    motivo: string,
    usuario?: string
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('pacientes')
        .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: usuario,
            delete_reason: motivo,
        })
        .eq('id_paciente', id);

    if (error) {
        return { success: false, error: error.message };
    }

    // Log to audit
    await logAudit({
        modulo: 'Pacientes',
        accion: 'DELETE_SOFT',
        entidad_id: id,
        entidad_tipo: 'paciente',
        motivo,
        usuario,
    });

    return { success: true };
}

// =============================================
// Historia Clínica
// =============================================

export async function getHistoriaClinica(pacienteId: string): Promise<HistoriaClinica[]> {
    const { data, error } = await supabase
        .from('historia_clinica')
        .select('*')
        .eq('paciente_id', pacienteId)
        .eq('is_deleted', false)
        .order('fecha', { ascending: false });

    if (error) {
        console.error('Error fetching historia clinica:', error);
        return [];
    }

    return data || [];
}

export async function createHistoriaEntry(entry: Partial<HistoriaClinica>): Promise<{ data: HistoriaClinica | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('historia_clinica')
        .insert({
            ...entry,
            fecha: entry.fecha || new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
}

// =============================================
// Planes de Tratamiento
// =============================================

export async function getPlanesTratamiento(pacienteId: string): Promise<PlanTratamiento[]> {
    const { data, error } = await supabase
        .from('planes_tratamiento')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha_creacion', { ascending: false });

    if (error) {
        console.error('Error fetching planes:', error);
        return [];
    }

    return data || [];
}

export async function createPlanTratamiento(plan: Partial<PlanTratamiento>): Promise<{ data: PlanTratamiento | null; error: Error | null }> {
    // Calculate senal and saldo
    const total = plan.total_usd || 0;
    const senal = plan.senal_usd || total * 0.5;
    const saldo = total - senal;

    // Calculate cuota if financiado
    let cuotaEstimada = 0;
    if (plan.financiado && plan.plazo_meses && plan.plazo_meses > 0) {
        const interes = (plan.interes_mensual_pct || 1) / 100;
        cuotaEstimada = (saldo * (1 + interes * plan.plazo_meses)) / plan.plazo_meses;
    }

    const { data, error } = await supabase
        .from('planes_tratamiento')
        .insert({
            ...plan,
            senal_usd: senal,
            saldo_usd: saldo,
            cuota_estimada_usd: Math.round(cuotaEstimada * 100) / 100,
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
}

// =============================================
// Audit Log
// =============================================

interface AuditEntry {
    usuario?: string;
    modulo: string;
    accion: string;
    entidad_id?: string;
    entidad_tipo?: string;
    resumen_cambios?: object;
    motivo?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
    try {
        await supabase
            .from('audit_log')
            .insert({
                ...entry,
                fecha_hora: new Date().toISOString(),
            });
    } catch (error) {
        console.error('Error logging audit:', error);
    }
}

// =============================================
// Email Log
// =============================================

export async function logEmail(
    pacienteId: string,
    tipo: string,
    estado: string,
    error?: string
): Promise<void> {
    try {
        await supabase
            .from('email_log')
            .insert({
                paciente_id: pacienteId,
                tipo,
                estado,
                error,
                fecha_hora: new Date().toISOString(),
            });
    } catch (err) {
        console.error('Error logging email:', err);
    }
}

// =============================================
// Helpers
// =============================================

export function calculateAge(fechaNacimiento: string | null | undefined): number | null {
    if (!fechaNacimiento) return null;
    const birth = new Date(fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

export function formatWhatsAppLink(e164: string | null | undefined): string {
    if (!e164) return '#';
    const number = e164.replace(/\D/g, '');
    return `https://wa.me/${number}`;
}

export function formatMailtoLink(email: string | null | undefined, subject?: string): string {
    if (!email) return '#';
    return `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}
