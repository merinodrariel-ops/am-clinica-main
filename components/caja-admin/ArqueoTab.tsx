'use client';

import { useState, useEffect } from 'react';
import {
    Lock,
    AlertTriangle,
    Loader2,
    PlayCircle,
    CheckCircle
} from 'lucide-react';
import {
    type Sucursal,
    type CajaAdminArqueo,
    type CuentaFinanciera,
    getCuentas,
    getUltimoCierreAdmin,
    getAperturaAdminDelDia,
    abrirCajaAdminDelDia,
    getCurrentBalanceAdmin,
    cerrarCajaAdmin
} from '@/lib/caja-admin';
import { useAuth } from '@/contexts/AuthContext';
import { getLocalISODate, formatDateForLocale } from '@/lib/local-date';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
}

export default function ArqueoTab({ sucursal, tcBna }: Props) {
    const [cierreHoy, setCierreHoy] = useState<CajaAdminArqueo | null>(null);
    const [aperturaHoy, setAperturaHoy] = useState<CajaAdminArqueo | null>(null);
    const [ultimoCierre, setUltimoCierre] = useState<CajaAdminArqueo | null>(null);
    const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
    const [loading, setLoading] = useState(true);
    const [saldos, setSaldos] = useState<Record<string, number>>({});
    const [observaciones, setObservaciones] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [opening, setOpening] = useState(false);
    const [showAbrirModal, setShowAbrirModal] = useState(false);
    const [showCerrarModal, setShowCerrarModal] = useState(false);
    const [saldosIniciales, setSaldosIniciales] = useState<Record<string, number>>({});
    const [expectedBalances, setExpectedBalances] = useState<Record<string, number>>({});


    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sucursal.id]);

    async function loadData() {
        setLoading(true);
        try {
            const today = getLocalISODate();
            const [cuentasData, cierreData, aperturaData, balanceActual] = await Promise.all([
                getCuentas(sucursal.id),
                getUltimoCierreAdmin(sucursal.id),
                getAperturaAdminDelDia(sucursal.id, today),
                getCurrentBalanceAdmin(sucursal.id),
            ]);
            setCuentas(cuentasData);

            // Priority: If there is an open session, it's "Open".
            // Even if there's a closure for today, a new session might have been started.
            const isTodayClosed = cierreData && cierreData.fecha === today;
            const hasActiveApertura = aperturaData && aperturaData.estado === 'Abierto';

            if (hasActiveApertura) {
                // We have an active session
                setAperturaHoy(aperturaData);
                setCierreHoy(null);
                setUltimoCierre(cierreData && cierreData.fecha !== today ? cierreData : await getUltimoCierreAdmin(sucursal.id, today));
            } else if (isTodayClosed) {
                // No active session, but today was closed
                setCierreHoy(cierreData);
                setAperturaHoy(null);
                const prev = await getUltimoCierreAdmin(sucursal.id, today);
                setUltimoCierre(prev);
            } else {
                // No sessions today yet
                setCierreHoy(null);
                setAperturaHoy(null);
                setUltimoCierre(cierreData);
            }

            setExpectedBalances(balanceActual.saldosPorCuenta);

            // Initialize saldos inputs with expected values
            const formInit: Record<string, number> = {};
            cuentasData.forEach(c => {
                if (c.tipo_cuenta === 'EFECTIVO') {
                    // Pre-fill with expected balance to help the user
                    formInit[c.id] = balanceActual.saldosPorCuenta[c.id] || 0;
                }
            });
            setSaldos(formInit);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAbrir() {
        setOpening(true);
        try {
            const today = getLocalISODate();
            await abrirCajaAdminDelDia({
                sucursalId: sucursal.id,
                fecha: today,
                usuario: profile?.full_name || user?.email || 'Admin',
                tcBna: tcBna || null,
            });
            setShowAbrirModal(false);
            await loadData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setOpening(false);
        }
    }

    async function handleCerrar() {
        setSubmitting(true);
        try {
            // Calculate totals
            const totalCountedUsdEq = cuentas.reduce((sum, c) => {
                const val = saldos[c.id] || 0;
                if (c.tipo_cuenta !== 'EFECTIVO') return sum;
                if (c.moneda === 'USD') return sum + val;
                if (c.moneda === 'ARS' && tcBna) return sum + (val / tcBna);
                return sum;
            }, 0);

            // Fetch current expected balances
            const balanceActualNow = await getCurrentBalanceAdmin(sucursal.id);
            const totalExpectedUsdEq = cuentas.reduce((sum, c) => {
                const val = balanceActualNow.saldosPorCuenta[c.id] || 0;
                if (c.tipo_cuenta !== 'EFECTIVO') return sum;
                if (c.moneda === 'USD') return sum + val;
                if (c.moneda === 'ARS' && tcBna) return sum + (val / tcBna);
                return sum;
            }, 0);

            const { success, error } = await cerrarCajaAdmin({
                sucursalId: sucursal.id,
                fecha: getLocalISODate(),
                usuario: profile?.full_name || user?.email || 'Admin',
                saldosFinales: saldos,
                saldoFinalUsdEq: totalCountedUsdEq,
                diferenciaUsd: totalCountedUsdEq - totalExpectedUsdEq,
                tcBna: tcBna || 0,
                observaciones,
                snapshot: {
                    cuentas: cuentas,
                    saldos_count: saldos,
                    expected: balanceActualNow.saldosPorCuenta
                },
                saldosIniciales: !ultimoCierre ? saldosIniciales : undefined,
            });

            if (!success) throw new Error(error);

            setShowCerrarModal(false);
            loadData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setSubmitting(false);
        }
    }

    const { role, profile, user } = useAuth();

    if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

    const totalExpectedUsdEq = cuentas.reduce((sum, c) => {
        const val = expectedBalances[c.id] || 0;
        if (c.tipo_cuenta !== 'EFECTIVO') return sum;
        if (c.moneda === 'USD') return sum + val;
        if (c.moneda === 'ARS' && tcBna) return sum + (val / tcBna);
        return sum;
    }, 0);

    const totalCountedUsdEqCurrent = cuentas.reduce((sum, c) => {
        const val = saldos[c.id] || 0;
        if (c.tipo_cuenta !== 'EFECTIVO') return sum;
        if (c.moneda === 'USD') return sum + val;
        if (c.moneda === 'ARS' && tcBna) return sum + (val / tcBna);
        return sum;
    }, 0);

    const aperturaSugeridaArs = cuentas
        .filter(c => c.tipo_cuenta === 'EFECTIVO' && c.moneda === 'ARS')
        .reduce((sum, c) => sum + Number(ultimoCierre?.saldos_finales?.[c.id] || 0), 0);

    const aperturaSugeridaUsd = cuentas
        .filter(c => c.tipo_cuenta === 'EFECTIVO' && c.moneda === 'USD')
        .reduce((sum, c) => sum + Number(ultimoCierre?.saldos_finales?.[c.id] || 0), 0);

    const aperturaSugeridaEq = ultimoCierre?.saldo_final_usd_equivalente
        ?? (tcBna ? aperturaSugeridaUsd + (aperturaSugeridaArs / tcBna) : aperturaSugeridaUsd);

    return (
        <div className="space-y-6">
            <div className={`p-6 rounded-2xl border ${cierreHoy
                ? 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                : aperturaHoy
                    ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                    : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {cierreHoy ? (
                            <Lock className="text-gray-500" size={24} />
                        ) : aperturaHoy ? (
                            <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
                        ) : (
                            <AlertTriangle className="text-blue-600 dark:text-blue-400" size={24} />
                        )}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {aperturaHoy ? 'Jornada Abierta' : cierreHoy ? 'Caja Cerrada (Sesión Finalizada)' : 'Caja sin iniciar'}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {cierreHoy
                                    ? `Cerrado el ${formatDateForLocale(cierreHoy.fecha)}`
                                    : aperturaHoy
                                        ? `Abierta ${aperturaHoy.hora_inicio ? new Date(aperturaHoy.hora_inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}`
                                        : ultimoCierre
                                            ? `Último cierre: ${formatDateForLocale(ultimoCierre.fecha)}`
                                            : 'Sin cierres previos (Saldo inicial: $0)'}
                            </p>
                        </div>
                    </div>

                    {!aperturaHoy && (role === 'owner' || role === 'admin') && (
                        <Button
                            onClick={() => setShowAbrirModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <PlayCircle size={18} />
                            {cierreHoy ? 'Iniciar Nueva Sesión' : 'Iniciar Jornada'}
                        </Button>
                    )}

                    {!cierreHoy && aperturaHoy && (role === 'owner' || role === 'admin') && (
                        <Button
                            onClick={() => setShowCerrarModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <Lock size={18} />
                            Cerrar Caja del Día
                        </Button>
                    )}
                </div>

                {cierreHoy && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Saldos de Cierre</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {cuentas.filter(c => c.tipo_cuenta === 'EFECTIVO').map(cuenta => (
                                <div key={cuenta.id} className="flex justify-between items-center bg-white dark:bg-black/20 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cuenta.nombre_cuenta}</span>
                                    </div>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: cuenta.moneda }).format(cierreHoy.saldos_finales[cuenta.id] || 0)}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {cierreHoy.saldo_final_usd_equivalente && (
                            <div className="mt-2 text-right">
                                <span className="text-xs text-gray-400">Total Eq: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cierreHoy.saldo_final_usd_equivalente)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showAbrirModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <PlayCircle size={20} className="text-emerald-600" />
                            {cierreHoy ? 'Iniciar Nueva Sesión Admin' : 'Iniciar Jornada Admin'}
                        </h3>

                        <p className="text-sm text-gray-500 mb-4">
                            Se heredarán automáticamente los saldos del último cierre.
                        </p>

                        <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 p-4 mb-4">
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide mb-2">
                                Saldo inicial sugerido
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-gray-700 dark:text-gray-200">
                                    <span>Efectivo USD</span>
                                    <span className="font-semibold">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(aperturaSugeridaUsd)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-gray-700 dark:text-gray-200">
                                    <span>Efectivo ARS</span>
                                    <span className="font-semibold">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(aperturaSugeridaArs)}
                                    </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-emerald-200 dark:border-emerald-800 text-gray-900 dark:text-white">
                                    <span>Total equivalente</span>
                                    <span className="font-bold">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(aperturaSugeridaEq || 0)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <Button
                                variant="ghost"
                                onClick={() => setShowAbrirModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleAbrir}
                                disabled={opening}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                {opening ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 size={16} className="animate-spin" />
                                        Abriendo...
                                    </span>
                                ) : 'Confirmar apertura'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Closure */}
            {showCerrarModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Cerrar Caja Administración
                        </h3>

                        <div className="space-y-4 mb-6">
                            {!ultimoCierre && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl mb-6 border border-yellow-100 dark:border-yellow-800">
                                    <div className="flex items-center gap-2 mb-2 text-yellow-800 dark:text-yellow-200">
                                        <AlertTriangle size={18} />
                                        <h4 className="font-semibold text-sm">Configuración Inicial de Saldos</h4>
                                    </div>
                                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                                        Al ser el primer cierre, ingrese el dinero físico con el que inició la operación (Saldos Iniciales).
                                    </p>

                                    <div className="space-y-3">
                                        {cuentas.filter(c => c.tipo_cuenta === 'EFECTIVO').map(cuenta => (
                                            <div key={`init-${cuenta.id}`} className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cuenta.nombre_cuenta} (Inicial)</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500">{cuenta.moneda}</span>
                                                    <div className="w-32">
                                                        <CurrencyInput
                                                            value={saldosIniciales[cuenta.id] || 0}
                                                            onChange={(val) => setSaldosIniciales({ ...saldosIniciales, [cuenta.id]: val })}
                                                            currency={cuenta.moneda}
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <h4 className="font-medium text-sm text-gray-500 uppercase">Conteo de Efectivo (Cierre)</h4>
                            {cuentas.filter(c => c.tipo_cuenta === 'EFECTIVO').map(cuenta => (
                                <div key={cuenta.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{cuenta.nombre_cuenta}</span>
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            Esperado: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: cuenta.moneda }).format(expectedBalances[cuenta.id] || 0)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">{cuenta.moneda}</span>
                                        <div className="flex-1">
                                            <CurrencyInput
                                                value={saldos[cuenta.id] || 0}
                                                onChange={(val) => setSaldos({ ...saldos, [cuenta.id]: val })}
                                                currency={cuenta.moneda}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mb-6 border border-blue-100 dark:border-blue-800">
                                <div className="flex justify-between items-center text-sm mb-1">
                                    <span className="text-gray-600 dark:text-gray-400">Total Esperado (Eq. USD):</span>
                                    <span className="font-bold text-gray-900 dark:text-white">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalExpectedUsdEq)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Total Contado (Eq. USD):</span>
                                    <span className="font-bold text-blue-600 dark:text-blue-400">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCountedUsdEqCurrent)}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Observaciones
                                </label>
                                <Textarea
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                                    rows={3}
                                    placeholder="Notas del cierre..."
                                />
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowCerrarModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleCerrar}
                                    disabled={submitting}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {submitting ? 'Guardando...' : 'Confirmar Cierre'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
