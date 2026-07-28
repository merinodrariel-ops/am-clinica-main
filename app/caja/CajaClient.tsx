'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calculator, Loader2, ReceiptText, Users } from 'lucide-react';
import CajaFisicaPanel from '@/components/caja/CajaFisicaPanel';
import { getSucursales, type Sucursal } from '@/lib/caja-admin';
import { useAuth } from '@/contexts/AuthContext';

export default function CajaClient() {
    const { categoria } = useAuth();
    const [sucursal, setSucursal] = useState<Sucursal | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getSucursales()
            .then((rows) => {
                const madero = rows.find((row) =>
                    row.moneda_local === 'ARS'
                    && !row.nombre.toLowerCase().includes('montevideo')
                );
                setSucursal(madero || rows[0] || null);
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className="min-h-[50vh] grid place-items-center"><Loader2 className="animate-spin" /></div>;
    }

    if (!sucursal) {
        return <div className="p-8 text-center text-slate-500">No se encontró la sede Madero.</div>;
    }

    const canAdmin = categoria === 'owner' || categoria === 'admin' || categoria === 'developer';

    return (
        <main className="min-h-screen bg-slate-100 dark:bg-slate-950 p-4 sm:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <header>
                    <p className="text-sm font-semibold text-emerald-600">Sede Madero</p>
                    <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Caja</h1>
                    <p className="mt-1 text-slate-500">
                        Una sola caja física para ingresos, gastos, liquidaciones pagadas y retiros.
                    </p>
                </header>

                <CajaFisicaPanel sucursalId={sucursal.id} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link
                        href="/caja-recepcion"
                        className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                    >
                        <div className="flex items-start justify-between">
                            <div className="rounded-xl bg-teal-100 p-3 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                                <ReceiptText />
                            </div>
                            <ArrowRight className="text-slate-400 transition group-hover:translate-x-1" />
                        </div>
                        <h2 className="mt-5 text-xl font-bold dark:text-white">Operación diaria</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Cobros de pacientes, cuotas, ingresos extraordinarios y gastos.
                        </p>
                    </Link>

                    {canAdmin && (
                        <Link
                            href="/caja-admin"
                            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                        >
                            <div className="flex items-start justify-between">
                                <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                    <Calculator />
                                </div>
                                <ArrowRight className="text-slate-400 transition group-hover:translate-x-1" />
                            </div>
                            <h2 className="mt-5 text-xl font-bold dark:text-white">Administración y liquidaciones</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Preparación y pago de liquidaciones, proveedores y control administrativo.
                            </p>
                        </Link>
                    )}
                </div>

                {!canAdmin && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        <Users className="mr-2 inline-block" size={18} />
                        Recepción opera la misma caja física. Las liquidaciones continúan reservadas a Administración.
                    </div>
                )}
            </div>
        </main>
    );
}
