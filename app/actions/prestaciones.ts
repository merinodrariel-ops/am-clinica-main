'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

async function validateProfesionalIds(admin: ReturnType<typeof getAdminClient>, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return { ok: false, error: 'Odontólogo no informado' };

    const { data, error } = await admin
        .from('personal')
        .select('id')
        .in('id', uniqueIds)
        .in('tipo', ['odontologo', 'profesional'])
        .eq('activo', true);

    if (error) {
        return { ok: false, error: error.message };
    }

    const validIds = new Set((data || []).map((p) => p.id));
    const invalid = uniqueIds.find((id) => !validIds.has(id));
    if (invalid) {
        return { ok: false, error: 'Solo se pueden registrar prestaciones para odontólogos activos' };
    }

    return { ok: true as const };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TarifarioItem {
    id: string;
    nombre: string;
    area_nombre: string;
    precio_base: number;
    moneda: 'ARS' | 'USD';
    terminos?: string;
}

export type PrestacionCatalogoItem = TarifarioItem;

export interface UpdateTarifarioItemInput {
    id: string;
    area_nombre?: string;
    nombre?: string;
    precio_base?: number;
    moneda?: 'ARS' | 'USD';
    terminos?: string;
}

export interface CreateTarifarioItemInput {
    area_nombre: string;
    nombre: string;
    precio_base: number;
    moneda?: 'ARS' | 'USD';
    terminos?: string;
}

export type UpdatePrestacionCatalogoItemInput = UpdateTarifarioItemInput;
export type CreatePrestacionCatalogoItemInput = CreateTarifarioItemInput;

export interface PrestacionRealizada {
    id: string;
    profesional_id: string;
    prestacion_nombre: string;
    fecha_realizacion: string;
    monto_honorarios: number;
    moneda_cobro: string;
    slides_url?: string;
    slides_validado?: boolean;
    paciente_nombre?: string;
    paciente_id?: string;
    tarifario_id?: string;
    notas?: string;
    estado_pago: string;
    created_at: string;
}

export interface RegistrarPrestacionInput {
    profesional_id: string;
    tarifario_id?: string;
    prestacion_nombre: string;
    monto_honorarios: number;
    moneda_cobro: 'ARS' | 'USD';
    fecha_realizacion: string;       // YYYY-MM-DD
    paciente_nombre?: string;
    paciente_id?: string;
    slides_url?: string;
    notas?: string;
}

export interface PrestacionesResumen {
    prestaciones: PrestacionRealizada[];
    total_ars: number;
    total_usd: number;
    validadas: number;
    pendientes: number;
}

// ─── Tarifario ────────────────────────────────────────────────────────────────

/**
 * Retorna el tarifario filtrado por las áreas asignadas al profesional.
 * Si no tiene áreas configuradas, devuelve todo el tarifario activo.
 */
export async function getTarifarioParaDoctor(personalId: string): Promise<{
    items: TarifarioItem[];
    areas: string[];
}> {
    const admin = getAdminClient();

    // Get doctor's assigned areas
    const { data: worker } = await admin
        .from('personal')
        .select('areas_asignadas, area')
        .eq('id', personalId)
        .single();

    const areasAsignadas: string[] = worker?.areas_asignadas?.length
        ? worker.areas_asignadas
        : worker?.area
            ? [worker.area]
            : [];

    let query = admin
        .from('prestaciones_lista')
        .select('id, nombre, area_nombre, precio_base, moneda, terminos')
        .eq('activo', true)
        .order('area_nombre')
        .order('nombre');

    // Filter by areas if assigned
    if (areasAsignadas.length > 0) {
        // Case-insensitive match via ilike for each area
        const areaFilters = areasAsignadas
            .map(a => `area_nombre.ilike.${a}`)
            .join(',');
        query = query.or(areaFilters);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching tarifario:', error);
        return { items: [], areas: areasAsignadas };
    }

    return {
        items: (data || []) as TarifarioItem[],
        areas: areasAsignadas,
    };
}

export async function getPrestacionesCatalogoParaDoctor(personalId: string): Promise<{
    items: PrestacionCatalogoItem[];
    areas: string[];
}> {
    return getTarifarioParaDoctor(personalId);
}

/** Tarifario completo para admin (todas las áreas) */
export async function getTarifarioCompleto(): Promise<TarifarioItem[]> {
    const admin = getAdminClient();
    const { data } = await admin
        .from('prestaciones_lista')
        .select('id, nombre, area_nombre, precio_base, moneda, terminos')
        .eq('activo', true)
        .order('area_nombre')
        .order('nombre');

    return (data || []) as TarifarioItem[];
}

export async function getPrestacionesCatalogoCompleto(): Promise<PrestacionCatalogoItem[]> {
    return getTarifarioCompleto();
}

export async function createTarifarioItem(input: CreateTarifarioItemInput): Promise<TarifarioItem> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['owner', 'admin'].includes(profile.role)) {
        throw new Error('No autorizado para crear prestaciones');
    }

    const areaNombre = input.area_nombre.trim();
    const nombre = input.nombre.trim();
    if (!areaNombre) {
        throw new Error('El area no puede estar vacia');
    }
    if (!nombre) {
        throw new Error('El nombre no puede estar vacio');
    }

    if (!Number.isFinite(input.precio_base) || input.precio_base < 0) {
        throw new Error('Precio invalido');
    }

    const admin = getAdminClient();
    const { data, error } = await admin
        .from('prestaciones_lista')
        .insert({
            area_nombre: areaNombre,
            nombre,
            precio_base: Math.round((input.precio_base + Number.EPSILON) * 100) / 100,
            moneda: input.moneda === 'USD' ? 'USD' : 'ARS',
            terminos: typeof input.terminos === 'string' ? input.terminos.trim() || null : null,
            activo: true,
        })
        .select('id, nombre, area_nombre, precio_base, moneda, terminos')
        .single();

    if (error || !data) {
        throw new Error(error?.message || 'No se pudo crear la prestacion');
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    revalidatePath('/admin/prestaciones');
    revalidatePath('/caja-admin/prestaciones');
    revalidatePath('/portal/prestaciones');

    return data as TarifarioItem;
}

