"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  Check,
  X,
  ChevronDown,
  FileText,
  Receipt,
  History,
  AlertTriangle,
  Trash2,
  DollarSign,
  RefreshCw,
  Wallet,
  ArrowRightLeft,
  Pencil,
  Eye,
  EyeOff,
  Share2,
  Minus,
  Paperclip,
  AlertCircle,
  PlayCircle,
  Lock,
  BookOpen,
  TrendingDown,
  Settings,
} from "lucide-react";

import {
  type Sucursal,
  type CajaAdminMovimiento,
  type CuentaFinanciera,
  type MovimientoLinea,
  type CajaAdminArqueo,
  getMovimientos,
  getCuentas,
  createMovimiento,
  getAperturaAdminDelDia,
  getArqueosForMonth,
  getCurrentBalanceAdmin,
  logMovimientoEdit,
  deleteMovimiento,
  getCategorias,
  type CajaAdminCategoria,
} from "@/lib/caja-admin";
import { updateCajaAdminMovimientoSecure } from "@/app/actions/caja-admin";
import { createClient } from "@/utils/supabase/client";
import { ComprobanteLink } from "@/components/caja/ComprobanteLink";
import { useAuth } from "@/contexts/AuthContext";
import HistorialEdicionesModal from "@/components/caja/HistorialEdicionesModal";
import { ComprobanteUpload } from "@/components/caja/ComprobanteUpload";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getLocalISODate } from "@/lib/local-date";
import { Textarea } from "@/components/ui/Textarea";
import MoneyInput from "@/components/ui/MoneyInput";

interface Props {
  sucursal: Sucursal;
  tcBna: number | null;
  initialAction?: string;
}

type MetodoPagoUI = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "OTRO";

const TIPOS_MOVIMIENTO = [
  { value: "EGRESO", label: "Egreso" },
  { value: "INGRESO_ADMIN", label: "Ingreso Administrativo" },
  { value: "INGRESO_PACIENTE", label: "Ingreso Paciente", onlyUnificada: true },
  { value: "CAMBIO_MONEDA", label: "Cambio de Moneda" },
  { value: "RETIRO", label: "Retiro" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "AJUSTE_CAJA", label: "Ajuste de Caja" },
  { value: "APORTE_CAPITAL", label: "Aporte de Capital (No Ingreso)" },
  { value: "GIRO_ACTIVO", label: "Giro Activo (Deuda Externa)" },
];

