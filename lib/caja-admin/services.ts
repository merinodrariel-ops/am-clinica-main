
import { createClient } from '@/utils/supabase/client';
import { getLocalISODate } from '@/lib/local-date';
import {
    Sucursal,
    CuentaFinanciera,
    CajaAdminMovimiento,
    MovimientoLinea,
    CajaAdminArqueo,
    Profesional,
    HonorarioItem,
    Prestacion,
    Personal,
    PersonalArea,
    RegistroHoras,
    AuditoriaHoras,
    LiquidacionMensual,
    ReporteSummary,
    DiaSinCierreAdmin,
    ResolucionData,
    CreatePersonalInput,
    type CajaAdminCategoria,
    MotivoObservado,
} from './types';

// ==========================================
// MÉTODOS DE CATEGORÍAS (NEW)
// ==========================================

export async function getCategorias(sucursalId: string): Promise<CajaAdminCategoria[]> {
    const { data, error } = await getSupabase()
        .from('caja_admin_categorias')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true });

    if (error) {
        console.error('Error fetching categorias:', error);
        return [];
    }
    return data || [];
}

export async function createCategoria(data: Partial<CajaAdminCategoria>) {
    const { error } = await getSupabase()
        .from('caja_admin_categorias')
        .insert([data]);
    if (error) throw error;
}

export async function updateCategoria(id: string, updates: Partial<CajaAdminCategoria>) {
    const { error } = await getSupabase()
        .from('caja_admin_categorias')
        .update(updates)
        .eq('id', id);
    if (error) throw error;
}

export async function deleteCategoria(id: string) {
    const { error } = await getSupabase()
        .from('caja_admin_categorias')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

const getSupabase = () => createClient();

function normalizeWhatsAppE164(value?: string | null): string | null {
    if (!value) return null;

    const raw = value.trim();
    if (!raw) return null;

    // Enforce explicit country code from inputs (e.g. +549...)
    if (!raw.startsWith('+')) return null;

    let digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('54')) {
        let rest = digits.slice(2).replace(/^0+/, '');

        if (!rest.startsWith('9')) {
            rest = `9${rest}`;
        }

        let local = rest.slice(1).replace(/^0+/, '');

        // Remove local mobile prefix "15" after area code (common AR input mistake).
        for (let areaLen = 2; areaLen <= 4; areaLen += 1) {
            if (local.length > areaLen + 5 && local.slice(areaLen, areaLen + 2) === '15') {
                local = `${local.slice(0, areaLen)}${local.slice(areaLen + 2)}`;
                break;
            }
        }

        digits = `549${local}`;
    }

    if (digits.length < 10 || digits.length > 15) {
        return null;
    }

    return `+${digits}`;
}

function mapPersonalCategoria(input: CreatePersonalInput, normalizedTipo: 'prestador' | 'odontologo'): string {
    if (normalizedTipo === 'odontologo') return 'odontologo';

    const area = (input.area || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    if (area.includes('laboratorio') || area === 'lab') return 'laboratorio';
    if (area.includes('asistente')) return 'asistente';
    if (area.includes('recepcion')) return 'reception';

    // Default for staff/cleaning/others
    return 'admin';
}


// =============================================
// Sucursales
// =============================================

export async function getSucursales(): Promise<Sucursal[]> {
    const { data, error } = await getSupabase()
        .from('sucursales')
        .select('*')
        .eq('activa', true)
        .order('nombre');

    if (error) {
        console.error('Error fetching sucursales:', error);
        return [];
    }
    return data || [];
}

// =============================================
// Cuentas Financieras
// =============================================

export async function getCuentas(sucursalId: string): Promise<CuentaFinanciera[]> {
    const { data, error } = await getSupabase()
        .from('cuentas_financieras')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .eq('activa', true)
        .order('orden');

    if (error) {
        console.error('Error fetching cuentas:', error);
        return [];
    }
    return data || [];
}

// =============================================
// Movimientos
// =============================================

export async function getMovimientos(options: {
    sucursalId: string;
    mes?: string; // YYYY-MM format
    tipo?: string;
    limit?: number;
}): Promise<CajaAdminMovimiento[]> {
    let query = getSupabase()
        .from('caja_admin_movimientos')
        .select('*, caja_admin_movimiento_lineas(*)')
        .eq('sucursal_id', options.sucursalId)
        .eq('is_deleted', false)
        .order('fecha_hora', { ascending: false });

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        // Calculate first day of next month for proper end range
        const [year, month] = options.mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query
            .gte('fecha_movimiento', startDate)
            .lt('fecha_movimiento', firstDayNextMonth);
    }

    if (options.tipo) {
        query = query.eq('tipo_movimiento', options.tipo);
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching movimientos:', error);
        return [];
    }
    return data || [];
}

