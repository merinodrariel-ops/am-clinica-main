'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { calculateAdjustedEarnings } from '@/lib/payroll-rules';

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegistroHoras {
    id: string;
    personal_id: string;
    fecha: string;
    horas: number;
    hora_ingreso: string | null;
    hora_egreso: string | null;
    salida_dia_siguiente: boolean | null;
    estado: string;
    observaciones: string | null;
    created_at: string;
    // joins
    personal?: { nombre: string; apellido: string | null };
    correcciones_count?: number;
}

export interface CorreccionHoras {
    id: string;
    registro_id: string;
    editado_por: string;
    motivo: string;
    campo: string;
    valor_anterior: string | null;
    valor_nuevo: string;
    created_at: string;
    editor?: { full_name: string };
}

export interface EditarRegistroInput {
    registroId: string;
    motivo: string;
    cambios: {
        horas?: number;
        hora_ingreso?: string;
        hora_egreso?: string;
        salida_dia_siguiente?: boolean;
        fecha?: string;
    };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getRegistrosHorasMes(
    mes: string, // 'YYYY-MM'
    personalId?: string
): Promise<RegistroHoras[]> {
    const admin = getAdminClient();
    const [year, month] = mes.split('-').map(Number);
    const start = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${mes}-${String(lastDay).padStart(2, '0')}`;

    let query = admin
        .from('registro_horas')
        .select('*, personal!inner(nombre, apellido)')
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: false });

    if (personalId) query = query.eq('personal_id', personalId);

    const { data } = await query;
    return (data || []) as RegistroHoras[];
}

export interface ResumenPrestador {
    personal_id: string;
    nombre: string;
    apellido: string | null;
    dias: number;
    total_horas: number;
    horas_extra: number;
    prom_horas_dia: number;
    hora_ingreso_min: string | null;
    hora_egreso_max: string | null;
    valor_hora_ars: number | null;
    horas_base: number | null;
    costo_hora_extra: number | null;
    costo_total: number | null;
}

export interface ResumenMes {
    mes: string;
    prestadores: ResumenPrestador[];
    total_horas: number;
    total_dias_persona: number;
}

export async function getResumenHorasMes(mes: string): Promise<ResumenMes> {
    const admin = getAdminClient();
    const [year, month] = mes.split('-').map(Number);
    const start = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${mes}-${String(lastDay).padStart(2, '0')}`;

    const { data } = await admin
        .from('registro_horas')
        .select('personal_id, fecha, horas, hora_ingreso, hora_egreso, salida_dia_siguiente, personal!inner(nombre, apellido, valor_hora_ars, horas_base, costo_hora_extra, recargo_sabado, recargo_domingo_feriado, recargo_nocturno)')
        .gte('fecha', start)
        .lte('fecha', end);

    if (!data || data.length === 0) {
        return { mes, prestadores: [], total_horas: 0, total_dias_persona: 0 };
    }

    // Group by personal_id
    const byPersonal = new Map<string, {
        nombre: string; apellido: string | null;
        valorHoraArs: number | null; horasBase: number | null; costoHoraExtra: number | null;
        recargoSabado: boolean; recargoDomingoFeriado: boolean; recargoNocturno: boolean;
        logs: any[];
    }>();

    for (const row of data as Record<string, unknown>[]) {
        const pid = row.personal_id as string;
        const p = (Array.isArray(row.personal) ? row.personal[0] : row.personal) as {
            nombre: string; apellido: string | null;
            valor_hora_ars: number | null; horas_base: number | null; costo_hora_extra: number | null;
            recargo_sabado?: boolean; recargo_domingo_feriado?: boolean; recargo_nocturno?: boolean;
        };
        if (!byPersonal.has(pid)) {
            byPersonal.set(pid, {
                nombre: p.nombre, apellido: p.apellido,
                valorHoraArs: p.valor_hora_ars ?? null,
                horasBase: p.horas_base ?? null,
                costoHoraExtra: p.costo_hora_extra ?? null,
                recargoSabado: p.recargo_sabado !== false,
                recargoDomingoFeriado: p.recargo_domingo_feriado !== false,
                recargoNocturno: !!p.recargo_nocturno,
                logs: [],
            });
        }
        const entry = byPersonal.get(pid)!;
        entry.logs.push({
            fecha: row.fecha,
            horas: Number(row.horas) || 0,
            hora_ingreso: row.hora_ingreso,
            hora_egreso: row.hora_egreso,
        });
    }

    const prestadores: ResumenPrestador[] = [];
    let total_horas = 0;
    let total_dias = 0;

    for (const [pid, e] of byPersonal.entries()) {
        const th = Math.round(e.logs.reduce((a, b) => a + b.horas, 0) * 100) / 100;
        const dias = e.logs.length;
        total_horas += th;
        total_dias += dias;

        const valorHora = e.valorHoraArs && e.valorHoraArs > 0 ? e.valorHoraArs : null;
        const horasBase = e.horasBase ?? null;
        const costoExtra = e.costoHoraExtra ?? null;

        let costoTotal: number | null = null;
        let horasExtra = 0;
        if (valorHora !== null) {
            costoTotal = calculateAdjustedEarnings(e.logs, valorHora, {
                recargo_sabado: e.recargoSabado,
                recargo_domingo_feriado: e.recargoDomingoFeriado,
                recargo_nocturno: e.recargoNocturno,
                horas_base: horasBase,
                costo_hora_extra: costoExtra,
            });
            costoTotal = Math.round(costoTotal);

            if (horasBase !== null && th > horasBase) {
                horasExtra = Math.round((th - horasBase) * 100) / 100;
            }
        }

        const ingresos = e.logs.map(l => l.hora_ingreso).filter(h => h && h !== '00:00');
        const egresos = e.logs.map(l => l.hora_egreso).filter(h => h && h !== '00:00');

        prestadores.push({
            personal_id: pid,
            nombre: e.nombre,
            apellido: e.apellido,
            dias,
            total_horas: th,
            horas_extra: horasExtra,
            prom_horas_dia: dias > 0 ? Math.round((th / dias) * 100) / 100 : 0,
            hora_ingreso_min: ingresos.length > 0 ? ingresos.sort()[0] : null,
            hora_egreso_max: egresos.length > 0 ? egresos.sort().at(-1)! : null,
            valor_hora_ars: valorHora,
            horas_base: horasBase,
            costo_hora_extra: costoExtra,
            costo_total: costoTotal,
        });
    }

    prestadores.sort((a, b) => b.total_horas - a.total_horas);

    return {
        mes,
        prestadores,
        total_horas: Math.round(total_horas * 100) / 100,
        total_dias_persona: total_dias,
    };
}

// ─── Resumen de prestaciones por mes ─────────────────────────────────────────

export interface ResumenPrestacionPrestador {
    personal_id: string;
    nombre: string;
    apellido: string | null;
    area: string;
    cantidad: number;
    total_honorarios_usd: number;
}

export interface ResumenPrestacionesMes {
    mes: string;
    prestadores: ResumenPrestacionPrestador[];
    total_honorarios_usd: number;
    total_prestaciones: number;
}

export async function getResumenPrestacionesMes(mes: string): Promise<ResumenPrestacionesMes> {
    const admin = getAdminClient();
    const [year, month] = mes.split('-').map(Number);
    const start = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${mes}-${String(lastDay).padStart(2, '0')}`;

    const [prestData, personalData] = await Promise.all([
        admin
            .from('prestaciones_realizadas')
            .select('profesional_id, monto_honorarios')
            .gte('fecha_realizacion', start)
            .lte('fecha_realizacion', end),
        admin
            .from('personal')
            .select('id, nombre, apellido, area')
            .eq('activo', true),
    ]);

    if (!prestData.data || prestData.data.length === 0) {
        return { mes, prestadores: [], total_honorarios_usd: 0, total_prestaciones: 0 };
    }

    const personalMap = new Map(
        (personalData.data || []).map(p => [p.id, p])
    );

    const byPersonal = new Map<string, { nombre: string; apellido: string | null; area: string; honorarios: number[] }>();

    for (const row of prestData.data) {
        const pid = row.profesional_id as string;
        if (!byPersonal.has(pid)) {
            const p = personalMap.get(pid);
            byPersonal.set(pid, {
                nombre: p?.nombre ?? 'Desconocido',
                apellido: p?.apellido ?? null,
                area: p?.area ?? '',
                honorarios: [],
            });
        }
        byPersonal.get(pid)!.honorarios.push(Number(row.monto_honorarios) || 0);
    }

    let total_honorarios = 0;
    let total_prestaciones = 0;
    const prestadores: ResumenPrestacionPrestador[] = [];

    for (const [pid, e] of byPersonal.entries()) {
        const total = Math.round(e.honorarios.reduce((a, b) => a + b, 0) * 100) / 100;
        total_honorarios += total;
        total_prestaciones += e.honorarios.length;
        prestadores.push({
            personal_id: pid,
            nombre: e.nombre,
            apellido: e.apellido,
            area: e.area,
            cantidad: e.honorarios.length,
            total_honorarios_usd: total,
        });
    }

    prestadores.sort((a, b) => b.total_honorarios_usd - a.total_honorarios_usd);

    return {
        mes,
        prestadores,
        total_honorarios_usd: Math.round(total_honorarios * 100) / 100,
        total_prestaciones,
    };
}

export async function getCorreccionesDeRegistro(
    registroId: string
): Promise<CorreccionHoras[]> {
    const admin = getAdminClient();
    const { data } = await admin
        .from('registro_horas_correcciones')
        .select('*, profiles!editado_por(full_name)')
        .eq('registro_id', registroId)
        .order('created_at', { ascending: false });

    return (data || []).map((c: Record<string, unknown>) => ({
        ...(c as unknown as CorreccionHoras),
        editor: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { full_name: string } | undefined,
    }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function editarRegistroHoras(
    input: EditarRegistroInput
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    // Fetch current values for audit log
    const { data: current, error: fetchErr } = await admin
        .from('registro_horas')
        .select('horas, hora_ingreso, hora_egreso, salida_dia_siguiente, fecha')
        .eq('id', input.registroId)
        .single();

    if (fetchErr || !current) return { success: false, error: 'Registro no encontrado' };

    // Apply changes
    const { error: updateErr } = await admin
        .from('registro_horas')
        .update({
            ...input.cambios,
            estado: 'Registrado',
            observaciones: `[CORREGIDO] ${input.motivo}`,
        })
        .eq('id', input.registroId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Insert audit records for each changed field
    const auditRows: Array<{
        registro_id: string;
        editado_por: string;
        motivo: string;
        campo: string;
        valor_anterior: string | null;
        valor_nuevo: string;
    }> = [];
    const campos = ['horas', 'hora_ingreso', 'hora_egreso', 'salida_dia_siguiente', 'fecha'] as const;

    for (const campo of campos) {
        if (input.cambios[campo] !== undefined) {
            const anterior = current[campo];
            const nuevo = input.cambios[campo];
            if (String(anterior) !== String(nuevo)) {
                auditRows.push({
                    registro_id: input.registroId,
                    editado_por: user.id,
                    motivo: input.motivo,
                    campo,
                    valor_anterior: anterior !== null && anterior !== undefined ? String(anterior) : null,
                    valor_nuevo: String(nuevo),
                });
            }
        }
    }

    if (auditRows.length > 0) {
        await admin.from('registro_horas_correcciones').insert(auditRows);
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    revalidatePath('/portal');
    return { success: true };
}

export async function eliminarRegistroHoras(
    registroId: string,
    motivo: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    // Log before deleting
    const { data: current } = await admin
        .from('registro_horas')
        .select('personal_id, fecha, horas')
        .eq('id', registroId)
        .single();

    if (current) {
        await admin.from('registro_horas_correcciones').insert({
            registro_id: registroId,
            editado_por: user.id,
            motivo: `ELIMINADO: ${motivo}`,
            campo: 'estado',
            valor_anterior: `fecha:${current.fecha} horas:${current.horas}`,
            valor_nuevo: 'eliminado',
        });
    }

    const { error } = await admin
        .from('registro_horas')
        .delete()
        .eq('id', registroId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    return { success: true };
}
