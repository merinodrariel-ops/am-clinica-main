import {
  CajaMovimiento,
  TarifarioItem,
  CajaArqueo,
  TransferenciaCaja,
  Paciente,
} from "./supabase";
import { createClient } from "@/utils/supabase/client";
import { getLocalISODate } from "@/lib/local-date";

const supabase = createClient();

/**
 * Caja Recepción Business Logic
 */

// ===================== TARIFARIO =====================

export async function getTarifarioVigente(): Promise<TarifarioItem[]> {
  const { data, error } = await supabase
    .from("tarifario_items")
    .select(
      `
            *,
            tarifario_versiones!inner(estado)
        `,
    )
    .eq("tarifario_versiones.estado", "vigente")
    .eq("activo", true)
    .order("categoria")
    .order("concepto_nombre");

  if (error) throw error;
  return data || [];
}

export async function getTarifarioByCategoria(): Promise<
  Record<string, TarifarioItem[]>
> {
  const items = await getTarifarioVigente();
  return items.reduce(
    (acc, item) => {
      if (!acc[item.categoria]) {
        acc[item.categoria] = [];
      }
      acc[item.categoria].push(item);
      return acc;
    },
    {} as Record<string, TarifarioItem[]>,
  );
}

// ===================== PACIENTES =====================

export async function searchPacientes(query: string): Promise<Paciente[]> {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id_paciente, nombre, apellido, telefono, email, documento")
    .or(
      `nombre.ilike.%${query}%,apellido.ilike.%${query}%,documento.ilike.%${query}%`,
    )
    .limit(10);

  if (error) throw error;
  return data || [];
}