export async function createPrestacionCatalogoItem(input: CreatePrestacionCatalogoItemInput): Promise<PrestacionCatalogoItem> {
    return createTarifarioItem(input);
}

export async function deactivateTarifarioItem(id: string): Promise<{ success: true }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['owner', 'admin'].includes(profile.role)) {
        throw new Error('No autorizado para desactivar prestaciones');
    }

    const itemId = id.trim();
    if (!itemId) {
        throw new Error('ID de prestacion invalido');
    }

    const admin = getAdminClient();
    const { error } = await admin
        .from('prestaciones_lista')
        .update({
            activo: false,
            updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

    if (error) {
        throw new Error(error.message || 'No se pudo desactivar la prestacion');
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    revalidatePath('/admin/prestaciones');
    revalidatePath('/caja-admin/prestaciones');
    revalidatePath('/portal/prestaciones');

    return { success: true };
}

export async function deactivatePrestacionCatalogoItem(id: string): Promise<{ success: true }> {
    return deactivateTarifarioItem(id);
}

export async function updateTarifarioItem(input: UpdateTarifarioItemInput): Promise<TarifarioItem> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['owner', 'admin'].includes(profile.role)) {
        throw new Error('No autorizado para editar tarifario');
    }

    const admin = getAdminClient();

    if (!input.id) {
        throw new Error('ID de prestación inválido');
    }

    const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (typeof input.nombre === 'string') {
        const nombre = input.nombre.trim();
        if (!nombre) throw new Error('El nombre no puede estar vacío');
        patch.nombre = nombre;
    }

    if (typeof input.area_nombre === 'string') {
        const areaNombre = input.area_nombre.trim();
        if (!areaNombre) throw new Error('El area no puede estar vacia');
        patch.area_nombre = areaNombre;
    }

    if (typeof input.precio_base === 'number') {
        if (!Number.isFinite(input.precio_base) || input.precio_base < 0) {
            throw new Error('Precio inválido');
        }
        patch.precio_base = Math.round((input.precio_base + Number.EPSILON) * 100) / 100;
    }

    if (input.moneda) {
        patch.moneda = input.moneda;
    }

    if (typeof input.terminos === 'string') {
        patch.terminos = input.terminos.trim() || null;
    }

    const { data, error } = await admin
        .from('prestaciones_lista')
        .update(patch)
        .eq('id', input.id)
        .select('id, nombre, area_nombre, precio_base, moneda, terminos')
        .single();

    if (error || !data) {
        throw new Error(error?.message || 'No se pudo actualizar el tarifario');
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    revalidatePath('/portal/prestaciones');

    return data as TarifarioItem;
}

export async function updatePrestacionCatalogoItem(input: UpdatePrestacionCatalogoItemInput): Promise<PrestacionCatalogoItem> {
    return updateTarifarioItem(input);
}

// ─── Registrar ────────────────────────────────────────────────────────────────

export async function registrarPrestacion(
    input: RegistrarPrestacionInput
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    const validation = await validateProfesionalIds(admin, [input.profesional_id]);
    if (!validation.ok) {
        return { success: false, error: validation.error };
    }

    const { error } = await admin
        .from('prestaciones_realizadas')
        .insert({
            profesional_id: input.profesional_id,
            tarifario_id: input.tarifario_id ?? null,
            prestacion_nombre: input.prestacion_nombre,
            paciente_nombre: input.paciente_nombre ?? '',
            paciente_id: input.paciente_id ?? null,
            fecha_realizacion: input.fecha_realizacion,
            valor_cobrado: input.monto_honorarios,
            monto_honorarios: input.monto_honorarios,
            moneda_cobro: input.moneda_cobro,
            slides_url: input.slides_url ?? null,
            slides_validado: Boolean(input.slides_url),
            notas: input.notas ?? null,
            estado_pago: 'pendiente',
        });

    if (error) return { success: false, error: error.message };

    revalidatePath('/portal/prestaciones');
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    return { success: true };
}

export async function registrarMultiplesPrestaciones(
    items: RegistrarPrestacionInput[]
): Promise<{ success: boolean; error?: string }> {
    if (!items || items.length === 0) return { success: true };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    const validation = await validateProfesionalIds(admin, items.map((item) => item.profesional_id));
    if (!validation.ok) {
        return { success: false, error: validation.error };
    }

    const insertData = items.map(item => ({
        profesional_id: item.profesional_id,
        tarifario_id: item.tarifario_id ?? null,
        prestacion_nombre: item.prestacion_nombre,
        paciente_nombre: item.paciente_nombre ?? '',
        paciente_id: item.paciente_id ?? null,
        fecha_realizacion: item.fecha_realizacion,
        valor_cobrado: item.monto_honorarios,
        monto_honorarios: item.monto_honorarios,
        moneda_cobro: item.moneda_cobro,
        slides_url: item.slides_url ?? null,
        slides_validado: Boolean(item.slides_url),
        notas: item.notas ?? null,
        estado_pago: 'pendiente',
    }));

    const { error } = await admin
        .from('prestaciones_realizadas')
        .insert(insertData);

    if (error) return { success: false, error: error.message };

    revalidatePath('/portal/prestaciones');
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    return { success: true };
}

export async function actualizarSlidesUrl(
    prestacionId: string,
    slidesUrl: string
): Promise<{ success: boolean; error?: string }> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('prestaciones_realizadas')
        .update({
            slides_url: slidesUrl,
            slides_validado: true,
        })
        .eq('id', prestacionId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/portal/prestaciones');
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    return { success: true };
}

export async function eliminarPrestacion(
    prestacionId: string
): Promise<{ success: boolean; error?: string }> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('prestaciones_realizadas')
        .delete()
        .eq('id', prestacionId)
        .eq('estado_pago', 'pendiente'); // solo se puede borrar si no está liquidado

    if (error) return { success: false, error: error.message };

    revalidatePath('/portal/prestaciones');
    return { success: true };
}