export default function MovimientosTab({ sucursal, tcBna, initialAction }: Props) {
  const { role } = useAuth();
  const canEditAdminAmounts = role === "owner" || role === "admin";
  const [movimientos, setMovimientos] = useState<CajaAdminMovimiento[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [categorias, setCategorias] = useState<CajaAdminCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mesActual, setMesActual] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [historialMovId, setHistorialMovId] = useState<string | null>(null);
  const [deletingMovId, setDeletingMovId] = useState<string | null>(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [adjuntos, setAdjuntos] = useState<string[]>([]);
  const [editingMov, setEditingMov] = useState<CajaAdminMovimiento | null>(
    null,
  );
  const [isEditModalMinimized, setIsEditModalMinimized] = useState(false);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [editSaveSuccess, setEditSaveSuccess] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    fecha: string;
    descripcion: string;
    motivo: string;
    lines: MovimientoLinea[];
    adjuntos: string[];
    totalUsd: number;
    nota?: string;
  }>({
    fecha: "",
    descripcion: "",
    motivo: "",
    lines: [],
    adjuntos: [],
    totalUsd: 0,
    nota: "",
  });

  const [aperturaHoy, setAperturaHoy] = useState<CajaAdminArqueo | null>(null);
  const isCajaAbierta = aperturaHoy?.estado === "Abierto";
  const [arqueos, setArqueos] = useState<CajaAdminArqueo[]>([]);
  const [showArqueos, setShowArqueos] = useState(false);
  const [balanceVivo, setBalanceVivo] = useState<{
    saldoArs: number;
    saldoUsd: number;
    gastosTotalesUsd: number;
    giroArs: number;
    giroUsd: number;
    status: string;
    lastCloseDate?: string | null;
  } | null>(null);

  // Giro Activo form state
  const [giroMoneda, setGiroMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [giroMonto, setGiroMonto] = useState<string>('');
  const [giroRate, setGiroRate] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState({
    tipo_movimiento: "EGRESO",
    subtipo: "",
    descripcion: "",
    nota: "",
    fecha_movimiento: getLocalISODate(),
  });
  const [formLineas, setFormLineas] = useState<MovimientoLinea[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [manualRate, setManualRate] = useState<string>("");
  const [exchangeAmountUSD, setExchangeAmountUSD] = useState<string>("");
  const handledActionRef = useRef<string | null>(null);

  const formatArqueoSaldos = (saldos: Record<string, number> | undefined | null) => {
    if (!saldos) return <span className="text-slate-400">—</span>;
    const totals: Record<string, number> = {};
    Object.entries(saldos).forEach(([cuentaId, monto]) => {
      const cuenta = cuentas.find((c) => c.id === cuentaId);
      if (cuenta) {
        totals[cuenta.moneda] = (totals[cuenta.moneda] || 0) + Number(monto);
      }
    });

    const currencies = Object.keys(totals).sort().reverse(); // USD first, then ARS or others
    if (currencies.length === 0) return <span className="text-slate-400">—</span>;

    return (
      <div className="flex flex-col items-end space-y-0.5">
        {currencies.map((curr) => (
          <span
            key={curr}
            className={`text-xs font-mono ${curr === "ARS"
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-600 dark:text-slate-300"
              }`}
          >
            {new Intl.NumberFormat(curr === "ARS" ? "es-AR" : "en-US", {
              style: "currency",
              currency: curr,
            }).format(totals[curr])}
          </span>
        ))}
      </div>
    );
  };

  // Lightweight refresh: only updates the balance strip cards (single request)
  async function refreshBalance() {
    try {
      const balanceData = await getCurrentBalanceAdmin(sucursal.id);
      setBalanceVivo(balanceData);
    } catch (error) {
      console.error("Error refreshing balance:", error);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      // Use sequential fetching to avoid potential resource contention/inference issues during build/runtime
      // and ensure explicit error handling
      const movData = await getMovimientos({ sucursalId: sucursal.id, mes: mesActual });
      const cuentasData = await getCuentas(sucursal.id);
      const categoriasData = await getCategorias(sucursal.id);
      const aperturaHoy = await getAperturaAdminDelDia(sucursal.id);
      const arqueosData = await getArqueosForMonth(sucursal.id, mesActual);
      const balanceData = await getCurrentBalanceAdmin(sucursal.id);

      setMovimientos(movData || []);

      const supabase = createClient();
      const { data: transData } = await supabase
        .from("transferencias_caja")
        .select("*")
        .or(`origen.eq.CAJA_ADMIN,destino.eq.CAJA_ADMIN`)
        .eq("sucursal_id", sucursal.id)
        .eq("estado", "completado")
        .order("fecha_hora", { ascending: false });

      setTransfers(transData || []);
      setCuentas(cuentasData || []);
      setCategorias((categoriasData || []).filter(c => c.activo));
      setAperturaHoy(aperturaHoy);
      setArqueos(arqueosData || []);
      setBalanceVivo(balanceData);
    } catch (error) {
      console.error("Error loading Caja Admin data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursal.id, mesActual]);

  useEffect(() => {
    if (!initialAction) {
      handledActionRef.current = null;
      return;
    }

    if (handledActionRef.current === initialAction) return;
    if (loading) return;

    if (initialAction === "nuevo-egreso") {
      if (!isCajaAbierta) {
        handledActionRef.current = initialAction;
        return;
      }

      setFormData((prev) => ({ ...prev, tipo_movimiento: "EGRESO" }));
      setShowForm(true);
      handledActionRef.current = initialAction;
    }
  }, [initialAction, loading, isCajaAbierta]);
  useEffect(() => {
    if (formData.tipo_movimiento === "CAMBIO_MONEDA" && exchangeAmountUSD) {
      const usdVal = parseFloat(exchangeAmountUSD) || 0;
      const rateVal = parseFloat(manualRate) || tcBna || 0;
      const arsVal = usdVal * rateVal;

      const newLines: MovimientoLinea[] = [];

      // 1. Origen (USD Out)
      const sourceCuenta = cuentas.find(
        (c) => c.moneda === "USD" && c.tipo_cuenta === "EFECTIVO",
      );
      if (sourceCuenta) {
        newLines.push({
          cuenta_id: sourceCuenta.id,
          importe: -usdVal,
          moneda: "USD",
          usd_equivalente: -usdVal,
        });
      }

      // 2. Destino (ARS In)
      const destCuenta = cuentas.find(
        (c) => c.moneda === "ARS" && c.tipo_cuenta === "EFECTIVO",
      );
      if (destCuenta) {
        // For ARS in Exchange, we can set usd_equivalente using the transaction rate to zero out the net,
        // OR use BNA to show "Gain/Loss". User wants neutral -> Use transaction rate (usdVal)
        newLines.push({
          cuenta_id: destCuenta.id,
          importe: arsVal,
          moneda: "ARS",
          usd_equivalente: usdVal,
        });
      }

      setFormLineas(newLines);
    }
  }, [exchangeAmountUSD, manualRate, formData.tipo_movimiento, cuentas, tcBna]);

  // ... (rest of logic)

  // --- Helper for Monthly Summary ---
  const getMonthlySummary = () => {
    const [year, month] = mesActual.split("-");
    const monthName = new Date(
      parseInt(year),
      parseInt(month) - 1,
    ).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

    // Exclude Transfers and Exchanges from "Operating" metrics
    const relevantMovs = movimientos.filter(
      (m) =>
        !["CAMBIO_MONEDA", "TRANSFERENCIA", "AJUSTE_CAJA"].includes(
          m.tipo_movimiento,
        ) && m.estado !== "Anulado",
    );

    const egresos = relevantMovs.filter((m) => m.tipo_movimiento === "EGRESO");
    const ingresosPacientes = relevantMovs.filter(
      (m) => m.tipo_movimiento === "INGRESO_PACIENTE",
    );
    const ingresosAdmin = relevantMovs.filter(
      (m) => m.tipo_movimiento === "INGRESO_ADMIN",
    );
    const aportesCapital = relevantMovs.filter(
      (m) => m.tipo_movimiento === "APORTE_CAPITAL",
    );

    // ... (calculations use strictly filtered lists) ...
    const totalEgresosUsd = egresos.reduce(
      (acc, m) => acc + (m.usd_equivalente_total || 0),
      0,
    );
    const totalIngresosUsd =
      ingresosPacientes.reduce(
        (acc, m) => acc + (m.usd_equivalente_total || 0),
        0,
      ) +
      ingresosAdmin.reduce((acc, m) => acc + (m.usd_equivalente_total || 0), 0);
    const totalAportesUsd = aportesCapital.reduce(
      (acc, m) => acc + (m.usd_equivalente_total || 0),
      0,
    );

    // Balance Operativo
    const balanceOperativo = totalIngresosUsd - totalEgresosUsd;

    let summaryText = `📊 *Reporte Caja Administración*
📅 *Período:* ${monthName}
🏢 *Sucursal:* ${sucursal.nombre}

💸 *Egresos Operativos:*
• Cantidad: ${egresos.length}
• Total USD: $${totalEgresosUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}

💰 *Ingresos Operativos:*
• Pacientes: ${ingresosPacientes.length} mov.
• Administración: ${ingresosAdmin.length} mov.
• Total USD: $${totalIngresosUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

    if (aportesCapital.length > 0) {
      summaryText += `\n\n🏦 *Aportes de Capital:*
• Cantidad: ${aportesCapital.length}
• Total USD: $${totalAportesUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    }

    summaryText += `\n\n📈 *Balance Operativo (Ingresos - Egresos):* $${balanceOperativo.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;

    summaryText += `\n\n_Nota: No incluye Cambios de Moneda ni Transferencias internas._`;

    return summaryText;
  };

  // Calculate Dashboard Metrics
  const statsEgresos = movimientos
    .filter((m) => m.tipo_movimiento === "EGRESO" && m.estado !== "Anulado")
    .reduce((sum, m) => sum + (m.usd_equivalente_total || 0), 0);

  function addLinea() {
    if (cuentas.length === 0) return;
    setFormLineas([
      ...formLineas,
      {
        cuenta_id: cuentas[0].id,
        importe: 0,
        moneda: cuentas[0].moneda,
      },
    ]);
  }

  function removeLinea(index: number) {
    setFormLineas(formLineas.filter((_, i) => i !== index));
  }

  function updateLinea(index: number, updates: Partial<MovimientoLinea>) {
    const newLineas = [...formLineas];
    newLineas[index] = { ...newLineas[index], ...updates };

    // Update moneda based on cuenta
    if (updates.cuenta_id) {
      const cuenta = cuentas.find((c) => c.id === updates.cuenta_id);
      if (cuenta) {
        newLineas[index].moneda = cuenta.moneda;
      }
    }

    // Enforce positive values only if not explicitly allowing negative (for Exchange Source)
    // For CAMBIO_MONEDA, we will handle signs manually in the UI change handler, so here we might just accept what comes
    // BUT current UI calls this with absolute value for normal lines.
    // Let's modify this to Check if it is CAMBIO_MONEDA logic downstream or just accept value.
    // To be safe, let's keep Math.abs UNLESS we pass a special flag or check formData.
    // Actually, easiest way is to NOT enforce Math.abs here if the caller handles it, OR check formData.tipo_movimiento.

    if (updates.importe !== undefined) {
      if (
        ["CAMBIO_MONEDA", "TRANSFERENCIA", "AJUSTE_CAJA"].includes(
          formData.tipo_movimiento,
        )
      ) {
        // Allow negative for these types (Source in Exchange, Outflow in Transfer, Shortage in Adjustment)
        newLineas[index].importe = updates.importe;
      } else {
        newLineas[index].importe = Math.abs(newLineas[index].importe);
      }
    }

    // Calculate USD equivalent
    if (newLineas[index].moneda === "ARS" && tcBna) {
      newLineas[index].usd_equivalente = newLineas[index].importe / tcBna;
    } else if (newLineas[index].moneda === "USD") {
      newLineas[index].usd_equivalente = newLineas[index].importe;
    }

    setFormLineas(newLineas);
  }

  function mapCuentaTipoToMetodo(
    tipoCuenta: CuentaFinanciera["tipo_cuenta"],
  ): MetodoPagoUI {
    if (tipoCuenta === "BANCO") return "TRANSFERENCIA";
    if (tipoCuenta === "TARJETA") return "TARJETA";
    if (tipoCuenta === "EFECTIVO") return "EFECTIVO";
    return "OTRO";
  }

  function mapMetodoToCuentaTipo(
    metodo: MetodoPagoUI,
  ): CuentaFinanciera["tipo_cuenta"] | null {
    if (metodo === "TRANSFERENCIA") return "BANCO";
    if (metodo === "TARJETA") return "TARJETA";
    if (metodo === "EFECTIVO") return "EFECTIVO";
    return "OTRO";
  }

  function getMetodoForCuentaId(cuentaId: string): MetodoPagoUI {
    const cuenta = cuentas.find((item) => item.id === cuentaId);
    if (!cuenta) return "OTRO";
    return mapCuentaTipoToMetodo(cuenta.tipo_cuenta);
  }

  function findCuentaByMetodo(
    metodo: MetodoPagoUI,
    preferredCurrency?: string,
  ): CuentaFinanciera | null {
    const expectedTipo = mapMetodoToCuentaTipo(metodo);
    if (!expectedTipo) return null;

    if (metodo === "OTRO") {
      const otherAccount = cuentas.find(
        (cuenta) =>
          (cuenta.tipo_cuenta === "OTRO" ||
            cuenta.tipo_cuenta === "SERVICIO") &&
          (!preferredCurrency || cuenta.moneda === preferredCurrency),
      );

      if (otherAccount) return otherAccount;
    }

    const sameCurrency = cuentas.find(
      (cuenta) =>
        cuenta.tipo_cuenta === expectedTipo &&
        (!preferredCurrency || cuenta.moneda === preferredCurrency),
    );

    if (sameCurrency) return sameCurrency;

    return (
      cuentas.find((cuenta) => cuenta.tipo_cuenta === expectedTipo) || null
    );
  }

  function handleMetodoChangeForNewLine(index: number, metodo: MetodoPagoUI) {
    const currentLine = formLineas[index];
    if (!currentLine) return;

    const targetCuenta = findCuentaByMetodo(metodo, currentLine.moneda);
    if (!targetCuenta) {
      alert(
        `No hay cuenta configurada para ${metodo.toLowerCase()} en esta sucursal.`,
      );
      return;
    }

    updateLinea(index, { cuenta_id: targetCuenta.id });
  }

  function getUsdEquivalente(
    importe: number,
    moneda: string,
    previousUsd?: number,
  ) {
    if (moneda === "USD") return importe;
    if (moneda === "ARS" && tcBna) return importe / tcBna;
    return previousUsd || 0;
  }

  function addEditLinea() {
    if (cuentas.length === 0) return;
    const cuentaDefault = cuentas[0];
    const newLine: MovimientoLinea = {
      cuenta_id: cuentaDefault.id,
      moneda: cuentaDefault.moneda,
      importe: 0,
      usd_equivalente: getUsdEquivalente(0, cuentaDefault.moneda, 0),
    };

    setEditData({
      ...editData,
      lines: [...editData.lines, newLine],
    });
  }

  function removeEditLinea(index: number) {
    const newLines = editData.lines.filter((_, i) => i !== index);
    setEditData({ ...editData, lines: newLines });
  }

  function updateEditLinea(index: number, updates: Partial<MovimientoLinea>) {
    const newLines = [...editData.lines];
    const current = newLines[index];

    const nextCuentaId = updates.cuenta_id || current.cuenta_id;
    const selectedCuenta = cuentas.find((cuenta) => cuenta.id === nextCuentaId);
    const nextMoneda =
      selectedCuenta?.moneda || updates.moneda || current.moneda;

    // Allow negative if CAMBIO_MONEDA
    let nextImporte = current.importe;
    if (updates.importe !== undefined) {
      if (
        ["CAMBIO_MONEDA", "TRANSFERENCIA", "AJUSTE_CAJA"].includes(
          editingMov?.tipo_movimiento || "",
        )
      ) {
        nextImporte = updates.importe;
      } else {
        nextImporte = Math.abs(updates.importe);
      }
    }

    const nextUsd = getUsdEquivalente(
      nextImporte,
      nextMoneda,
      current.usd_equivalente,
    );

    newLines[index] = {
      ...current,
      ...updates,
      cuenta_id: nextCuentaId,
      moneda: nextMoneda,
      importe: nextImporte,
      usd_equivalente: nextUsd,
    };

    setEditData({ ...editData, lines: newLines });
  }

  function handleMetodoChangeForEditLine(index: number, metodo: MetodoPagoUI) {
    const currentLine = editData.lines[index];
    if (!currentLine) return;

    const targetCuenta = findCuentaByMetodo(metodo, currentLine.moneda);
    if (!targetCuenta) {
      alert(
        `No hay cuenta configurada para ${metodo.toLowerCase()} en esta sucursal.`,
      );
      return;
    }

    updateEditLinea(index, { cuenta_id: targetCuenta.id });
  }

  async function handleUpdate() {
    setEditSaveError(null);
    setEditSaveSuccess(null);

    if (!canEditAdminAmounts) {
      setEditSaveError(
        "No tienes permisos para editar montos en Caja Administracion.",
      );
      return;
    }

    if (!editingMov || !editData.fecha || !editData.motivo) {
      setEditSaveError("Completa fecha y motivo del cambio para guardar.");
      return;
    }

    const linesToSave = editData.lines
      .map((line) => ({
        ...line,
        importe:
          editingMov?.tipo_movimiento === "CAMBIO_MONEDA"
            ? Number(line.importe || 0)
            : Math.max(0, Number(line.importe || 0)),
      }))
      .filter(
        (line) =>
          line.cuenta_id &&
          (editingMov?.tipo_movimiento === "CAMBIO_MONEDA"
            ? line.importe !== 0
            : line.importe > 0),
      );

    const normalizedLinesToSave = linesToSave.map((line) => {
      const importe = Number(line.importe || 0);
      const moneda = (line.moneda || "").toUpperCase();
      const usdRaw = Number(line.usd_equivalente);
      const hasUsdEq = Number.isFinite(usdRaw);

      let usdEquivalente = hasUsdEq ? usdRaw : 0;
      if (!hasUsdEq && moneda === "USD") {
        usdEquivalente = importe;
      }
      if (!hasUsdEq && moneda === "ARS" && tcBna) {
        usdEquivalente = importe / tcBna;
      }

      return {
        ...line,
        importe,
        moneda,
        usd_equivalente: usdEquivalente,
      };
    });

    const hasArsWithoutUsdEq = normalizedLinesToSave.some((line) => {
      if (line.moneda !== "ARS") return false;
      if (Number(line.importe || 0) === 0) return false;
      return !Number.isFinite(Number(line.usd_equivalente));
    });

    if (hasArsWithoutUsdEq) {
      setEditSaveError(
        "No hay cotizacion BNA disponible para lineas en ARS. Recarga la cotizacion o usa USD.",
      );
      return;
    }

    if (editData.lines.length > 0 && linesToSave.length === 0) {
      setEditSaveError(
        "Debes completar al menos una linea con importe mayor a 0, o eliminar lineas vacias antes de guardar.",
      );
      return;
    }

    setSubmitting(true);
    try {
      // Log changes before updating
      if (editData.fecha !== editingMov.fecha_movimiento) {
        await logMovimientoEdit(
          editingMov.id,
          "caja_admin_movimientos",
          "fecha_movimiento",
          editingMov.fecha_movimiento,
          editData.fecha,
          editData.motivo,
        );
      }
      if (editData.descripcion !== editingMov.descripcion) {
        await logMovimientoEdit(
          editingMov.id,
          "caja_admin_movimientos",
          "descripcion",
          editingMov.descripcion,
          editData.descripcion,
          editData.motivo,
        );
      }
      // Log amount changes?
      // Simple log: "Montos actualizados" if lines changed.
      // For now, let's rely on the mandatory "motivo" for audit.

      const previousUsdTotal = Number(editingMov.usd_equivalente_total || 0);
      const nextUsdTotal =
        normalizedLinesToSave.length > 0
          ? normalizedLinesToSave.reduce(
            (sum, line) => sum + Number(line.usd_equivalente || 0),
            0,
          )
          : Number(editData.totalUsd || 0);

      if (Math.abs(previousUsdTotal - nextUsdTotal) > 0.0001) {
        await logMovimientoEdit(
          editingMov.id,
          "caja_admin_movimientos",
          "usd_equivalente_total",
          String(previousUsdTotal),
          String(nextUsdTotal),
          editData.motivo,
        );
      }

      if (editData.nota !== (editingMov.nota || "")) {
        await logMovimientoEdit(
          editingMov.id,
          "caja_admin_movimientos",
          "nota",
          editingMov.nota || "",
          editData.nota || "",
          editData.motivo,
        );
      }

      const { success, error } = await updateCajaAdminMovimientoSecure({
        movimientoId: editingMov.id,
        fecha_movimiento: editData.fecha,
        descripcion: editData.descripcion,
        nota: editData.nota,
        registro_editado: true,
        lines: normalizedLinesToSave,
        usdTotalOverride: editData.totalUsd,
      });

      if (!success) throw new Error(error);

      await loadData();
      setEditSaveSuccess("Cambios guardados correctamente.");
      setEditingMov(null);
    } catch (err) {
      console.error("Error updating:", err);
      setEditSaveError(
        `Error al actualizar: ${err instanceof Error ? err.message : "desconocido"}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!editingMov) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingMov(null);
        setIsEditModalMinimized(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [editingMov]);

  async function handleSubmit() {
    setFormError(null);

    // Validations
    if (!formData.descripcion.trim()) {
      setFormError("La descripción es requerida");
      return;
    }

    // — Giro Activo: independent path, no lineas needed for balance —
    if (formData.tipo_movimiento === "GIRO_ACTIVO") {
      const montoParsed = parseFloat(giroMonto) || 0;
      if (montoParsed <= 0) {
        setFormError("El monto del giro debe ser mayor a cero");
        return;
      }

      const rateParsed = parseFloat(giroRate);
      if (giroMoneda === 'ARS' && (!giroRate || rateParsed <= 0)) {
        setFormError("Debes especificar la tasa de cambio aplicable (cotización pactada)");
        return;
      }

      const usdEqParsed = giroMoneda === 'ARS' ? (montoParsed / rateParsed) : montoParsed;

      setSubmitting(true);
      // Create a single reference linea (won't affect cash balance since multiplier=0 for GIRO_ACTIVO)
      const cuentaRef = cuentas.find(c => c.moneda === giroMoneda) || cuentas[0];
      const lineas: MovimientoLinea[] = cuentaRef ? [{
        cuenta_id: cuentaRef.id,
        importe: montoParsed,
        moneda: giroMoneda,
        usd_equivalente: usdEqParsed, // raw amount stored here for accumulator queries
      }] : [];
      const { error } = await createMovimiento({
        sucursal_id: sucursal.id,
        tipo_movimiento: "GIRO_ACTIVO",
        subtipo: giroMoneda,    // 'ARS' | 'USD' — used to split totals per currency
        descripcion: formData.descripcion,
        nota: formData.nota || undefined,
        fecha_movimiento: formData.fecha_movimiento,
        adjuntos: adjuntos,
        tc_fuente: giroMoneda === 'ARS' ? "MANUAL" : "N/A",
        tc_bna_venta: rateParsed || undefined,
      }, lineas);
      setSubmitting(false);
      if (error) { setFormError(error.message); return; }
      setShowForm(false);
      setFormData({ tipo_movimiento: "EGRESO", subtipo: "", descripcion: "", nota: "", fecha_movimiento: getLocalISODate() });
      setGiroMonto("");
      setGiroMoneda("ARS");
      setGiroRate("");
      setAdjuntos([]);
      refreshBalance();
      loadData();
      return;
    }

    if (formLineas.length === 0) {
      setFormError("Debe agregar al menos una línea de movimiento");
      return;
    }

    // Check adjunto / Validations
    const requiereAdjunto = categorias.find(c => c.nombre === formData.subtipo)?.requiere_adjunto;
    if (requiereAdjunto && adjuntos.length === 0) {
      // For now, just warn - in production would block
      console.warn("Adjunto obligatorio para este subtipo");
    }

    const normalizedLineas = formLineas.map((line) => {
      const importe = Number(line.importe || 0);
      const moneda = (line.moneda || "").toUpperCase();
      const usdRaw = Number(line.usd_equivalente);
      const hasUsdEq = Number.isFinite(usdRaw);

      let usdEquivalente = hasUsdEq ? usdRaw : 0;
      if (!hasUsdEq && moneda === "USD") {
        usdEquivalente = importe;
      }
      if (!hasUsdEq && moneda === "ARS" && tcBna) {
        usdEquivalente = importe / tcBna;
      }

      return {
        ...line,
        importe,
        moneda,
        usd_equivalente: usdEquivalente,
      };
    });

    const hasArsWithoutUsdEq = normalizedLineas.some((line) => {
      if (line.moneda !== "ARS") return false;
      if (Number(line.importe || 0) === 0) return false;
      return !Number.isFinite(Number(line.usd_equivalente));
    });

    if (hasArsWithoutUsdEq) {
      setFormError(
        "No hay cotizacion BNA disponible para lineas en ARS. Recarga la cotizacion o usa USD.",
      );
      return;
    }

    setSubmitting(true);

    const { error } = await createMovimiento(
      {
        sucursal_id: sucursal.id,
        tipo_movimiento:
          formData.tipo_movimiento as CajaAdminMovimiento["tipo_movimiento"],
        tc_bna_venta: tcBna || undefined,
        subtipo: formData.subtipo || undefined,
        descripcion: formData.descripcion,
        nota: formData.nota || undefined,
        fecha_movimiento: formData.fecha_movimiento,
        adjuntos: adjuntos,
        tc_fuente: tcBna ? "BNA_AUTO" : "N/A",
        tc_fecha_hora: new Date().toISOString(),
      },
      normalizedLineas,
    );

    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    // Reset form
    setShowForm(false);
    setFormData({
      tipo_movimiento: "EGRESO",
      subtipo: "",
      descripcion: "",
      nota: "",
      fecha_movimiento: getLocalISODate(),
    });
    setFormLineas([]);
    setAdjuntos([]);
    // Update balance strip immediately (fast), then full reload in background
    refreshBalance();
    loadData();
  }

  const filteredMovimientos = movimientos.filter((m) => {
    if (
      searchTerm &&
      !m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    if (filterTipo && m.tipo_movimiento !== filterTipo) {
      return false;
    }
    return true;
  });

  type TableRow =
    | { kind: "movimiento"; data: CajaAdminMovimiento; sortTs: string }
    | { kind: "apertura"; data: CajaAdminArqueo; sortTs: string }
    | { kind: "cierre"; data: CajaAdminArqueo; sortTs: string };

  // Show arqueo rows only when toggle is ON and no tipo filter is active
  const arqueoVisible = showArqueos && !filterTipo;

  const unifiedRows: TableRow[] = [
    ...filteredMovimientos.map((m) => ({
      kind: "movimiento" as const,
      data: m,
      sortTs: m.fecha_hora || m.fecha_movimiento + "T12:00:00",
    })),
    ...transfers.map((t) => ({
      kind: "movimiento" as const, // We use kind movement for now to reuse handling
      data: {
        id: t.id,
        fecha_hora: t.fecha_hora,
        fecha_movimiento: t.fecha_hora.split('T')[0],
        tipo_movimiento: t.tipo as any,
        descripcion: t.motivo || t.tipo,
        usd_equivalente_total: t.moneda === 'USD' ? t.monto : (t.monto / (tcBna || 1)),
        estado: 'Registrado',
        nota: t.observaciones,
        adjuntos: t.comprobante_url ? [t.comprobante_url] : [],
        caja_admin_movimiento_lineas: []
      } as any,
      sortTs: t.fecha_hora,
    })),
    ...(arqueoVisible
      ? arqueos.flatMap((a): TableRow[] => {
        const rows: TableRow[] = [];
        if (a.hora_inicio) {
          rows.push({ kind: "apertura", data: a, sortTs: a.hora_inicio });
        }
        if (a.hora_cierre) {
          rows.push({ kind: "cierre", data: a, sortTs: a.hora_cierre });
        }
        return rows;
      })
      : []),
  ].sort((a, b) => b.sortTs.localeCompare(a.sortTs));

  const tiposDisponibles = TIPOS_MOVIMIENTO.filter(
    (t) => !t.onlyUnificada || sucursal.modo_caja === "UNIFICADA",
  );

  // --- Gastos del mes (EGRESO + RETIRO, todas las cuentas, en USD equivalente) ---
  const totalGastosMesUsd = movimientos
    .filter((m) => (m.tipo_movimiento === "EGRESO" || m.tipo_movimiento === "RETIRO") && m.estado !== "Anulado")
    .reduce((sum, m) => sum + (m.usd_equivalente_total || 0), 0) +
    transfers
      .filter(t => t.tipo === "RETIRO" && t.estado === "completado")
      .reduce((sum, t) => sum + (t.moneda === 'USD' ? t.monto : (t.monto / (tcBna || 1))), 0);


  // --- Helper for Privacy Mode ---
  const formatPrivacy = (content: React.ReactNode) => {
    if (!privacyMode) return content;
    return <span className="blur-sm select-none">••••</span>;
  };

  return (
    <div className="space-y-6">

      {/* ── Live Balance Strip ── */}
      {balanceVivo && (
        <div className={`rounded-xl p-4 shadow-sm border transition-colors ${balanceVivo.status === "Cerrado"
          ? "glass-card bg-black/40 border-white/5"
          : "glass-card bg-emerald-500/10 border-emerald-500/20"
          }`}>
          {/* Status header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${balanceVivo.status === "Cerrado" ? "bg-white/10" : "bg-emerald-500/20"
                }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${balanceVivo.status === "Cerrado" ? "bg-slate-400" : "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                  }`} />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">
                  {balanceVivo.status === "Cerrado" ? "Caja Cerrada" : "Jornada Abierta"}
                </p>
                {balanceVivo.lastCloseDate && (
                  <p className="text-xs text-slate-400">
                    {balanceVivo.status === "Cerrado"
                      ? `Último cierre: ${balanceVivo.lastCloseDate}`
                      : `Desde cierre del ${balanceVivo.lastCloseDate}`}
                  </p>
                )}
              </div>
            </div>
            {/* Gastos rápidos */}
            <div className="hidden sm:flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] text-red-400 uppercase font-semibold tracking-wide">Gastos hoy</p>
                <p className="text-sm font-bold text-red-500">
                  {formatPrivacy(`−${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(balanceVivo.gastosTotalesUsd)}`)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Gastos mes</p>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  {formatPrivacy(`−${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalGastosMesUsd)}`)}
                </p>
              </div>
            </div>
          </div>

          {/* Saldos */}
          <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider mb-2">Saldo Actual Estimado</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Efectivo USD */}
            <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-xs font-medium text-slate-300">Efectivo USD</span>
              </div>
              <span className="text-sm font-bold text-white font-mono">
                {formatPrivacy(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(balanceVivo.saldoUsd))}
              </span>
            </div>
            {/* Efectivo ARS */}
            <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-medium text-slate-300">Efectivo ARS</span>
              </div>
              <span className="text-sm font-bold text-white font-mono">
                {formatPrivacy(new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(balanceVivo.saldoArs))}
              </span>
            </div>
            {/* Giro Activo */}
            <div className={`flex justify-between items-center p-3 rounded-xl border border-white/10 ${balanceVivo.giroUsd > 0
              ? "bg-amber-500/10"
              : "bg-white/5"
              }`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${balanceVivo.giroUsd > 0 ? "bg-amber-400" : "bg-slate-500"}`} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Giro Activo</span>
              </div>
              <span className={`text-sm font-bold font-mono ${balanceVivo.giroUsd > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>
                {balanceVivo.giroUsd > 0
                  ? formatPrivacy(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(balanceVivo.giroUsd))
                  : "Sin deuda"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Month Selector */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-500 pointer-events-none" />
            <Input
              type="month"
              value={mesActual}
              onChange={(e) => setMesActual(e.target.value)}
              className="pl-10 h-10 w-full rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm focus-visible:ring-indigo-500"
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm focus-visible:ring-indigo-500"
            />
          </div>

          {/* Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="pl-10 pr-8 py-2 bg-white dark:bg-slate-800 rounded-xl text-sm border border-slate-200 dark:border-slate-700 appearance-none"
            >
              <option value="">Todos los tipos</option>
              {tiposDisponibles.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Share Summary Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const summary = getMonthlySummary();
              window.open(
                `https://wa.me/?text=${encodeURIComponent(summary)}`,
                "_blank",
              );
            }}
            className="rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-200"
            title="Enviar Resumen del Mes por WhatsApp"
          >
            <Share2 className="w-5 h-5" />
          </Button>

          {/* Arqueos Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowArqueos(!showArqueos)}
            className={`rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 ${showArqueos ? "text-indigo-600" : "text-slate-400"}`}
            title={
              showArqueos
                ? "Ocultar aperturas y cierres"
                : "Mostrar aperturas y cierres"
            }
          >
            <BookOpen className="w-5 h-5" />
          </Button>

          {/* Privacy Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPrivacyMode(!privacyMode)}
            className="rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200"
            title={
              privacyMode ? "Mostrar montos" : "Ocultar montos (Modo Discreto)"
            }
          >
            {privacyMode ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Edicion de montos: solo Admin/Dueno
            </span>
          </div>

          {(role === "owner" || role === "admin") && (
            <Button
              onClick={() => {
                if (!isCajaAbierta) {
                  alert("La caja administrativa no está abierta para hoy. Debes abrirla en la pestaña 'Inicio / Cierre' para registrar movimientos.");
                  return;
                }
                setShowForm(true);
              }}
              disabled={!isCajaAbierta}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:saturate-50"
            >
              <Plus className="w-5 h-5" />
              Nuevo Movimiento
            </Button>
          )}
        </div>
      </div>

      {!isCajaAbierta && !loading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-3 text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Caja Cerrada:</span> No puedes registrar nuevos movimientos porque la caja administrativa de hoy aún no ha sido iniciada o ya fue cerrada. Dirígete a la pestaña <b>Inicio / Cierre</b> para comenzar.
          </div>
        </motion.div>
      )}

      {/* New Movement Form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black bg-gradient-to-r from-slate-900 to-slate-500 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">
                Nuevo Movimiento
              </h3>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-[0.2em] mt-1">Registrar transacción administrativa</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-red-500 transition-colors rounded-xl bg-slate-100 dark:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 p-6 bg-slate-50/50 dark:bg-slate-900/40 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                Tipo de Operación
              </label>
              <select
                value={formData.tipo_movimiento}
                onChange={(e) =>
                  setFormData({ ...formData, tipo_movimiento: e.target.value })
                }
                className="w-full px-4 py-2.5 text-sm font-bold rounded-2xl border-none ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-950 h-11 focus:ring-2 ring-indigo-500 transition-all shadow-sm"
              >
                {tiposDisponibles.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {formData.tipo_movimiento !== "GIRO_ACTIVO" && (
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                  Categoría
                </label>
                <select
                  value={formData.subtipo}
                  onChange={(e) =>
                    setFormData({ ...formData, subtipo: e.target.value })
                  }
                  className="w-full px-4 py-2.5 text-sm font-bold rounded-2xl border-none ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-950 h-11 focus:ring-2 ring-indigo-500 transition-all shadow-sm"
                >
                  <option value="" disabled>Seleccionar...</option>
                  {categorias
                    .filter(c => c.tipo_movimiento === formData.tipo_movimiento)
                    .map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.nombre} {c.requiere_adjunto ? "📎" : ""}
                      </option>
                    ))}
                  {categorias.filter(c => c.tipo_movimiento === formData.tipo_movimiento).length === 0 && (
                    <option value="" disabled>Sin categorías</option>
                  )}
                </select>
              </div>
            )}

            <div className={formData.tipo_movimiento === "GIRO_ACTIVO" ? "md:col-span-1" : ""}>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                Fecha Registro
              </label>
              <Input
                type="date"
                value={formData.fecha_movimiento}
                onChange={(e) =>
                  setFormData({ ...formData, fecha_movimiento: e.target.value })
                }
                className="w-full px-4 py-2.5 text-sm font-bold rounded-2xl border-none ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-950 h-11 focus:ring-2 ring-indigo-500 transition-all shadow-sm"
                required
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                Descripción / Glosa
              </label>
              <Input
                type="text"
                value={formData.descripcion}
                onChange={(e) =>
                  setFormData({ ...formData, descripcion: e.target.value })
                }
                placeholder="Ej. Pago de servicios, compra insumos..."
                className="w-full px-4 py-2.5 text-sm font-bold rounded-2xl border-none ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-950 h-11 focus:ring-2 ring-indigo-500 transition-all shadow-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                Notas / Observaciones (Opcional)
              </label>
              <Textarea
                value={formData.nota}
                onChange={(e) =>
                  setFormData({ ...formData, nota: e.target.value })
                }
                placeholder="Detalle adicional del pago, transferencia o gasto..."
                className="w-full px-4 py-2.5 text-sm font-bold rounded-2xl border-none ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-950 min-h-[80px] focus:ring-2 ring-indigo-500 transition-all shadow-sm"
              />
            </div>
          </div>

          {/* Lines / Giro Activo amount section */}
          <div className="mb-6">
            {formData.tipo_movimiento !== "GIRO_ACTIVO" && (
              <div className="flex items-center justify-between mb-4 px-2">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">
                  Detalle de Líneas
                </label>
                {formData.tipo_movimiento !== "CAMBIO_MONEDA" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addLinea}
                    className="text-[11px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl px-4 py-2 h-auto"
                  >
                    <Plus className="w-3 h-3 mr-2" />
                    Agregar cuenta
                  </Button>
                )}
              </div>
            )}
            {formData.tipo_movimiento === "GIRO_ACTIVO" ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-gradient-to-br from-amber-500/5 to-orange-500/5 dark:from-amber-500/10 dark:to-orange-500/20 backdrop-blur-xl rounded-3xl border border-amber-500/20 dark:border-amber-500/30 shadow-2xl shadow-amber-500/5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <ArrowRightLeft className="w-24 h-24 text-amber-500 rotate-12" />
                </div>

                <div className="relative flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-[1.5]">
                    <label className="block text-[10px] font-black text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-[0.2em]">
                      Monto del Giro
                    </label>
                    <div className="flex gap-3 h-14">
                      <select
                        value={giroMoneda}
                        onChange={(e) => setGiroMoneda(e.target.value as 'ARS' | 'USD')}
                        className="w-24 px-3 rounded-2xl border border-amber-200/50 dark:border-amber-700/50 bg-white/50 dark:bg-slate-900/50 text-base font-bold text-amber-900 dark:text-amber-100 focus:ring-2 ring-amber-500/20 outline-none transition-all"
                      >
                        <option value="ARS">AR$</option>
                        <option value="USD">U$D</option>
                      </select>
                      <div className="relative flex-1">
                        <MoneyInput
                          value={Number(giroMonto) || 0}
                          onChange={(val) => setGiroMonto(String(val))}
                          placeholder="0"
                          className="w-full h-14 text-2xl font-black border-amber-200/50 dark:border-amber-700/50 bg-white dark:bg-slate-950 rounded-2xl shadow-inner focus:ring-2 ring-amber-500/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {giroMoneda === 'ARS' && (
                    <div className="flex-[1.2]">
                      <label className="block text-[10px] font-black text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-[0.2em]">
                        Tasa Pactada
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                          $
                        </span>
                        <MoneyInput
                          value={Number(giroRate) || 0}
                          onChange={(val) => setGiroRate(String(val))}
                          placeholder="0"
                          className="w-full h-14 text-xl font-bold border-amber-200/50 dark:border-amber-700/50 pl-10 bg-white dark:bg-slate-950 rounded-2xl shadow-inner focus:ring-2 ring-amber-500/20 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex-[2] pt-2 md:pt-6">
                    <div className="px-6 py-3 bg-amber-500/10 dark:bg-amber-500/20 rounded-2xl border border-amber-500/20 flex items-center justify-between min-h-[56px] group transition-all hover:bg-amber-500/15">
                      {giroMoneda === 'ARS' && Number(giroMonto) > 0 && Number(giroRate) > 0 ? (
                        <>
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-black uppercase tracking-widest">Equivale a:</span>
                          <span className="text-2xl font-black text-amber-600 dark:text-amber-300 drop-shadow-sm">
                            U$D {(Number(giroMonto) / Number(giroRate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4 opacity-50" />
                          <span className="text-[11px] font-bold uppercase tracking-tighter">Deuda (No afecta saldos de caja)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : formData.tipo_movimiento === "CAMBIO_MONEDA" ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 dark:from-cyan-500/10 dark:to-blue-600/20 backdrop-blur-xl rounded-3xl border border-cyan-500/20 dark:border-cyan-500/30 shadow-2xl shadow-cyan-500/5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <RefreshCw className="w-32 h-32 text-cyan-500 rotate-45" />
                </div>

                <div className="relative flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-[1.5]">
                    <label className="block text-[10px] font-black text-cyan-600 dark:text-cyan-400 mb-2 uppercase tracking-[0.2em]">
                      Monto a Cambiar
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-[55%] text-cyan-500/50 font-black text-lg">U$D</span>
                      <MoneyInput
                        value={Number(exchangeAmountUSD) || 0}
                        onChange={(val) => setExchangeAmountUSD(String(val))}
                        placeholder="0"
                        className="w-full h-16 text-3xl font-black pl-16 bg-white dark:bg-slate-950 border-cyan-200/50 dark:border-cyan-800/50 rounded-2xl shadow-inner focus:ring-4 ring-cyan-500/10 transition-all text-cyan-600 dark:text-cyan-400"
                      />
                    </div>
                  </div>

                  <div className="flex-[1.2]">
                    <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-[0.2em]">
                      Cotización <span className="text-[9px] lowercase font-medium ml-1 opacity-60">(Oficial: ${tcBna})</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-[55%] text-slate-300 font-black text-lg">AR$</span>
                      <MoneyInput
                        value={Number(manualRate) || tcBna || 0}
                        onChange={(val) => setManualRate(String(val))}
                        placeholder={tcBna ? String(tcBna) : "0"}
                        className="w-full h-14 text-xl font-bold pl-12 bg-white dark:bg-slate-950 border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-inner focus:ring-4 ring-blue-500/10 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex-[2] pt-2 md:pt-6">
                    <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/20 flex flex-col justify-center min-h-[70px] relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      <div className="flex justify-between items-center relative z-10">
                        <span className="text-[10px] text-blue-100 font-black uppercase tracking-[0.2em]">Recibir</span>
                        <div className="flex flex-col items-end">
                          <span className="text-2xl font-black text-white leading-none">
                            {new Intl.NumberFormat("es-AR", {
                              style: "currency",
                              currency: "ARS",
                              maximumFractionDigits: 0
                            }).format(
                              (parseFloat(exchangeAmountUSD) || 0) *
                              (parseFloat(manualRate) || tcBna || 0),
                            )}
                          </span>
                          <span className="text-[10px] text-blue-200 mt-1 font-medium opacity-80 italic">ARS Físico</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <details className="mt-4 group">
                  <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-cyan-500 transition-colors uppercase font-bold tracking-widest list-none flex items-center gap-1">
                    <Settings className="w-3 h-3" />
                    Auditoría de Cajas (Técnico)
                  </summary>
                  <div className="mt-2 p-3 bg-white/50 dark:bg-black/20 rounded-xl text-[10px] text-slate-500 grid grid-cols-2 gap-4 border border-slate-100 dark:border-white/5">
                    <div>
                      <span className="block font-bold text-red-400">EGRESO:</span>
                      Caja USD Físico: <b>-U$D {Number(exchangeAmountUSD) || 0}</b>
                    </div>
                    <div>
                      <span className="block font-bold text-green-400">INGRESO:</span>
                      Caja ARS Físico: <b>+AR$ {((parseFloat(exchangeAmountUSD) || 0) * (parseFloat(manualRate) || tcBna || 0)).toLocaleString('es-AR')}</b>
                    </div>
                  </div>
                </details>
              </motion.div>
            ) : formLineas.length === 0 ? (
              <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No hay líneas. Agregue al menos una.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formLineas.map((linea, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl"
                  >
                    <select
                      value={getMetodoForCuentaId(linea.cuenta_id)}
                      onChange={(e) =>
                        handleMetodoChangeForNewLine(
                          idx,
                          e.target.value as MetodoPagoUI,
                        )
                      }
                      className="w-36 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                      title="Metodo de pago"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="OTRO">Otro</option>
                    </select>
                    <select
                      value={linea.cuenta_id}
                      onChange={(e) =>
                        updateLinea(idx, { cuenta_id: e.target.value })
                      }
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    >
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre_cuenta} ({c.moneda})
                        </option>
                      ))}
                    </select>
                    <MoneyInput
                      value={linea.importe}
                      onChange={(val) =>
                        updateLinea(idx, {
                          importe: Math.abs(val),
                        })
                      }
                      placeholder="0"
                      className="w-32"
                    />
                    <span className="text-sm text-slate-500 w-12">
                      {linea.moneda}
                    </span>
                    {linea.usd_equivalente !== undefined &&
                      linea.moneda !== "USD" && (
                        <span className="text-sm text-green-600">
                          ≈ ${linea.usd_equivalente.toFixed(2)} USD
                        </span>
                      )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLinea(idx)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Adjunto warning */}
          {categorias.find(c => c.nombre === formData.subtipo)?.requiere_adjunto && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-4">
              <Paperclip className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-700 dark:text-amber-400">
                Este subtipo requiere adjuntar comprobante
              </span>
            </div>
          )}

          {/* Comprobante Upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Adjuntar Comprobantes (opcional)
            </label>

            {/* Lista de adjuntos */}
            {adjuntos.length > 0 && (
              <div className="mb-3 space-y-2">
                {adjuntos.map((url, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      <ComprobanteLink
                        storedValue={url}
                        area="caja-admin"
                        className="text-sm text-indigo-600 hover:text-indigo-500 truncate"
                        iconSize={14}
                        label={`Ver adjunto ${idx + 1}`}
                        showLabel
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setAdjuntos(adjuntos.filter((_, i) => i !== idx))
                      }
                      className="text-red-500 hover:text-red-600 h-6 w-6"
                      title="Eliminar adjunto"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <ComprobanteUpload
              area="caja-admin"
              onUploadComplete={(result) => {
                setAdjuntos([...adjuntos, result.path || result.url]);
              }}
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-700 dark:text-red-400">
                {formError}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-slate-600 hover:text-slate-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-indigo-700"
            >
              {submitting ? "Guardando..." : "Guardar Movimiento"}
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Movements Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
            Cargando movimientos...
          </div>
        ) : unifiedRows.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay movimientos para este período</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">
                  Fecha
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">
                  Tipo
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">
                  Descripción
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">
                  Subtipo
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase">
                  Monto ARS
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase">
                  Monto USD
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase">
                  Equiv. USD
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase">
                  Estado
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {unifiedRows.map((row) => {
                if (row.kind === "apertura") {
                  const a = row.data;
                  return (
                    <motion.tr
                      key={`apertura-${a.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-teal-50/40 dark:bg-teal-900/10 hover:bg-teal-50/70 dark:hover:bg-teal-900/20 border-l-2 border-teal-400 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {a.hora_inicio
                          ? new Date(a.hora_inicio).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                          : a.fecha}
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                          APERTURA
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                        Apertura de caja{a.usuario ? ` · ${a.usuario}` : ""}
                      </td>
                      <td className="px-6 py-3 text-sm text-center text-slate-300">—</td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-blue-600 dark:text-blue-400">
                        {(() => {
                          let total = 0;
                          Object.entries(a.saldos_iniciales || {}).forEach(([id, val]) => {
                            if (cuentas.find(c => c.id === id)?.moneda === 'ARS') total += Number(val);
                          });
                          return total !== 0 ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total) : "—";
                        })()}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-slate-600 dark:text-slate-300">
                        {(() => {
                          let total = 0;
                          Object.entries(a.saldos_iniciales || {}).forEach(([id, val]) => {
                            if (cuentas.find(c => c.id === id)?.moneda === 'USD') total += Number(val);
                          });
                          return total !== 0 ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";
                        })()}
                      </td>
                      <td className="px-6 py-3 text-sm text-center text-slate-300">—</td>
                      <td className="px-6 py-3 text-center">
                        <PlayCircle className="w-5 h-5 text-teal-500 mx-auto" />
                      </td>
                      <td className="px-6 py-3 text-center text-slate-300">—</td>
                    </motion.tr>
                  );
                }

                if (row.kind === "cierre") {
                  const a = row.data;
                  const dif = a.diferencia_usd ?? 0;
                  return (
                    <motion.tr
                      key={`cierre-${a.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-slate-100/60 dark:bg-slate-900/30 hover:bg-slate-100/90 dark:hover:bg-slate-900/50 border-l-2 border-slate-400 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {a.hora_cierre
                          ? new Date(a.hora_cierre).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                          : a.fecha}
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          CIERRE
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                        Cierre de caja{a.usuario ? ` · ${a.usuario}` : ""}
                      </td>
                      <td className="px-6 py-3 text-sm text-center text-slate-300">—</td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-blue-600 dark:text-blue-400">
                        {(() => {
                          let total = 0;
                          Object.entries(a.saldos_finales || {}).forEach(([id, val]) => {
                            if (cuentas.find(c => c.id === id)?.moneda === 'ARS') total += Number(val);
                          });
                          return total !== 0 ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total) : "—";
                        })()}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-slate-600 dark:text-slate-300">
                        {(() => {
                          let total = 0;
                          Object.entries(a.saldos_finales || {}).forEach(([id, val]) => {
                            if (cuentas.find(c => c.id === id)?.moneda === 'USD') total += Number(val);
                          });
                          return total !== 0 ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";
                        })()}
                      </td>
                      <td className="px-6 py-3 text-sm text-center">
                        {dif !== 0 ? (
                          <span className={`font-medium text-xs ${dif > 0 ? "text-green-600" : "text-red-500"}`}>
                            Dif: {dif > 0 ? "+" : ""}${dif.toFixed(1)} USD
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <Lock className="w-5 h-5 text-slate-400 mx-auto" />
                      </td>
                      <td className="px-6 py-3 text-center text-slate-300">—</td>
                    </motion.tr>
                  );
                }

                // kind === "movimiento"
                const mov = row.data;
                return (
                  <motion.tr
                    key={mov.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm">
                      {new Date(mov.fecha_hora).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${mov.tipo_movimiento === "EGRESO"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : mov.tipo_movimiento.includes("INGRESO")
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : mov.tipo_movimiento === "APORTE_CAPITAL"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : mov.tipo_movimiento === "GIRO_ACTIVO"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}
                      >
                        {mov.tipo_movimiento === "GIRO_ACTIVO" ? "GIRO ACTIVO" : mov.tipo_movimiento.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      <div>{mov.descripcion}</div>
                      {mov.nota && (
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-normal line-clamp-1 italic" title={mov.nota}>
                          {mov.nota}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {mov.subtipo || "-"}
                    </td>
                    {(() => {
                      let finalArs = (mov.caja_admin_movimiento_lineas || [])
                        .filter(l => l.moneda === 'ARS')
                        .reduce((sum, l) => sum + Number(l.importe || 0), 0);

                      let finalUsd = (mov.caja_admin_movimiento_lineas || [])
                        .filter(l => l.moneda === 'USD')
                        .reduce((sum, l) => sum + Number(l.importe || 0), 0);

                      // Fallback for movements without lines (e.g. historical/imported data)
                      if (finalArs === 0 && finalUsd === 0 && mov.usd_equivalente_total) {
                        const usdTotal = Number(mov.usd_equivalente_total);
                        const tc = Number(mov.tc_bna_venta || 0);
                        if (tc > 1) {
                          finalArs = usdTotal * tc;
                        } else {
                          finalUsd = usdTotal;
                        }
                      }

                      const isExpense = mov.tipo_movimiento === 'EGRESO' || mov.tipo_movimiento === 'RETIRO' || mov.tipo_movimiento === 'GIRO_ACTIVO';
                      const signMultiplier = (isExpense && Number(mov.usd_equivalente_total || 0) >= 0) ? -1 : 1;

                      const displayArs = finalArs * signMultiplier;
                      const displayUsd = finalUsd * signMultiplier;

                      return (
                        <>
                          <td className={`px-6 py-4 text-sm text-right font-mono ${displayArs < 0 ? 'text-red-500 font-bold' : 'text-blue-600 dark:text-blue-400'}`}>
                            {formatPrivacy(
                              finalArs !== 0 ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(displayArs) : "—"
                            )}
                          </td>
                          <td className={`px-6 py-4 text-sm text-right font-mono ${displayUsd < 0 ? 'text-red-500 font-bold' : 'text-slate-600 dark:text-slate-300'}`}>
                            {formatPrivacy(
                              finalUsd !== 0 ? `$${displayUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"
                            )}
                          </td>
                          <td className={`px-6 py-4 text-sm text-center font-mono text-xs italic ${signMultiplier < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {formatPrivacy(
                              mov.usd_equivalente_total
                                ? `$${(Number(mov.usd_equivalente_total) * signMultiplier).toLocaleString("en-US", { minimumFractionDigits: 1 })} equiv.`
                                : "—"
                            )}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-6 py-4 text-center">
                      {mov.estado === "Registrado" ? (
                        <Check className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-red-500 mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {(mov as { registro_editado?: boolean })
                          .registro_editado && (
                            <span title="Este registro ha sido editado">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            </span>
                          )}
                        {(mov as { origen?: string }).origen ===
                          "importado_csv" && (
                            <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                              CSV
                            </span>
                          )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setHistorialMovId(mov.id)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          title="Ver historial de ediciones"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        {canEditAdminAmounts && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const movConComprobante =
                                mov as CajaAdminMovimiento & {
                                  url_comprobante?: string | null;
                                };
                              const currentLines = (
                                mov.caja_admin_movimiento_lineas ||
                                mov.lineas ||
                                []
                              ).map((line) => ({
                                ...line,
                                importe: Math.abs(Number(line.importe || 0)),
                                usd_equivalente:
                                  line.usd_equivalente ??
                                  (line.moneda === "USD"
                                    ? Number(line.importe || 0)
                                    : 0),
                              }));
                              setEditingMov(mov);
                              setIsEditModalMinimized(false);
                              setEditSaveError(null);
                              setEditSaveSuccess(null);
                              setEditData({
                                fecha: mov.fecha_movimiento,
                                descripcion: mov.descripcion,
                                motivo: "",
                                lines: currentLines,
                                adjuntos:
                                  mov.adjuntos ||
                                  (movConComprobante.url_comprobante
                                    ? [movConComprobante.url_comprobante]
                                    : []),
                                totalUsd: Number(mov.usd_equivalente_total || 0),
                                nota: mov.nota || "",
                              });
                            }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Editar movimiento"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {(role === "admin" || role === "owner") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingMovId(mov.id);
                              setDeletionConfirmation("");
                              setDeletionReason("");
                            }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Eliminar movimiento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {deletingMovId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-red-100 dark:border-red-900/30"
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-8 h-8" />
                <h3 className="text-xl font-bold">¡Advertencia Crítica!</h3>
              </div>

              <p className="text-slate-600 dark:text-slate-300 mb-4">
                Está a punto de eliminar un registro financiero. Esta acción es{" "}
                <strong>IRREVERSIBLE</strong> y quedará registrada en el
                historial de auditoría.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Motivo de la eliminación (Obligatorio)
                  </label>
                  <Textarea
                    value={deletionReason}
                    onChange={(e) => setDeletionReason(e.target.value)}
                    className="w-full px-3 py-2 border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 focus-visible:ring-red-500"
                    rows={2}
                    placeholder="Ej: Error de carga, registro duplicado..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Para confirmar, escriba{" "}
                    <span className="font-mono font-bold select-all">
                      ELIMINAR
                    </span>{" "}
                    abajo:
                  </label>
                  <Input
                    type="text"
                    value={deletionConfirmation}
                    onChange={(e) => setDeletionConfirmation(e.target.value)}
                    className="w-full px-3 py-2 border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 focus-visible:ring-red-500 font-mono"
                    placeholder="ELIMINAR"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <Button
                  variant="ghost"
                  onClick={() => setDeletingMovId(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    if (
                      deletionConfirmation !== "ELIMINAR" ||
                      !deletionReason.trim()
                    )
                      return;

                    // Temporary: fetch user here.
                    const {
                      data: { user },
                    } = await createClient().auth.getUser();
                    if (!user) {
                      alert("Sesión no válida");
                      return;
                    }

                    const { success, error } = await deleteMovimiento(
                      deletingMovId,
                      user.id,
                      deletionReason,
                    );
                    if (success) {
                      setDeletingMovId(null);
                      loadData();
                    } else {
                      alert("Error al eliminar: " + error);
                    }
                  }}
                  disabled={
                    deletionConfirmation !== "ELIMINAR" ||
                    !deletionReason.trim()
                  }
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirmar Eliminación
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Historial de Ediciones Modal */}
      <HistorialEdicionesModal
        isOpen={!!historialMovId}
        onClose={() => setHistorialMovId(null)}
        registroId={historialMovId || ""}
        tabla="caja_admin_movimientos"
      />

      {/* Modal de Edición */}
      {editingMov && !isEditModalMinimized && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditingMov(null);
            setIsEditModalMinimized(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-500" />
                Editar Movimiento
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditModalMinimized(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
                  title="Minimizar"
                >
                  <Minus size={14} />
                  Minimizar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingMov(null);
                    setIsEditModalMinimized(false);
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </Button>
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 flex items-start gap-2 text-xs text-red-800 dark:text-red-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>
                  Modo auditoria: edicion de montos habilitada solo para
                  Admin/Dueno. Todo cambio queda registrado con motivo
                  obligatorio.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Fecha del movimiento
                </label>
                <Input
                  type="date"
                  value={editData.fecha}
                  onChange={(e) =>
                    setEditData({ ...editData, fecha: e.target.value })
                  }
                  className="w-full px-4 py-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Descripción
                </label>
                <Input
                  type="text"
                  value={editData.descripcion}
                  onChange={(e) =>
                    setEditData({ ...editData, descripcion: e.target.value })
                  }
                  className="w-full px-4 py-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Notas / Observaciones (Opcional)
                </label>
                <Textarea
                  value={editData.nota}
                  onChange={(e) =>
                    setEditData({ ...editData, nota: e.target.value })
                  }
                  placeholder="Detalle adicional..."
                  className="w-full px-4 py-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-[80px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 font-bold text-red-500">
                  Motivo del cambio (Obligatorio)
                </label>
                <Textarea
                  value={editData.motivo}
                  onChange={(e) =>
                    setEditData({ ...editData, motivo: e.target.value })
                  }
                  placeholder="Explique por qué se realiza este cambio..."
                  className="w-full px-4 py-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-[80px]"
                />
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>
                  Este cambio quedará registrado permanentemente en el historial
                  de auditoría.
                </p>
              </div>

              {/* Lines Editing */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Montos / Lineas
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addEditLinea}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar linea
                  </Button>
                </div>
                <div className="space-y-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl max-h-48 overflow-y-auto">
                  <p className="text-[11px] text-slate-500">
                    Para cambiar metodo de pago (ej. Efectivo a Transferencia),
                    cambia la cuenta de la linea.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Las lineas con importe 0 se ignoran automaticamente al
                    guardar.
                  </p>
                  {editData.lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={getMetodoForCuentaId(line.cuenta_id)}
                        onChange={(e) =>
                          handleMetodoChangeForEditLine(
                            idx,
                            e.target.value as MetodoPagoUI,
                          )
                        }
                        className="w-32 px-2 py-1 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                        title="Metodo de pago"
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="TARJETA">Tarjeta</option>
                        <option value="OTRO">Otro</option>
                      </select>
                      <select
                        value={line.cuenta_id}
                        onChange={(e) =>
                          updateEditLinea(idx, { cuenta_id: e.target.value })
                        }
                        className="flex-1 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                      >
                        {cuentas.map((cuenta) => (
                          <option key={cuenta.id} value={cuenta.id}>
                            {cuenta.nombre_cuenta} ({cuenta.moneda})
                          </option>
                        ))}
                      </select>
                      <MoneyInput
                        value={line.importe}
                        onChange={(val) => {
                          const allowNegative = [
                            "CAMBIO_MONEDA",
                            "TRANSFERENCIA",
                            "AJUSTE_CAJA",
                          ].includes(editingMov?.tipo_movimiento || "");
                          const newImporte = allowNegative
                            ? val
                            : Math.abs(val);
                          updateEditLinea(idx, { importe: newImporte });
                        }}
                        className="w-28"
                        currency={line.moneda}
                      />
                      <span className="text-xs font-mono text-slate-500 w-10 text-center">
                        {line.moneda}
                      </span>
                      {line.moneda !== "USD" && (
                        <span className="text-xs text-green-600">
                          ≈ ${line.usd_equivalente?.toFixed(2)} USD
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEditLinea(idx)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        title="Quitar linea"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {editData.lines.length === 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400 text-center">
                        No hay lineas asociadas. Puedes agregar lineas o editar
                        el total en USD.
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 w-12">
                          USD
                        </span>
                        <MoneyInput
                          value={editData.totalUsd}
                          onChange={(val) =>
                            setEditData({
                              ...editData,
                              totalUsd: Math.max(0, val),
                            })
                          }
                          className="flex-1"
                          currency="USD"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 shrink-0 bg-white dark:bg-slate-800">
              <span className="mr-auto hidden sm:inline-flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 font-medium">
                <AlertTriangle size={12} />
                Se guarda en historial de auditoria
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingMov(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleUpdate}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
            {(editSaveError || editSaveSuccess) && (
              <div className="px-4 md:px-6 pb-4">
                {editSaveError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                    {editSaveError}
                  </p>
                )}
                {editSaveSuccess && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {editSaveSuccess}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {editingMov && isEditModalMinimized && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 w-[300px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Edicion minimizada
              </p>
              <p className="text-xs text-slate-500 truncate">
                {editingMov.descripcion}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditingMov(null);
                setIsEditModalMinimized(false);
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
            >
              <X size={16} className="text-slate-500" />
            </Button>
          </div>

          <Button
            onClick={() => setIsEditModalMinimized(false)}
            className="mt-3 w-full px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Restaurar edicion
          </Button>
        </div>
      )}
    </div>
  );
}
