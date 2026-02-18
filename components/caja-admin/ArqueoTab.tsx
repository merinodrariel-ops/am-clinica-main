'use client';

import { useState, useEffect } from 'react';
import {
    Lock,
    AlertTriangle
} from 'lucide-react';
import {
    type Sucursal,
    type CajaAdminArqueo,
    type CuentaFinanciera,
    getCuentas,
    getUltimoCierreAdmin,
    getCurrentBalanceAdmin,
    cerrarCajaAdmin
} from '@/lib/caja-admin';
import { useAuth } from '@/contexts/AuthContext';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
}

export default function ArqueoTab({ sucursal, tcBna }: Props) {
    const [cierreHoy, setCierreHoy] = useState<CajaAdminArqueo | null>(null);
    const [ultimoCierre, setUltimoCierre] = useState<CajaAdminArqueo | null>(null);
    const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
    const [loading, setLoading] = useState(true);
    const [saldos, setSaldos] = useState<Record<string, number>>({});
    const [observaciones, setObservaciones] = useState('');
    const [submitting, setSubmitting] = useState(false);
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
            const today = new Date().toISOString().split('T')[0];
            const [cuentasData, cierreData, balanceActual] = await Promise.all([
                getCuentas(sucursal.id),
                getUltimoCierreAdmin(sucursal.id),
                getCurrentBalanceAdmin(sucursal.id),
            ]);
            setCuentas(cuentasData);

            // Check if today is closed
            if (cierreData && cierreData.fecha === today) {
                setCierreHoy(cierreData);
                // Fetch previous closure for context if needed
                const prev = await getUltimoCierreAdmin(sucursal.id, today);
                setUltimoCierre(prev);
            } else {
                setCierreHoy(null);
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
                fecha: new Date().toISOString().split('T')[0],
                usuario: 'Admin', // Should be dynamic
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

    const { role } = useAuth();

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

    return (
        <div className="space-y-6">
            <div className={`p-6 rounded-2xl border ${cierreHoy
                ? 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {cierreHoy ? (
                            <Lock className="text-gray-500" size={24} />
                        ) : (
                            <AlertTriangle className="text-blue-600 dark:text-blue-400" size={24} />
                        )}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {cierreHoy ? 'Caja Cerrada' : 'Caja Activa'}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {cierreHoy
                                    ? `Cerrado el ${new Date(cierreHoy.fecha).toLocaleDateString()}`
                                    : ultimoCierre
                                        ? `Último cierre: ${new Date(ultimoCierre.fecha).toLocaleDateString()}`
                                        : 'Sin cierres previos'}
                            </p>
                        </div>
                    </div>
                    {!cierreHoy && (role === 'owner' || role === 'admin') && (
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
