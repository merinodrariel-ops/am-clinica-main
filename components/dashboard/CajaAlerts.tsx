'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { getDiasSinCierreRecepcion, DiaSinCierre } from '@/lib/caja-recepcion';
import { getDiasSinCierreAdmin, DiaSinCierreAdmin } from '@/lib/caja-admin';
import Link from 'next/link';

// Assuming Main Branch ID for now, or fetching all if owner
// For now, hardcode or fetch the main branch if known. The app seems to have `sucursal` context usually.
// But Dashboard is generic.
// I'll fetch for the default sucursal or iterate if needed.
// Checking `lib/caja-admin.ts` -> `getSucursales`.
import { getSucursales } from '@/lib/caja-admin';

export default function CajaAlerts() {
    const [alertsRecepcion, setAlertsRecepcion] = useState<DiaSinCierre[]>([]);
    const [alertsAdmin, setAlertsAdmin] = useState<{ sucursal: string, dias: DiaSinCierreAdmin[] }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function checkAlerts() {
            try {
                // 1. Recepcion (Global usually, or per branch? Schema has no sucursal_id in caja_recepcion_arqueos yet? 
                // Wait, caja_recepcion_arqueos DOES NOT have sucursal_id based on previous migrations shown. 
                // It seems Reception is mono-sucursal for now or implied?)
                // `caja_recepcion_operaciones` table...
                // Let's assume global for Reception based on current code.

                const recepcion = await getDiasSinCierreRecepcion();
                setAlertsRecepcion(recepcion);

                // 2. Admin (Per Sucursal)
                const sucursales = await getSucursales();
                const adminAlertsPromises = sucursales.map(async (s) => {
                    const dias = await getDiasSinCierreAdmin(s.id);
                    return { sucursal: s.nombre, dias };
                });

                const adminResults = await Promise.all(adminAlertsPromises);
                setAlertsAdmin(adminResults.filter(r => r.dias.length > 0));

            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }

        checkAlerts();
    }, []);

    if (loading) return null; // Or skeleton
    if (alertsRecepcion.length === 0 && alertsAdmin.length === 0) return null;

    return (
        <div className="mb-8 space-y-4">
            {alertsRecepcion.length > 0 && (
                <div className="glass-card bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <AlertTriangle className="w-6 h-6 text-amber-500" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-amber-400 drop-shadow-sm">
                                Días sin cerrar en Recepción
                            </h3>
                            <p className="text-amber-500/70 mb-3">
                                Se detectaron {alertsRecepcion.length} días con movimientos sin cierre de caja.
                            </p>
                            <div className="space-y-2">
                                {alertsRecepcion.map((dia) => (
                                    <div key={dia.fecha} className="flex items-center justify-between text-sm bg-black/20 border border-white/5 p-2 rounded text-slate-300">
                                        <span>{new Date(dia.fecha).toLocaleDateString()}</span>
                                        <span className="text-amber-500/80">
                                            {dia.cantidad} mov. (Últ: {dia.ultimo_usuario})
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4">
                                <Link
                                    href="/caja-recepcion"
                                    className="inline-flex items-center gap-2 text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors"
                                >
                                    Ir a Caja Recepción <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {alertsAdmin.map((alert) => (
                <div key={alert.sucursal} className="glass-card bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-red-400 drop-shadow-sm">
                                Días sin cerrar en Administración ({alert.sucursal})
                            </h3>
                            <p className="text-red-500/70 mb-3">
                                Se detectaron {alert.dias.length} días con movimientos sin cierre.
                            </p>
                            <div className="space-y-2">
                                {alert.dias.map((dia) => (
                                    <div key={dia.fecha} className="flex items-center justify-between text-sm bg-black/20 border border-white/5 p-2 rounded text-slate-300">
                                        <span>{new Date(dia.fecha).toLocaleDateString()}</span>
                                        <span className="text-red-500/80">
                                            {dia.cantidad} mov. (Últ: {dia.ultimo_usuario})
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4">
                                <Link
                                    href="/caja-admin"
                                    className="inline-flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-400 transition-colors"
                                >
                                    Ir a Caja Administración <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