export async function getPacienteById(id: string): Promise<Paciente | null> {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id_paciente, nombre, apellido, telefono, email, documento")
    .eq("id_paciente", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

// ===================== MOVIMIENTOS =====================

export interface NuevoMovimientoInput {
  paciente_id: string;
  concepto_id?: string;
  concepto_nombre: string;
  categoria?: string;
  precio_lista_usd?: number;
  monto: number;
  moneda: "USD" | "ARS" | "USDT";
  metodo_pago: "Efectivo" | "Transferencia" | "MercadoPago" | "Cripto";
  canal_destino?: "Empresa" | "Personal" | "MP" | "USDT";
  tipo_comprobante?: "Factura A" | "Tipo C" | "Sin factura" | "Otro";
  cuota_nro?: number;
  cuotas_total?: number;
  interes_mensual_pct?: number;
  estado?: "pagado" | "pendiente" | "parcial";
  observaciones?: string;
  tc_bna_venta?: number;
  tc_fuente?: "BNA_AUTO" | "MANUAL" | "N/A";
  usuario?: string;
}

export async function crearMovimiento(
  input: NuevoMovimientoInput,
): Promise<CajaMovimiento> {
  // Calculate USD equivalent for ARS payments
  let usd_equivalente = input.monto;
  if (input.moneda === "ARS" && input.tc_bna_venta && input.tc_bna_venta > 0) {
    usd_equivalente =
      Math.round((input.monto / input.tc_bna_venta) * 100) / 100;
  }

  const { data, error } = await supabase
    .from("caja_recepcion_movimientos")
    .insert({
      ...input,
      usd_equivalente,
      tc_fecha_hora: input.moneda === "ARS" ? new Date().toISOString() : null,
      tc_fuente: input.moneda === "ARS" ? input.tc_fuente : "N/A",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMovimientosDelDia(
  fecha?: string,
): Promise<CajaMovimiento[]> {
  const targetDate = fecha || getLocalISODate();

  const { data, error } = await supabase
    .from("caja_recepcion_movimientos")
    .select(
      `
            *,
            paciente:pacientes(id_paciente, nombre, apellido)
        `,
    )
    .eq("fecha_movimiento", targetDate)
    .order("fecha_hora", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getMovimientosPorPaciente(
  pacienteId: string,
): Promise<CajaMovimiento[]> {
  const { data, error } = await supabase
    .from("caja_recepcion_movimientos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("fecha_hora", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function anularMovimiento(
  movimientoId: string,
  motivo: string,
  usuario: string,
): Promise<void> {
  const { error } = await supabase
    .from("caja_recepcion_movimientos")
    .update({
      estado: "anulado",
      motivo_anulacion: motivo,
      anulado_por: usuario,
      anulado_fecha_hora: new Date().toISOString(),
    })
    .eq("id", movimientoId);

  if (error) throw error;
}

// ===================== ARQUEO =====================

export async function getUltimoCierre(
  fechaLimite?: string,
): Promise<CajaArqueo | null> {
  let query = supabase
    .from("caja_recepcion_arqueos")
    .select("*")
    .eq("estado", "cerrado")
    .order("fecha", { ascending: false })
    .limit(1);

  if (fechaLimite) {
    query = query.lt("fecha", fechaLimite);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getAperturaDelDia(
  fecha?: string,
): Promise<CajaArqueo | null> {
  const targetDate = fecha || getLocalISODate();

  const { data, error } = await supabase
    .from("caja_recepcion_arqueos")
    .select("*")
    .eq("fecha", targetDate)
    .eq("estado", "abierto")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data || null;
}

export async function abrirCajaDelDia(
  fecha: string,
  usuario: string,
  tcBnaVenta?: number | null,
): Promise<CajaArqueo> {
  const { data: closedToday, error: closedError } = await supabase
    .from("caja_recepcion_arqueos")
    .select("id")
    .eq("fecha", fecha)
    .eq("estado", "cerrado")
    .maybeSingle();

  if (closedError && closedError.code !== "PGRST116") {
    throw closedError;
  }

  if (closedToday?.id) {
    throw new Error("La caja de hoy ya fue cerrada.");
  }

  const aperturaExistente = await getAperturaDelDia(fecha);
  if (aperturaExistente) {
    return aperturaExistente;
  }

  const ultimoCierre = await getUltimoCierre(fecha);
  const saldoInicialUsd = ultimoCierre?.saldo_final_usd_billete || 0;
  const saldoInicialArs = ultimoCierre?.saldo_final_ars_billete || 0;
  const saldoInicialEq =
    ultimoCierre?.saldo_final_usd_equivalente ??
    (tcBnaVenta && tcBnaVenta > 0
      ? saldoInicialUsd + saldoInicialArs / tcBnaVenta
      : saldoInicialUsd);

  const { data, error } = await supabase
    .from("caja_recepcion_arqueos")
    .insert({
      fecha,
      usuario,
      hora_inicio: new Date().toISOString(),
      hora_cierre: null,
      saldo_inicial_usd_billete: saldoInicialUsd,
      saldo_inicial_ars_billete: saldoInicialArs,
      saldo_inicial_usd_equivalente:
        Math.round((saldoInicialEq || 0) * 100) / 100,
      saldo_final_usd_billete: null,
      saldo_final_ars_billete: null,
      saldo_final_usd_equivalente: null,
      tc_bna_venta_dia: tcBnaVenta || null,
      total_ingresos_dia_usd: 0,
      total_transferencias_admin_usd: 0,
      diferencia_usd: 0,
      observaciones: "Apertura automatica",
      estado: "abierto",
      snapshot_datos: {
        apertura_automatica: true,
        origen: "sistema",
      },
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as CajaArqueo;
}

export async function cerrarCajaDelDia(
  fecha: string,
  usuario: string,
  saldoFinalUsd: number,
  saldoFinalArs: number,
  tcBnaVenta: number,
  snapshot: unknown,
  observaciones?: string,
): Promise<string> {
  // Calculate totals for verification (CASH ONLY)
  // 1. Get pending cash movements (including past days that were not closed)
  const { data: movimientos } = await supabase
    .from("caja_recepcion_movimientos")
    .select("usd_equivalente, metodo_pago")
    .lte("fecha_movimiento", fecha) // Include today and past
    .is("cierre_id", null)
    .neq("estado", "anulado")
    .eq("metodo_pago", "Efectivo"); // ONLY CASH counts for Arqueo

  const totalIngresosUsd =
    movimientos?.reduce(
      (sum: number, m: { usd_equivalente: number }) =>
        sum + (m.usd_equivalente || 0),
      0,
    ) || 0;

  // 2. Get transfers since last closure
  const ultimo = await getUltimoCierre(fecha);
  const saldoInicialUsd = ultimo?.saldo_final_usd_billete || 0;
  const saldoInicialArs = ultimo?.saldo_final_ars_billete || 0;

  // For transfers, we look for anything confirmed AFTER the previous close
  let transQuery = supabase
    .from("transferencias_caja")
    .select("usd_equivalente")
    .eq("estado", "confirmada");

  if (ultimo?.hora_cierre) {
    transQuery = transQuery.gt("fecha_hora", ultimo.hora_cierre);
  } else if (ultimo) {
    // Fallback if hora_cierre missing (legacy), assume end of that day
    transQuery = transQuery.gt("fecha_hora", `${ultimo.fecha}T23:59:59`);
  }
  // Limit to current close time (approx)
  transQuery = transQuery.lt("fecha_hora", `${fecha}T23:59:59`);

  const { data: transferencias } = await transQuery;
  const totalTransferenciasUsd =
    transferencias?.reduce(
      (sum: number, t: { usd_equivalente: number }) =>
        sum + (t.usd_equivalente || 0),
      0,
    ) || 0;

  // Calculate difference
  const saldoInicialEq =
    saldoInicialUsd + (tcBnaVenta > 0 ? saldoInicialArs / tcBnaVenta : 0);
  const saldoFinalEq =
    saldoFinalUsd + (tcBnaVenta > 0 ? saldoFinalArs / tcBnaVenta : 0);

  const esperado = saldoInicialEq + totalIngresosUsd - totalTransferenciasUsd;
  const diferenciaUsd = Math.round((saldoFinalEq - esperado) * 100) / 100;

  const { data, error } = await supabase.rpc("cerrar_caja_recepcion", {
    p_fecha: fecha,
    p_usuario: usuario,
    p_saldo_final_usd: saldoFinalUsd,
    p_saldo_final_ars: saldoFinalArs,
    p_saldo_final_usd_eq: Math.round(saldoFinalEq * 100) / 100, // Added
    p_total_ingresos_usd: Math.round(totalIngresosUsd * 100) / 100,
    p_total_transferencias_usd: Math.round(totalTransferenciasUsd * 100) / 100,
    p_diferencia_usd: diferenciaUsd,
    p_tc_bna: tcBnaVenta,
    p_observaciones: observaciones,
    p_snapshot: snapshot,
  });

  if (error) throw error;
  return data;
}

// ===================== TRANSFERENCIAS =====================

export async function crearTransferencia(
  monto: number,
  moneda: "ARS" | "USD",
  motivo: string,
  tcBnaVenta: number | null,
  usuario: string,
  observaciones?: string,
): Promise<TransferenciaCaja> {
  const usd_equivalente =
    moneda === "USD"
      ? monto
      : tcBnaVenta && tcBnaVenta > 0
        ? Math.round((monto / tcBnaVenta) * 100) / 100
        : monto;

  const { data, error } = await supabase
    .from("transferencias_caja")
    .insert({
      moneda,
      monto,
      tc_bna_venta: moneda === "ARS" ? tcBnaVenta : null,
      usd_equivalente,
      motivo,
      observaciones,
      usuario,
      estado: "confirmada",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ===================== DASHBOARD =====================

export interface DashboardStats {
  totalDiaUsd: number;
  totalMesUsd: number;
  porMetodo: Record<string, number>;
  porCategoria: Record<string, number>;
  movimientosHoy: number;
  pendientes: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = getLocalISODate();
  const firstDayOfMonth = `${today.substring(0, 7)}-01`;

  // Today's movements
  // Today's movements
  const { data: movHoyRaw } = await supabase
    .from("caja_recepcion_movimientos")
    .select("usd_equivalente, metodo_pago, categoria, estado")
    .eq("fecha_movimiento", today);

  const movHoy = movHoyRaw as unknown as
    | {
      usd_equivalente: number;
      metodo_pago: string;
      categoria: string | null;
      estado: string;
    }[]
    | null;

  // Month's movements
  const { data: movMes } = await supabase
    .from("caja_recepcion_movimientos")
    .select("usd_equivalente")
    .gte("fecha_movimiento", firstDayOfMonth)
    .lte("fecha_movimiento", today)
    .neq("estado", "anulado");

  const pagadosHoy = (movHoy || []).filter((m) => m.estado !== "anulado");
  const pendientesHoy = (movHoy || []).filter((m) => m.estado === "pendiente");

  // Aggregate by method
  const porMetodo: Record<string, number> = {};
  pagadosHoy.forEach((m) => {
    const metodo = m.metodo_pago as string;
    porMetodo[metodo] = (porMetodo[metodo] || 0) + (m.usd_equivalente || 0);
  });

  // Aggregate by category
  const porCategoria: Record<string, number> = {};
  pagadosHoy.forEach((m) => {
    if (m.categoria) {
      const cat = m.categoria as string;
      porCategoria[cat] = (porCategoria[cat] || 0) + (m.usd_equivalente || 0);
    }
  });

  return {
    totalDiaUsd:
      Math.round(
        pagadosHoy.reduce(
          (sum: number, m) => sum + (m.usd_equivalente || 0),
          0,
        ) * 100,
      ) / 100,
    totalMesUsd:
      Math.round(
        (movMes || []).reduce(
          (sum: number, m: { usd_equivalente: number }) =>
            sum + (m.usd_equivalente || 0),
          0,
        ) * 100,
      ) / 100,
    porMetodo,
    porCategoria,
    movimientosHoy: pagadosHoy.length,
    pendientes: pendientesHoy.length,
  };
}

// =============================================
// Alertas
// =============================================

export interface DiaSinCierre {
  fecha: string;
  cantidad: number;
  ultimo_usuario: string;
}

export async function getDiasSinCierreRecepcion(): Promise<DiaSinCierre[]> {
  const { data, error } = await supabase.rpc("get_dias_sin_cierre_recepcion");
  if (error) {
    console.error("Error checking alerts:", error);
    return [];
  }
  return data || [];
}

export async function logMovimientoEdit(
  registroId: string,
  tabla: string,
  campo: string,
  valorAnterior: string | null,
  valorNuevo: string | null,
  motivo: string,
) {
  try {
    // Get current user info
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const insertData = {
      id_registro: registroId,
      tabla_origen: tabla,
      campo_modificado: campo,
      valor_anterior: valorAnterior,
      valor_nuevo: valorNuevo,
      usuario_editor: user?.id || null,
      usuario_email: user?.email || null,
      motivo_edicion: motivo,
    };

    const { error } = await supabase
      .from("historial_ediciones")
      .insert(insertData);

    if (error) {
      // If error is Foreign Key Violation (user exists in auth but not in profiles), retry without user_id
      if (error.code === "23503") {
        console.warn(
          "Logging edit without linking to profile due to FK violation (missing profile). Email:",
          user?.email,
        );
        await supabase.from("historial_ediciones").insert({
          ...insertData,
          usuario_editor: null,
        });
      } else {
        console.error("Error logging edit:", error);
      }
    }
  } catch (err) {
    console.error("Error in logMovimientoEdit:", err);
  }
}

// ===================== BALANCE HELPERS =====================

export async function getCurrentBalanceRecepcion(): Promise<{
  status: "abierto" | "cerrado";
  lastCloseDate: string | null;
  saldoArs: number;
  saldoUsd: number;
}> {
  const today = getLocalISODate();
  const ultimo = await getUltimoCierre();

  // Check if today is already closed
  const isClosedToday = ultimo?.fecha === today;

  if (isClosedToday && ultimo) {
    return {
      status: "cerrado",
      lastCloseDate: ultimo.fecha,
      saldoArs: ultimo.saldo_final_ars_billete || 0,
      saldoUsd: ultimo.saldo_final_usd_billete || 0,
    };
  }

  // If open, perform calculation
  // 1. Initial Balance (from last closure)
  let saldoArs = ultimo?.saldo_final_ars_billete || 0;
  let saldoUsd = ultimo?.saldo_final_usd_billete || 0;

  // 2. Add Movements (Open, not closed)
  // We use IS NULL on cierre_id to get only pending movements
  const baseQuery = supabase
    .from("caja_recepcion_movimientos")
    .select("monto, moneda, metodo_pago, estado")
    .is("cierre_id", null)
    .neq("estado", "anulado");

  const { data: movimientos } = await baseQuery;
  const movs = movimientos || [];

  // Filter for Cash (Efectivo) only
  const cashMovs = movs.filter((m) => m.metodo_pago === "Efectivo");

  cashMovs.forEach((m) => {
    if (m.moneda === "ARS") saldoArs += m.monto;
    if (m.moneda === "USD") saldoUsd += m.monto;
  });

  // 3. Subtract Transfers (Egresos)
  const baseTransQuery = supabase
    .from("transferencias_caja")
    .select("monto, moneda, estado")
    .eq("estado", "confirmada");

  let transQuery = baseTransQuery;

  if (ultimo?.hora_cierre) {
    transQuery = baseTransQuery.gt("fecha_hora", ultimo.hora_cierre);
  } else if (ultimo) {
    transQuery = baseTransQuery.gt("fecha_hora", `${ultimo.fecha}T23:59:59`);
  }

  const { data: transferencias } = await transQuery;
  const trans = transferencias || [];

  trans.forEach((t) => {
    if (t.moneda === "ARS") saldoArs -= t.monto;
    if (t.moneda === "USD") saldoUsd -= t.monto;
  });

  return {
    status: "abierto",
    lastCloseDate: ultimo?.fecha || null,
    saldoArs,
    saldoUsd,
  };
}