// ─── Consultas ────────────────────────────────────────────────────────────────

export async function getMisPrestaciones(
    personalId: string,
    mes?: string // 'YYYY-MM', defaults to current month
): Promise<PrestacionesResumen> {
    const admin = getAdminClient();

    const targetMes = mes || new Date().toISOString().slice(0, 7);
    const [year, month] = targetMes.split('-').map(Number);
    const startDate = `${targetMes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${targetMes}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await admin
        .from('prestaciones_realizadas')
        .select('*')
        .eq('profesional_id', personalId)
        .gte('fecha_realizacion', startDate)
        .lte('fecha_realizacion', endDate)
        .order('fecha_realizacion', { ascending: false });

    if (error) {
        console.error('Error fetching prestaciones:', error);
        return { prestaciones: [], total_ars: 0, total_usd: 0, validadas: 0, pendientes: 0 };
    }

    const prestaciones = (data || []) as PrestacionRealizada[];
    const total_ars = prestaciones
        .filter(p => p.moneda_cobro === 'ARS')
        .reduce((s, p) => s + Number(p.monto_honorarios || 0), 0);
    const total_usd = prestaciones
        .filter(p => p.moneda_cobro === 'USD')
        .reduce((s, p) => s + Number(p.monto_honorarios || 0), 0);
    const validadas = prestaciones.filter(p => p.slides_url).length;
    const pendientes = prestaciones.filter(p => !p.slides_url).length;

    return { prestaciones, total_ars, total_usd, validadas, pendientes };
}

/** Admin: todas las prestaciones del mes, opcionalmente filtradas por doctor */
export async function getPrestacionesAdmin(
    mes?: string,
    personalId?: string
): Promise<PrestacionRealizada[]> {
    const admin = getAdminClient();

    const targetMes = mes || new Date().toISOString().slice(0, 7);
    const [year, month] = targetMes.split('-').map(Number);
    const startDate = `${targetMes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${targetMes}-${String(lastDay).padStart(2, '0')}`;

    let query = admin
        .from('prestaciones_realizadas')
        .select('*')
        .gte('fecha_realizacion', startDate)
        .lte('fecha_realizacion', endDate)
        .order('fecha_realizacion', { ascending: false });

    if (personalId) {
        query = query.eq('profesional_id', personalId);
    }

    const { data } = await query;
    return (data || []) as PrestacionRealizada[];
}

// ─── HC del paciente ─────────────────────────────────────────────────────────

export interface PrestacionConProfesional extends PrestacionRealizada {
    profesional_nombre?: string;
    profesional_apellido?: string;
}

/** Todas las prestaciones de un paciente, con nombre del profesional */
export async function getPrestacionesByPaciente(
    pacienteId: string
): Promise<PrestacionConProfesional[]> {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('prestaciones_realizadas')
        .select('*, personal!profesional_id (nombre, apellido)')
        .eq('paciente_id', pacienteId)
        .order('fecha_realizacion', { ascending: false });

    if (error) {
        console.error('Error fetching prestaciones del paciente:', error);
        return [];
    }

    return (data || []).map((p: Record<string, unknown>) => ({
        ...(p as unknown as PrestacionRealizada),
        profesional_nombre: (p.personal as { nombre?: string } | null)?.nombre,
        profesional_apellido: (p.personal as { apellido?: string } | null)?.apellido,
    }));
}

// ─── Pacientes (search) ───────────────────────────────────────────────────────

export async function buscarPacientes(q: string): Promise<
    { id_paciente: string; nombre: string; apellido: string }[]
> {
    if (!q || q.length < 2) return [];
    const supabase = await createClient();
    const { data } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido')
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%`)
        .limit(8);

    return data || [];
}

/**
 * Retorna la lista de odontólogos activos para uso administrativo.
 */
export async function getProfesionales(): Promise<Array<{ id: string; nombre: string; apellido?: string; area?: string }>> {
    const admin = getAdminClient();
    const { data } = await admin
        .from('personal')
        .select('id, nombre, apellido, area')
        .in('tipo', ['odontologo', 'profesional'])
        .eq('activo', true)
        .order('nombre');
    return data || [];
}