export async function createMovimiento(
    movimiento: Partial<CajaAdminMovimiento>,
    lineas: MovimientoLinea[]
): Promise<{ data: CajaAdminMovimiento | null; error: Error | null }> {
    // 1. Enforce Cash Box Status
    const sucursalId = movimiento.sucursal_id;
    const fecha = movimiento.fecha_movimiento || getLocalISODate();

    if (sucursalId) {
        const apertura = await getAperturaAdminDelDia(sucursalId, fecha);
        if (!apertura || apertura.estado !== 'Abierto') {
            return {
                data: null,
                error: new Error('No se puede registrar movimientos: La caja administrativa no está abierta para esta fecha.')
            };
        }
    }

    // Calculate USD equivalent total
    const usdTotal = lineas.reduce((sum, l) => sum + (l.usd_equivalente || 0), 0);

    const { data: mov, error: movError } = await getSupabase()
        .from('caja_admin_movimientos')
        .insert({
            ...movimiento,
            fecha_movimiento: movimiento.fecha_movimiento || getLocalISODate(),
            usd_equivalente_total: usdTotal,
            estado: 'Registrado',
            created_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (movError) {
        return { data: null, error: new Error(movError.message) };
    }

    // Insert lines
    const lineasWithMovId = lineas.map((l: any) => ({
        cuenta_id: l.cuenta_id,
        importe: l.importe,
        moneda: l.moneda,
        usd_equivalente: l.usd_equivalente,
        admin_movimiento_id: mov.id,
    }));

    const { error: lineasError } = await getSupabase()
        .from('caja_admin_movimiento_lineas')
        .insert(lineasWithMovId);

    if (lineasError) {
        console.error('Error creating lineas:', lineasError);
        // Supabase REST error, we should throw it so the user sees the error instead of silently failing
        return { data: null, error: new Error(`Error insertando líneas: ${lineasError.message}`) };
    }

    return { data: mov, error: null };
}

export async function updateMovimientoAdmin(
    id: string,
    updates: Partial<CajaAdminMovimiento>
): Promise<{ success: boolean; error?: string }> {
    const { error } = await getSupabase()
        .from('caja_admin_movimientos')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function logMovimientoEdit(
    registroId: string,
    tabla: string,
    campo: string,
    valorAnterior: string | null,
    valorNuevo: string | null,
    motivo: string
) {
    try {
        // Get current user info
        const { data: { user } } = await getSupabase().auth.getUser();

        const insertData = {
            id_registro: registroId,
            tabla_origen: tabla,
            campo_modificado: campo,
            valor_anterior: valorAnterior,
            valor_nuevo: valorNuevo,
            usuario_editor: user?.id || null,
            usuario_email: user?.email || null,
            motivo_edicion: motivo
        };

        const { error } = await getSupabase()
            .from('historial_ediciones')
            .insert(insertData);

        if (error) {
            // If error is Foreign Key Violation (user exists in auth but not in profiles), retry without user_id
            if (error.code === '23503') {
                console.warn('Logging edit without linking to profile due to FK violation (missing profile). Email:', user?.email);
                await getSupabase()
                    .from('historial_ediciones')
                    .insert({
                        ...insertData,
                        usuario_editor: null
                    });
            } else {
                console.error('Error logging edit:', error);
            }
        }
    } catch (err) {
        console.error('Error in logMovimientoEdit:', err);
    }
}

export async function anularMovimiento(
    id: string,
    motivo: string,
    usuario: string
): Promise<{ success: boolean; error?: string }> {
    const { error } = await getSupabase()
        .from('caja_admin_movimientos')
        .update({
            estado: 'Anulado',
            motivo_anulacion: motivo,
            anulado_por: usuario,
            anulado_fecha_hora: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function deleteMovimiento(
    id: string,
    usuarioId: string,
    motivo: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error: logError } = await getSupabase()
            .from('historial_ediciones')
            .insert({
                id_registro: id,
                tabla_origen: 'caja_admin_movimientos',
                campo_modificado: 'REGISTRO_ELIMINADO',
                valor_anterior: 'ACTIVO',
                valor_nuevo: 'ELIMINADO',
                usuario_editor: usuarioId,
                motivo_edicion: motivo
            });

        if (logError) {
            console.error('Error logging deletion:', logError);
        }
    } catch (e) {
        console.error('Error in deletion audit:', e);
    }

    const { error } = await getSupabase()
        .from('caja_admin_movimientos')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function getUltimoCierreAdmin(sucursalId: string, fechaLimite?: string): Promise<CajaAdminArqueo | null> {
    let query = getSupabase()
        .from('caja_admin_arqueos')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .in('estado', ['Cerrado', 'cerrado'])
        .order('fecha', { ascending: false })
        .limit(1);

    if (fechaLimite) {
        query = query.lt('fecha', fechaLimite);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
        console.error('Error fetching ultimo cierre admin:', error);
        return null;
    }
    return data;
}

export async function getAperturaAdminDelDia(
    sucursalId: string,
    fecha?: string
): Promise<CajaAdminArqueo | null> {
    const targetDate = fecha || getLocalISODate();

    const { data, error } = await getSupabase()
        .from('caja_admin_arqueos')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .eq('fecha', targetDate)
        .in('estado', ['Abierto', 'abierto'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }

    return data || null;
}

export async function abrirCajaAdminDelDia(params: {
    sucursalId: string;
    fecha: string;
    usuario: string;
    tcBna?: number | null;
}): Promise<CajaAdminArqueo> {
    const { data: rpcData, error: rpcError } = await getSupabase().rpc('abrir_caja_admin', {
        p_sucursal_id: params.sucursalId,
        p_fecha: params.fecha,
        p_usuario: params.usuario,
        p_tc_bna: params.tcBna || null,
    });

    if (!rpcError && rpcData) {
        return rpcData as CajaAdminArqueo;
    }

    if (rpcError) {
        console.warn('abrir_caja_admin RPC unavailable, using fallback flow:', rpcError.message);
    }

    /* 
    Multiple sessions are allowed. 
    The RPC or the logic below will handle inheriting balances from the 
    absolute latest closure.
    */


    const aperturaExistente = await getAperturaAdminDelDia(params.sucursalId, params.fecha);
    if (aperturaExistente) {
        return aperturaExistente;
    }

    const ultimoCierre = await getUltimoCierreAdmin(params.sucursalId, params.fecha);
    const saldosIniciales = ultimoCierre?.saldos_finales || {};
    const saldoInicialUsdEq = Number(ultimoCierre?.saldo_final_usd_equivalente || 0);

    const { data, error } = await getSupabase()
        .from('caja_admin_arqueos')
        .insert({
            sucursal_id: params.sucursalId,
            fecha: params.fecha,
            usuario: params.usuario,
            hora_inicio: new Date().toISOString(),
            hora_cierre: null,
            saldos_iniciales: saldosIniciales,
            saldos_finales: saldosIniciales,
            saldo_final_usd_equivalente: saldoInicialUsdEq,
            tc_bna_venta_dia: params.tcBna || null,
            diferencia_usd: 0,
            observaciones: 'Apertura automatica',
            estado: 'Abierto',
            snapshot_datos: {
                apertura_automatica: true,
                origen: 'sistema'
            }
        })
        .select('*')
        .single();

    if (error) throw error;
    return data as CajaAdminArqueo;
}

// Deprecated or Aliased
export async function getArqueoAbierto(): Promise<CajaAdminArqueo | null> {
    // Return null as there are no "Open" arqueos anymore
    return null;
}

export async function cerrarCajaAdmin(params: {
    sucursalId: string;
    fecha: string;
    usuario: string;
    saldosFinales: Record<string, number>;
    saldoFinalUsdEq: number;
    diferenciaUsd: number;
    tcBna: number;
    observaciones?: string;
    snapshot: unknown;
    saldosIniciales?: Record<string, number>;
}): Promise<{ success: boolean; error?: string }> {
    const { error } = await getSupabase().rpc('cerrar_caja_admin', {
        p_sucursal_id: params.sucursalId,
        p_fecha: params.fecha,
        p_usuario: params.usuario,
        p_saldo_final_usd_eq: params.saldoFinalUsdEq,
        p_saldos_finales: params.saldosFinales,
        p_diferencia_usd: params.diferenciaUsd,
        p_tc_bna: params.tcBna,
        p_observaciones: params.observaciones,
        p_snapshot: params.snapshot,
        p_saldos_iniciales: params.saldosIniciales || null
    });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function abrirArqueo(): Promise<{ data: null; error: Error }> {
    return { data: null, error: new Error('Use abrirCajaAdminDelDia') };
}

export async function cerrarArqueo(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Use cerrarCajaAdmin' };
}

// =============================================
// Profesionales & Prestaciones
// =============================================

export async function getProfesionales(): Promise<Profesional[]> {
    const { data, error } = await getSupabase()
        .from('profesionales')
        .select('*')
        .eq('activo', true)
        .order('nombre');

    if (error) {
        console.error('Error fetching profesionales:', error);
        return [];
    }
    return data || [];
}

export async function getHonorariosItems(especialidad?: string): Promise<HonorarioItem[]> {
    let query = getSupabase()
        .from('honorarios_catalogo_items')
        .select('*, honorarios_catalogo_versiones!inner(*)')
        .eq('activo', true)
        .is('honorarios_catalogo_versiones.vigente_hasta', null);

    if (especialidad) {
        query = query.eq('honorarios_catalogo_versiones.especialidad', especialidad);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching honorarios:', error);
        return [];
    }
    return data || [];
}

export async function getPrestaciones(options: {
    profesionalId?: string;
    mes?: string;
    limit?: number;
}): Promise<Prestacion[]> {
    let query = getSupabase()
        .from('prestaciones')
        .select('*, profesionales(*)')
        .eq('is_deleted', false)
        .order('fecha', { ascending: false });

    if (options.profesionalId) {
        query = query.eq('profesional_id', options.profesionalId);
    }

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        const endDate = new Date(parseInt(options.mes.split('-')[0]), parseInt(options.mes.split('-')[1]), 0);
        query = query
            .gte('fecha', startDate)
            .lte('fecha', `${options.mes}-${endDate.getDate()}`);
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching prestaciones:', error);
        return [];
    }
    return data || [];
}

export async function createPrestacion(
    prestacion: Partial<Prestacion>
): Promise<{ data: Prestacion | null; error: Error | null }> {
    const { data, error } = await getSupabase()
        .from('prestaciones')
        .insert({
            ...prestacion,
            estado: 'Registrado',
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: new Error(error.message) };
    }
    return { data, error: null };
}

// =============================================
// Personal & Liquidaciones
// =============================================

export async function getPersonal(options?: {
    tipo?: 'prestador' | 'odontologo' | 'profesional';
    area?: string;
    includeInactive?: boolean;
}): Promise<Personal[]> {
    let query = getSupabase()
        .from('personal')
        .select('*')
        .order('tipo')
        .order('nombre');

    if (!options?.includeInactive) {
        query = query.eq('activo', true);
    }
    if (options?.tipo) {
        if (options.tipo === 'odontologo' || options.tipo === 'profesional') {
            query = query.in('tipo', ['odontologo', 'profesional']);
        } else {
            query = query.eq('tipo', options.tipo);
        }
    }
    if (options?.area) {
        query = query.eq('area', options.area);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching personal:', error);
        return [];
    }
    return data || [];
}

export async function getPersonalById(id: string): Promise<Personal | null> {
    const { data, error } = await getSupabase()
        .from('personal')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching personal by id:', error);
        return null;
    }
    return data;
}

export async function getPersonalAreas(options?: { includeInactive?: boolean }): Promise<PersonalArea[]> {
    let query = getSupabase()
        .from('personal_areas')
        .select('*')
        .order('orden');

    if (!options?.includeInactive) {
        query = query.eq('activo', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching personal areas:', error);
        return [];
    }
    return data || [];
}

export async function createPersonalArea(input: Partial<PersonalArea>): Promise<{ success: boolean; data?: PersonalArea; error?: string }> {
    const payload = {
        nombre: (input.nombre || '').trim(),
        descripcion: input.descripcion || null,
        tipo_personal: input.tipo_personal === 'profesional' ? 'odontologo' : (input.tipo_personal || 'prestador'),
        color: input.color || '#6366f1',
        icono: input.icono || 'User',
        activo: input.activo ?? true,
        orden: Number(input.orden || 0),
    };

    if (!payload.nombre) {
        return { success: false, error: 'Nombre obligatorio' };
    }

    const { data, error } = await getSupabase()
        .from('personal_areas')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, data: data as PersonalArea };
}

export async function updatePersonalArea(id: string, updates: Partial<PersonalArea>): Promise<{ success: boolean; error?: string }> {
    const nextUpdates = {
        ...updates,
        tipo_personal: updates.tipo_personal === 'profesional' ? 'odontologo' : updates.tipo_personal,
    };

    const { error } = await getSupabase()
        .from('personal_areas')
        .update(nextUpdates)
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}

export async function createPersonal(input: CreatePersonalInput): Promise<{ data: Personal | null; error: Error | null }> {
    const normalizedTipo = input.tipo === 'profesional' ? 'odontologo' : input.tipo;
    const normalizedWhatsapp = normalizeWhatsAppE164(input.whatsapp || null);
    const categoria = mapPersonalCategoria(input, normalizedTipo);

    if (input.whatsapp && !normalizedWhatsapp) {
        return { data: null, error: new Error('WhatsApp inválido. Debe incluir código país (ej: +549...) y sin 0/15.') };
    }

    const basePayload = {
        ...input,
        tipo: normalizedTipo,
        categoria,
        whatsapp: normalizedWhatsapp,
        valor_hora_ars: input.valor_hora_ars || 0,
        moneda_mensual: input.moneda_mensual || 'ARS',
        activo: input.activo ?? true,
        fecha_ingreso: input.fecha_ingreso || new Date().toISOString().split('T')[0],
    };

    let { data, error } = await getSupabase()
        .from('personal')
        .insert(basePayload)
        .select()
        .single();

    // Backward compatibility for environments where personal.rol still exists as NOT NULL.
    if (error && /null value in column "rol"|column "rol"/i.test(error.message || '')) {
        ({ data, error } = await getSupabase()
            .from('personal')
            .insert({
                ...basePayload,
                rol: input.rol || (normalizedTipo === 'odontologo' ? 'Odontólogo' : 'Prestador'),
            })
            .select()
            .single());
    }

    // Backward compatibility for environments where moneda_mensual column does not exist yet.
    if (error && /column "moneda_mensual"/i.test(error.message || '')) {
        const { moneda_mensual: _ignored, ...payloadWithoutMoneda } = basePayload as Record<string, unknown>;

        ({ data, error } = await getSupabase()
            .from('personal')
            .insert(payloadWithoutMoneda)
            .select()
            .single());
    }

    if (error) {
        return { data: null, error: new Error(error.message) };
    }
    return { data, error: null };
}

export async function updatePersonal(
    id: string,
    updates: Partial<Personal>
): Promise<{ success: boolean; error?: string }> {
    let normalizedWhatsapp: string | null | undefined;

    if (Object.prototype.hasOwnProperty.call(updates, 'whatsapp')) {
        if (typeof updates.whatsapp === 'string') {
            const trimmed = updates.whatsapp.trim();
            if (!trimmed) {
                normalizedWhatsapp = null;
            } else {
                normalizedWhatsapp = normalizeWhatsAppE164(trimmed);
                if (!normalizedWhatsapp) {
                    return { success: false, error: 'WhatsApp inválido. Debe incluir código país (ej: +549...) y sin 0/15.' };
                }
            }
        } else if (updates.whatsapp === null) {
            normalizedWhatsapp = null;
        }
    }

    const nextUpdates = {
        ...updates,
        tipo: updates.tipo === 'profesional' ? 'odontologo' : updates.tipo,
        ...(normalizedWhatsapp !== undefined ? { whatsapp: normalizedWhatsapp } : {}),
    };

    let { error } = await getSupabase()
        .from('personal')
        .update(nextUpdates)
        .eq('id', id);

    if (error && /column "moneda_mensual"/i.test(error.message || '') && Object.prototype.hasOwnProperty.call(nextUpdates, 'moneda_mensual')) {
        const { moneda_mensual: _ignored, ...fallbackUpdates } = nextUpdates as Record<string, unknown>;
        ({ error } = await getSupabase()
            .from('personal')
            .update(fallbackUpdates)
            .eq('id', id));
    }

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function togglePersonalActivo(id: string, activo: boolean): Promise<{ success: boolean; error?: string }> {
    return updatePersonal(id, { activo });
}

export async function uploadPersonalDocument(
    personalId: string,
    file: File,
    documentType: 'dni_frente' | 'dni_dorso' | 'foto' | 'poliza' | 'consentimiento'
): Promise<{ url: string | null; error: Error | null }> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${personalId}/${documentType}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await getSupabase().storage
        .from('personal-documents')
        .upload(fileName, file, { upsert: true });

    if (uploadError) {
        return { url: null, error: new Error(uploadError.message) };
    }

    const { data: urlData } = getSupabase().storage
        .from('personal-documents')
        .getPublicUrl(fileName);

    return { url: urlData.publicUrl, error: null };
}

export async function getRegistroHoras(options: {
    personalId?: string;
    mes?: string;
}): Promise<RegistroHoras[]> {
    let query = getSupabase()
        .from('registro_horas')
        .select('*')
        .order('fecha', { ascending: false });

    if (options.personalId) {
        query = query.eq('personal_id', options.personalId);
    }

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        const endDate = new Date(parseInt(options.mes.split('-')[0]), parseInt(options.mes.split('-')[1]), 0);
        query = query
            .gte('fecha', startDate)
            .lte('fecha', `${options.mes}-${endDate.getDate()}`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching registro horas:', error);
        return [];
    }
    return data || [];
}

export async function registrarHoras(
    personalId: string,
    fecha: string,
    horas: number,
    observaciones?: string
): Promise<{ success: boolean; error?: string }> {
    const { error } = await getSupabase()
        .from('registro_horas')
        .insert({
            personal_id: personalId,
            fecha,
            horas,
            observaciones,
        });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function getLiquidaciones(options: {
    personalId?: string;
    mes?: string;
}): Promise<LiquidacionMensual[]> {
    let query = getSupabase()
        .from('liquidaciones_mensuales')
        .select('*, personal(*)')
        .order('mes', { ascending: false });

    if (options.personalId) {
        query = query.eq('personal_id', options.personalId);
    }

    if (options.mes) {
        query = query.eq('mes', `${options.mes}-01`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching liquidaciones:', error);
        return [];
    }
    return data || [];
}

export async function generarLiquidacion(
    personalId: string,
    mes: string,
    tcBna?: number
): Promise<{ data: LiquidacionMensual | null; error: Error | null }> {
    const [year, month] = mes.split('-').map(Number);
    const startDate = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDateStr = `${mes}-${String(lastDay).padStart(2, '0')}`;
    const criticalThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Block liquidation if there are unresolved critical observed records.
    const { count: criticalCount, error: criticalErr } = await getSupabase()
        .from('registro_horas')
        .select('id', { count: 'exact', head: true })
        .eq('personal_id', personalId)
        .in('estado', ['Observado', 'observado'])
        .gte('fecha', startDate)
        .lte('fecha', endDateStr)
        .lt('created_at', criticalThreshold);

    if (criticalErr) {
        return { data: null, error: new Error(`Error validando observados críticos: ${criticalErr.message}`) };
    }

    if ((criticalCount || 0) > 0) {
        return {
            data: null,
            error: new Error(`No se puede liquidar: hay ${criticalCount} observado(s) crítico(s) sin resolver en ${mes}.`)
        };
    }

    // Get personal info
    const { data: personal } = await getSupabase()
        .from('personal')
        .select('*')
        .eq('id', personalId)
        .single();

    if (!personal) {
        return { data: null, error: new Error('Personal no encontrado') };
    }

    // Get total hours for the month
    const { data: horas } = await getSupabase()
        .from('registro_horas')
        .select('horas')
        .eq('personal_id', personalId)
        .gte('fecha', startDate)
        .lte('fecha', endDateStr);

    const totalHoras = horas?.reduce((sum: number, h: { horas: number }) => sum + h.horas, 0) || 0;
    const totalArs = totalHoras * personal.valor_hora_ars;
    const totalUsd = tcBna ? totalArs / tcBna : undefined;

    const { data, error } = await getSupabase()
        .from('liquidaciones_mensuales')
        .insert({
            personal_id: personalId,
            mes: startDate,
            total_horas: totalHoras,
            valor_hora_snapshot: personal.valor_hora_ars,
            total_ars: totalArs,
            tc_liquidacion: tcBna,
            total_usd: totalUsd,
            estado: 'Pendiente',
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: new Error(error.message) };
    }
    return { data, error: null };
}

// =============================================
// Reportes (Read-Only)
// =============================================

async function getSucursalById(id: string): Promise<Sucursal | null> {
    const { data } = await getSupabase()
        .from('sucursales')
        .select('*')
        .eq('id', id)
        .single();
    return data;
}

export async function getReporteMensual(
    sucursalId: string,
    mes: string
): Promise<ReporteSummary> {
    const sucursal = await getSucursalById(sucursalId);
    const startDate = `${mes}-01`;
    const endDate = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0);
    const endDateStr = `${mes}-${endDate.getDate()}`;

    let ingresosPacientesUsd = 0;
    let egresosUsd = 0;

    if (sucursal?.modo_caja === 'SEPARADA') {
        // BA: Read from caja_recepcion_movimientos
        const { data: ingresos } = await getSupabase()
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .gte('fecha_movimiento', startDate)
            .lte('fecha_movimiento', endDateStr)
            .neq('estado', 'Anulado');

        ingresosPacientesUsd = ingresos?.reduce((sum: number, i: { usd_equivalente: number }) => sum + (i.usd_equivalente || 0), 0) || 0;
    } else {
        // UY: Read from caja_admin_movimientos with INGRESO_PACIENTE
        const { data: ingresos } = await getSupabase()
            .from('caja_admin_movimientos')
            .select('usd_equivalente_total')
            .eq('sucursal_id', sucursalId)
            .eq('tipo_movimiento', 'INGRESO_PACIENTE')
            .gte('fecha_movimiento', startDate)
            .lte('fecha_movimiento', endDateStr)
            .neq('estado', 'Anulado');

        ingresosPacientesUsd = ingresos?.reduce((sum: number, i: { usd_equivalente_total: number }) => sum + (i.usd_equivalente_total || 0), 0) || 0;
    }

    // Egresos from caja_admin_movimientos
    const { data: egresos } = await getSupabase()
        .from('caja_admin_movimientos')
        .select('usd_equivalente_total')
        .eq('sucursal_id', sucursalId)
        .eq('tipo_movimiento', 'EGRESO')
        .gte('fecha_movimiento', startDate)
        .lte('fecha_movimiento', endDateStr)
        .neq('estado', 'Anulado');

    egresosUsd = egresos?.reduce((sum: number, e: { usd_equivalente_total: number }) => sum + (e.usd_equivalente_total || 0), 0) || 0;

    // Honorarios from prestaciones
    const { data: honorarios } = await getSupabase()
        .from('prestaciones')
        .select('usd_equivalente')
        .gte('fecha', startDate)
        .lte('fecha', endDateStr)
        .neq('estado', 'Anulado');

    const honorariosProfesionalesUsd = honorarios?.reduce((sum: number, h: { usd_equivalente: number }) => sum + (h.usd_equivalente || 0), 0) || 0;

    // Sueldos from liquidaciones_mensuales
    const { data: sueldos } = await getSupabase()
        .from('liquidaciones_mensuales')
        .select('total_usd')
        .eq('mes', startDate)
        .neq('estado', 'Anulado');

    const sueldosStaffUsd = sueldos?.reduce((sum: number, s: { total_usd: number }) => sum + (s.total_usd || 0), 0) || 0;

    // Calculate margins
    const margenBruto = ingresosPacientesUsd - honorariosProfesionalesUsd - sueldosStaffUsd - egresosUsd;
    const cashflowNeto = ingresosPacientesUsd - egresosUsd - sueldosStaffUsd;

    return {
        ingresosPacientesUsd,
        egresosUsd,
        honorariosProfesionalesUsd,
        sueldosStaffUsd,
        margenBruto,
        cashflowNeto,
    };
}

export async function getEgresosPorSubtipo(
    sucursalId: string,
    mes: string
): Promise<{ subtipo: string; total_usd: number }[]> {
    const startDate = `${mes}-01`;
    const endDate = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0);
    const endDateStr = `${mes}-${endDate.getDate()}`;

    const { data, error } = await getSupabase()
        .from('caja_admin_movimientos')
        .select('subtipo, usd_equivalente_total')
        .eq('sucursal_id', sucursalId)
        .eq('tipo_movimiento', 'EGRESO')
        .gte('fecha_movimiento', startDate)
        .lte('fecha_movimiento', endDateStr)
        .neq('estado', 'Anulado');

    if (error || !data) return [];

    // Group by subtipo
    const grouped = data.reduce((acc: Record<string, number>, item: { subtipo: string; usd_equivalente_total: number }) => {
        const key = item.subtipo || 'Sin categoría';
        acc[key] = (acc[key] || 0) + (item.usd_equivalente_total || 0);
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
        .map(([subtipo, total_usd]) => ({ subtipo, total_usd: Number(total_usd) }))
        .sort((a, b) => b.total_usd - a.total_usd)
        .slice(0, 10);
}

// =============================================
// Observados Resolution Functions
// =============================================

export async function getRegistrosObservados(options: {
    mes?: string;
    personal_id?: string;
    motivo?: MotivoObservado;
}): Promise<RegistroHoras[]> {
    let query = getSupabase()
        .from('registro_horas')
        .select('*, personal(*)')
        .eq('estado', 'Observado')
        .order('fecha', { ascending: false });

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        const [year, month] = options.mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query.gte('fecha', startDate).lt('fecha', firstDayNextMonth);
    }

    if (options.personal_id) {
        query = query.eq('personal_id', options.personal_id);
    }

    if (options.motivo) {
        query = query.eq('motivo_observado', options.motivo);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching observados:', error);
        return [];
    }
    return data || [];
}

export async function countObservadosPendientes(mes?: string): Promise<number> {
    let query = getSupabase()
        .from('registro_horas')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'Observado');

    if (mes) {
        const startDate = `${mes}-01`;
        const [year, month] = mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query.gte('fecha', startDate).lt('fecha', firstDayNextMonth);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
}

export async function getObservadosSlaSummary(mes?: string): Promise<{ total: number; warn: number; critical: number }> {
    let query = getSupabase()
        .from('registro_horas')
        .select('id, created_at, fecha')
        .in('estado', ['Observado', 'observado']);

    if (mes) {
        const startDate = `${mes}-01`;
        const [year, month] = mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query.gte('fecha', startDate).lt('fecha', firstDayNextMonth);
    }

    const { data, error } = await query;
    if (error || !data) {
        if (error) console.error('Error fetching observados SLA summary:', error.message, error.code, error.details);
        return { total: 0, warn: 0, critical: 0 };
    }

    const now = Date.now();
    const warnThreshold = now - 24 * 60 * 60 * 1000;
    const criticalThreshold = now - 48 * 60 * 60 * 1000;

    let warn = 0;
    let critical = 0;

    data.forEach((row: any) => {
        const parsed = new Date((row as { created_at?: string; fecha: string }).created_at || (row as { fecha: string }).fecha);
        const createdAtMs = Number.isNaN(parsed.getTime())
            ? new Date(`${(row as { fecha: string }).fecha}T00:00:00`).getTime()
            : parsed.getTime();

        if (createdAtMs <= criticalThreshold) {
            critical += 1;
            return;
        }

        if (createdAtMs <= warnThreshold) {
            warn += 1;
        }
    });

    return { total: data.length, warn, critical };
}

export async function getObservadosCriticalLeaders(
    mes?: string,
    limit = 3
): Promise<Array<{ personal_id: string; nombre: string; apellido: string; critical_count: number }>> {
    let query = getSupabase()
        .from('registro_horas')
        .select('personal_id, created_at, fecha, personal(nombre, apellido)')
        .in('estado', ['Observado', 'observado']);

    if (mes) {
        const startDate = `${mes}-01`;
        const [year, month] = mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query.gte('fecha', startDate).lt('fecha', firstDayNextMonth);
    }

    const { data, error } = await query;
    if (error || !data) {
        if (error) console.error('Error fetching observados critical leaders:', error);
        return [];
    }

    const criticalThreshold = Date.now() - 48 * 60 * 60 * 1000;
    const grouped = new Map<string, { personal_id: string; nombre: string; apellido: string; critical_count: number }>();

    data.forEach((row: any) => {
        const typed = row as {
            personal_id: string;
            created_at?: string;
            fecha: string;
            personal?: { nombre?: string; apellido?: string | null } | Array<{ nombre?: string; apellido?: string | null }>;
        };

        const parsed = new Date(typed.created_at || typed.fecha);
        const createdAtMs = Number.isNaN(parsed.getTime())
            ? new Date(`${typed.fecha}T00:00:00`).getTime()
            : parsed.getTime();

        if (createdAtMs > criticalThreshold) return;

        const person = Array.isArray(typed.personal) ? typed.personal[0] : typed.personal;
        const current = grouped.get(typed.personal_id);
        if (current) {
            current.critical_count += 1;
            return;
        }

        grouped.set(typed.personal_id, {
            personal_id: typed.personal_id,
            nombre: person?.nombre || 'Sin nombre',
            apellido: person?.apellido || '',
            critical_count: 1,
        });
    });

    return Array.from(grouped.values())
        .sort((a, b) => b.critical_count - a.critical_count)
        .slice(0, Math.max(1, limit));
}

export async function resolverRegistro(
    registroId: string,
    data: ResolucionData
): Promise<{ success: boolean; error?: string }> {
    // First get current record for audit
    const { data: current, error: fetchError } = await getSupabase()
        .from('registro_horas')
        .select('*')
        .eq('id', registroId)
        .single();

    if (fetchError || !current) {
        return { success: false, error: 'Registro no encontrado' };
    }

    // Calculate new hours if times provided
    let newHoras = current.horas;
    if (data.hora_ingreso && data.hora_egreso) {
        const [inH, inM] = data.hora_ingreso.split(':').map(Number);
        const [outH, outM] = data.hora_egreso.split(':').map(Number);
        const inMinutes = inH * 60 + inM;
        const outMinutes = outH * 60 + outM;
        newHoras = Math.max(0, (outMinutes - inMinutes) / 60);
    }

    // Update the record
    const { error: updateError } = await getSupabase()
        .from('registro_horas')
        .update({
            estado: 'approved',
            hora_ingreso: data.hora_ingreso || current.hora_ingreso,
            hora_egreso: data.hora_egreso || current.hora_egreso,
            horas: newHoras,
            nota_resolucion: data.nota_resolucion,
            metodo_verificacion: data.metodo_verificacion,
            evidencia_url: data.evidencia_url,
            resuelto_por: data.resuelto_por,
            resuelto_fecha_hora: new Date().toISOString(),
        })
        .eq('id', registroId);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    // Log audit entries for each changed field
    const auditEntries = [];

    if (data.hora_ingreso && data.hora_ingreso !== current.hora_ingreso) {
        auditEntries.push({
            registro_horas_id: registroId,
            usuario: data.resuelto_por,
            campo_modificado: 'hora_ingreso',
            valor_anterior: current.hora_ingreso || current.original_hora_ingreso || null,
            valor_nuevo: data.hora_ingreso,
            motivo: data.nota_resolucion,
            metodo_verificacion: data.metodo_verificacion,
            evidencia_url: data.evidencia_url,
        });
    }

    if (data.hora_egreso && data.hora_egreso !== current.hora_egreso) {
        auditEntries.push({
            registro_horas_id: registroId,
            usuario: data.resuelto_por,
            campo_modificado: 'hora_egreso',
            valor_anterior: current.hora_egreso || current.original_hora_egreso || null,
            valor_nuevo: data.hora_egreso,
            motivo: data.nota_resolucion,
            metodo_verificacion: data.metodo_verificacion,
            evidencia_url: data.evidencia_url,
        });
    }

    // Estado change audit
    auditEntries.push({
        registro_horas_id: registroId,
        usuario: data.resuelto_por,
        campo_modificado: 'estado',
        valor_anterior: current.estado,
        valor_nuevo: 'approved',
        motivo: data.nota_resolucion,
        metodo_verificacion: data.metodo_verificacion,
        evidencia_url: data.evidencia_url,
    });

    if (auditEntries.length > 0) {
        await getSupabase().from('auditoria_cambios_horas').insert(auditEntries);
    }

    return { success: true };
}

export async function anularRegistro(
    registroId: string,
    motivo: string,
    usuario: string
): Promise<{ success: boolean; error?: string }> {
    const { data: current, error: fetchError } = await getSupabase()
        .from('registro_horas')
        .select('estado')
        .eq('id', registroId)
        .single();

    if (fetchError || !current) {
        return { success: false, error: 'Registro no encontrado' };
    }

    const { error: updateError } = await getSupabase()
        .from('registro_horas')
        .update({
            estado: 'rejected',
            nota_resolucion: motivo,
            resuelto_por: usuario,
            resuelto_fecha_hora: new Date().toISOString(),
        })
        .eq('id', registroId);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    // Log audit
    await getSupabase().from('auditoria_cambios_horas').insert({
        registro_horas_id: registroId,
        usuario: usuario,
        campo_modificado: 'estado',
        valor_anterior: current.estado,
        valor_nuevo: 'rejected',
        motivo: motivo,
    });

    return { success: true };
}

export async function getAuditoriaRegistro(registroId: string): Promise<AuditoriaHoras[]> {
    const { data, error } = await getSupabase()
        .from('auditoria_cambios_horas')
        .select('*')
        .eq('registro_horas_id', registroId)
        .order('fecha_hora', { ascending: false });

    if (error) return [];
    return data || [];
}

// =============================================
// ADMIN: Alertas
// =============================================

export async function getDiasSinCierreAdmin(sucursalId: string): Promise<DiaSinCierreAdmin[]> {
    const { data, error } = await getSupabase().rpc('get_dias_sin_cierre_admin', {
        p_sucursal_id: sucursalId
    });
    if (error) {
        console.error('Error checking alerts admin:', error);
        return [];
    }
    return data || [];
}

export async function updateMovimientoAdminWithLines(
    id: string,
    updates: {
        fecha_movimiento?: string;
        descripcion?: string;
        nota?: string;
        registro_editado?: boolean;
        adjuntos?: string[];
    },
    lines: MovimientoLinea[],
    usdTotalOverride?: number
): Promise<{ success: boolean; error?: string }> {
    const normalizeLine = (line: MovimientoLinea) => {
        const importe = Number(line.importe || 0);
        const moneda = (line.moneda || '').toUpperCase();
        const usdEquivalenteRaw = line.usd_equivalente;
        const usdEquivalente = Number.isFinite(Number(usdEquivalenteRaw))
            ? Number(usdEquivalenteRaw)
            : (moneda === 'USD' ? importe : 0);

        return {
            ...line,
            cuenta_id: String(line.cuenta_id || ''),
            importe,
            moneda,
            usd_equivalente: Math.max(0, usdEquivalente),
        };
    };

    const { data: authData, error: authError } = await getSupabase().auth.getUser();
    if (authError || !authData.user) {
        return { success: false, error: 'Sesion invalida. Vuelve a iniciar sesion.' };
    }

    const metadataRole = authData.user.user_metadata?.categoria as string | undefined;
    const { data: profileData } = await getSupabase()
        .from('profiles')
        .select('categoria')
        .eq('id', authData.user.id)
        .maybeSingle();

    const effectiveRole = (profileData?.categoria || metadataRole || '').toLowerCase();
    if (effectiveRole !== 'owner' && effectiveRole !== 'admin') {
        return { success: false, error: 'Permiso denegado: solo Admin/Dueno puede editar montos de Caja Administracion.' };
    }

    // 1. Update main movement fields & total
    let usdTotal: number;

    const sanitizedLines = (lines || []).map(normalizeLine);

    if (sanitizedLines.length > 0) {
        usdTotal = sanitizedLines.reduce((sum, l) => sum + (l.usd_equivalente || 0), 0);
    } else if (typeof usdTotalOverride === 'number' && Number.isFinite(usdTotalOverride)) {
        usdTotal = Math.max(0, usdTotalOverride);
    } else {
        const { data: current, error: currentError } = await getSupabase()
            .from('caja_admin_movimientos')
            .select('usd_equivalente_total')
            .eq('id', id)
            .maybeSingle();

        if (currentError) {
            return { success: false, error: currentError.message };
        }

        usdTotal = Number(current?.usd_equivalente_total || 0);
    }

    const { error: mainError } = await getSupabase()
        .from('caja_admin_movimientos')
        .update({
            ...updates,
            usd_equivalente_total: usdTotal,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (mainError) return { success: false, error: mainError.message };

    // 2. Handle Lines (without hard delete)
    if (sanitizedLines.length === 0) {
        return { success: true };
    }

    const { data: currentLineRows, error: currentLinesError } = await getSupabase()
        .from('caja_admin_movimiento_lineas')
        .select('id')
        .eq('admin_movimiento_id', id);

    if (currentLinesError) {
        return { success: false, error: `Error leyendo lineas actuales: ${currentLinesError.message}` };
    }

    const existingLines = sanitizedLines.filter((line: any) => Boolean(line.id));
    const newLines = sanitizedLines.filter((line: any) => !line.id);

    const incomingLineIds = new Set(
        existingLines
            .map((line) => line.id)
            .filter((lineId): lineId is string => typeof lineId === 'string' && lineId.length > 0)
    );

    const linesToDelete = (currentLineRows || [])
        .map((row: any) => row.id)
        .filter((rowId: any): rowId is string => typeof rowId === 'string' && !incomingLineIds.has(rowId));

    if (linesToDelete.length > 0) {
        const { error: deleteLinesError } = await getSupabase()
            .from('caja_admin_movimiento_lineas')
            .delete()
            .in('id', linesToDelete)
            .eq('admin_movimiento_id', id);

        if (deleteLinesError) {
            return { success: false, error: `Error eliminando lineas removidas: ${deleteLinesError.message}` };
        }
    }

    const applyFullReplace = async () => {
        const rpcPayload = sanitizedLines.map((line) => ({
            cuenta_id: line.cuenta_id,
            importe: line.importe,
            moneda: line.moneda,
            usd_equivalente: line.usd_equivalente,
        }));

        const { error: rpcError } = await getSupabase().rpc('upsert_caja_admin_movimiento_lineas', {
            p_movimiento_id: id,
            p_lineas: rpcPayload,
        });

        if (!rpcError) {
            return { success: true };
        }

        console.warn('RPC upsert fallback unavailable, trying direct delete/insert:', rpcError.message);

        const { error: hardDeleteError } = await getSupabase()
            .from('caja_admin_movimiento_lineas')
            .delete()
            .eq('admin_movimiento_id', id);

        if (hardDeleteError) {
            return { success: false, error: `Error reemplazando lineas (delete): ${hardDeleteError.message}` };
        }

        const linesToInsert = sanitizedLines.map((line) => ({
            admin_movimiento_id: id,
            cuenta_id: line.cuenta_id,
            importe: line.importe,
            moneda: line.moneda,
            usd_equivalente: line.usd_equivalente,
        }));

        const { error: hardInsertError } = await getSupabase()
            .from('caja_admin_movimiento_lineas')
            .insert(linesToInsert);

        if (hardInsertError) {
            return { success: false, error: `Error reemplazando lineas (insert): ${hardInsertError.message}` };
        }

        return { success: true };
    };

    try {
        for (const line of existingLines) {
            const { error: updateLineError } = await getSupabase()
                .from('caja_admin_movimiento_lineas')
                .update({
                    cuenta_id: line.cuenta_id,
                    importe: line.importe,
                    moneda: line.moneda,
                    usd_equivalente: line.usd_equivalente,
                })
                .eq('id', line.id as string)
                .eq('admin_movimiento_id', id);

            if (updateLineError) {
                console.warn('Line update failed, fallback to full replace:', updateLineError.message);
                return await applyFullReplace();
            }
        }

        if (newLines.length > 0) {
            const linesToInsert = newLines.map((line) => ({
                admin_movimiento_id: id,
                cuenta_id: line.cuenta_id,
                importe: line.importe,
                moneda: line.moneda,
                usd_equivalente: line.usd_equivalente,
            }));

            const { error: insertError } = await getSupabase()
                .from('caja_admin_movimiento_lineas')
                .insert(linesToInsert);

            if (insertError) {
                console.warn('Line insert failed, fallback to full replace:', insertError.message);
                return await applyFullReplace();
            }
        }
    } catch (error) {
        console.warn('Line update flow failed, fallback to full replace:', error);
        return await applyFullReplace();
    }

    return { success: true };
}

export async function getGlobalAdminCashBalance(): Promise<{ ars: number, usd: number }> {
    const { data: sucursales, error: sError } = await getSupabase()
        .from('sucursales')
        .select('*')
        .eq('activa', true);

    if (sError) return { ars: 0, usd: 0 };

    let totalArs = 0;
    let totalUsd = 0;

    for (const sucursal of sucursales || []) {
        try {
            // Get accounts to identify currency
            const cuentas = await getCuentas(sucursal.id);
            const efectivoCuentas = cuentas.filter((c: any) => c.tipo_cuenta === 'EFECTIVO');

            if (efectivoCuentas.length === 0) continue;

            const closure = await getUltimoCierreAdmin(sucursal.id);
            const saldos = closure?.saldos_finales || {};

            // Initial balance from closure
            efectivoCuentas.forEach((c: any) => {
                const val = saldos[c.id] || 0;
                if (c.moneda === 'ARS') totalArs += val;
                if (c.moneda === 'USD') totalUsd += val;
            });

            // Add pending movements (cierre_id is null)
            const { data: pendingMovs } = await getSupabase()
                .from('caja_admin_movimientos')
                .select(`
                    tipo_movimiento,
                    caja_admin_movimiento_lineas (
                        cuenta_id,
                        importe
                    )
                `)
                .eq('sucursal_id', sucursal.id)
                .is('cierre_id', null)
                .neq('estado', 'Anulado')
                .eq('is_deleted', false);

            if (pendingMovs) {
                pendingMovs.forEach((m: any) => {
                    const tipo = m.tipo_movimiento;
                    let multiplier = 0;
                    if (tipo.startsWith('INGRESO') || tipo === 'APORTE_CAPITAL') multiplier = 1;
                    else if (tipo === 'EGRESO' || tipo === 'RETIRO') multiplier = -1;
                    else if (['CAMBIO_MONEDA', 'TRANSFERENCIA', 'AJUSTE_CAJA'].includes(tipo)) {
                        multiplier = 1; // Signed
                    }

                    if (multiplier !== 0) {
                        m.caja_admin_movimiento_lineas.forEach((l: { cuenta_id: string; importe?: number | null }) => {
                            const cuenta = efectivoCuentas.find((ec: any) => ec.id === l.cuenta_id);
                            if (cuenta) {
                                if (cuenta.moneda === 'ARS') totalArs += Number(l.importe || 0) * multiplier;
                                if (cuenta.moneda === 'USD') totalUsd += Number(l.importe || 0) * multiplier;
                            }
                        });
                    }
                });
            }
        } catch (e) {
            console.error(`Error calculating balance for sucursal ${sucursal.id}`, e);
        }
    }

    return { ars: totalArs, usd: totalUsd };
}

// ===================== BALANCE HELPERS =====================

export async function getCurrentBalanceAdmin(sucursalId: string): Promise<{
    status: 'Abierto' | 'Cerrado';
    lastCloseDate: string | null;
    saldoArs: number;
    saldoUsd: number;
    gastosTotalesUsd: number;
    giroArs: number;
    giroUsd: number;
    saldosPorCuenta: Record<string, number>;
}> {
    const today = getLocalISODate();
    const ultimo = await getUltimoCierreAdmin(sucursalId);

    // Get Cash Accounts
    const cuentas = await getCuentas(sucursalId);
    const efectivas = cuentas.filter((c: any) => c.tipo_cuenta === 'EFECTIVO');
    const idsArs = new Set(efectivas.filter((c: any) => c.moneda === 'ARS').map((c: any) => c.id));
    const idsUsd = new Set(efectivas.filter((c: any) => c.moneda === 'USD').map((c: any) => c.id));

    // Initialize balances per account
    const saldosPorCuenta: Record<string, number> = {};
    efectivas.forEach((c: any) => {
        saldosPorCuenta[c.id] = 0;
    });

    // Check if closed today — but only early-return if no active reopening exists
    if (ultimo && ultimo.fecha === today) {
        const aperturaActiva = await getAperturaAdminDelDia(sucursalId, today);
        if (!aperturaActiva) {
            // Truly closed for today — show physical count from closure
            let ars = 0;
            let usd = 0;
            Object.entries(ultimo.saldos_finales).forEach(([cuentaId, monto]) => {
                if (saldosPorCuenta.hasOwnProperty(cuentaId)) {
                    saldosPorCuenta[cuentaId] = monto;
                    if (idsArs.has(cuentaId)) ars += monto;
                    if (idsUsd.has(cuentaId)) usd += monto;
                }
            });
            return {
                status: 'Cerrado',
                lastCloseDate: ultimo.fecha,
                saldoArs: ars,
                saldoUsd: usd,
                gastosTotalesUsd: 0,
                giroArs: 0,
                giroUsd: 0,
                saldosPorCuenta
            };
        }
    }

    // 1. Initial from Last Closure
    if (ultimo) {
        Object.entries(ultimo.saldos_finales).forEach(([cuentaId, monto]) => {
            if (saldosPorCuenta.hasOwnProperty(cuentaId)) {
                saldosPorCuenta[cuentaId] = monto;
            }
        });
    }

    // 2. Add Movements
    // Fetch movements where cierre_id IS NULL (pending closure)
    const { data: movs } = await getSupabase()
        .from('caja_admin_movimientos')
        .select(`
            tipo_movimiento,
            usd_equivalente_total,
            subtipo,
            caja_admin_movimiento_lineas (
                cuenta_id,
                importe,
                moneda,
                usd_equivalente
            )
        `)
        .eq('sucursal_id', sucursalId)
        .is('cierre_id', null)
        .neq('estado', 'Anulado')
        .eq('is_deleted', false);

    let gastosTotalesUsd = 0;

    if (movs) {
        movs.forEach((m: {
            tipo_movimiento: string;
            usd_equivalente_total: number | null;
            subtipo: string | null;
            caja_admin_movimiento_lineas: MovimientoLinea[];
        }) => {
            const tipo = m.tipo_movimiento;

            // ── GIRO ACTIVO SPECIAL HANDLING ───────────────────────────
            // Rule: No operation on ARS/USD/GASTOS. Giro balance calculated separately (all-time).
            if (tipo === 'GIRO_ACTIVO') {
                return; // EXCLUSION TOTAL: skip cash calculation
            }

            // ── STANDARD MOVEMENTS ─────────────────────────────────────
            let multiplier = 0;
            if (tipo.startsWith('INGRESO') || tipo === 'APORTE_CAPITAL') multiplier = 1;
            else if (tipo === 'EGRESO' || tipo === 'RETIRO') multiplier = -1;
            else if (['CAMBIO_MONEDA', 'TRANSFERENCIA', 'AJUSTE_CAJA'].includes(tipo)) {
                multiplier = 1; // Signed amount
            }

            // Track total gastos in USD (excludes GIRO_ACTIVO due to return above)
            if (tipo === 'EGRESO' && m.usd_equivalente_total) {
                gastosTotalesUsd += Number(m.usd_equivalente_total);
            }

            if (multiplier === 0) return;

            // Update per-account cash balances (efectivo accounts only)
            const lineas = m.caja_admin_movimiento_lineas;
            if (lineas) {
                lineas.forEach((l: MovimientoLinea) => {
                    if (saldosPorCuenta.hasOwnProperty(l.cuenta_id)) {
                        // REGRE DE ORO: No Conversion. Only update with the line currency amount.
                        saldosPorCuenta[l.cuenta_id] += Number(l.importe || 0) * multiplier;
                    }
                });
            }
        });
    }

    // Calculate totals for summary cards
    let totalArs = 0;
    let totalUsd = 0;
    Object.entries(saldosPorCuenta).forEach(([id, monto]) => {
        if (idsArs.has(id)) totalArs += monto;
        if (idsUsd.has(id)) totalUsd += monto;
    });

    // ── GIRO ACTIVO: cumulative all-time balance (using usd_equivalente_total) ──
    // Everything normalized to USD to avoid currency mismatch between debt and payment.
    // Debt: GIRO_ACTIVO tipo movements (acumula deuda, no impacta efectivo)
    // Payment: EGRESO con subtipo containing 'giro' (paga la deuda con efectivo físico)
    const { data: allGiroDeuda, error: giroDeudaError } = await getSupabase()
        .from('caja_admin_movimientos')
        .select('usd_equivalente_total')
        .eq('sucursal_id', sucursalId)
        .eq('tipo_movimiento', 'GIRO_ACTIVO')
        .neq('estado', 'Anulado')
        .eq('is_deleted', false);

    if (giroDeudaError) {
        console.error('[getCurrentBalanceAdmin] Error fetching giro deuda:', giroDeudaError);
    }

    // EGRESO con subtipo que contiene 'giro' = pago de la deuda (sale efectivo físico USD)
    const { data: allGiroPagos, error: giroPagosError } = await getSupabase()
        .from('caja_admin_movimientos')
        .select('usd_equivalente_total')
        .eq('sucursal_id', sucursalId)
        .eq('tipo_movimiento', 'EGRESO')
        .ilike('subtipo', '%giro%')
        .neq('estado', 'Anulado')
        .eq('is_deleted', false);

    if (giroPagosError) {
        console.error('[getCurrentBalanceAdmin] Error fetching giro pagos:', giroPagosError);
    }

    let giroUsdTotal = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allGiroDeuda?.forEach((m: any) => {
        giroUsdTotal += Number(m.usd_equivalente_total || 0);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allGiroPagos?.forEach((m: any) => {
        giroUsdTotal -= Number(m.usd_equivalente_total || 0);
    });

    return {
        status: 'Abierto',
        lastCloseDate: ultimo?.fecha || null,
        saldoArs: totalArs,
        saldoUsd: totalUsd,
        gastosTotalesUsd,
        giroArs: 0,
        giroUsd: Math.max(0, giroUsdTotal),
        saldosPorCuenta
    };
}

export async function getArqueosForMonth(sucursalId: string, mes: string): Promise<CajaAdminArqueo[]> {
    const startDate = `${mes}-01`;
    const [year, month] = mes.split('-').map(Number);
    const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];

    const { data, error } = await getSupabase()
        .from('caja_admin_arqueos')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .gte('fecha', startDate)
        .lt('fecha', firstDayNextMonth)
        .order('fecha', { ascending: false });

    if (error) return [];
    return data || [];
}
