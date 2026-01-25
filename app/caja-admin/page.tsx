'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Building2,
    Receipt,
    Archive,
    Users,
    Clock,
    BarChart3,
    ExternalLink,
    RefreshCw
} from 'lucide-react';
import { getSucursales, type Sucursal } from '@/lib/caja-admin';
import MovimientosTab from '@/components/caja-admin/MovimientosTab';
import ArqueoTab from '@/components/caja-admin/ArqueoTab';
import ProfesionalesTab from '@/components/caja-admin/ProfesionalesTab';
import PersonalTab from '@/components/caja-admin/PersonalTab';
import ReportesTab from '@/components/caja-admin/ReportesTab';
import RoleGuard from "@/components/auth/RoleGuard";

const TABS = [
    { id: 'movimientos', label: 'Movimientos', icon: Receipt },
    { id: 'arqueo', label: 'Inicio / Cierre', icon: Archive },
    { id: 'profesionales', label: 'Profesionales', icon: Users },
    { id: 'personal', label: 'Personal', icon: Clock },
    { id: 'reportes', label: 'Reportes', icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]['id'];

export default function CajaAdminPage() {
    const [sucursales, setSucursales] = useState<Sucursal[]>([]);
    const [selectedSucursal, setSelectedSucursal] = useState<Sucursal | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('movimientos');
    const [tcBna, setTcBna] = useState<number | null>(null);
    const [tcLoading, setTcLoading] = useState(false);
    const [tcError, setTcError] = useState<string | null>(null);

    useEffect(() => {
        loadSucursales();
    }, []);

    useEffect(() => {
        if (selectedSucursal?.moneda_local === 'ARS') {
            loadTipoCambio();
        }
    }, [selectedSucursal]);

    async function loadSucursales() {
        const data = await getSucursales();
        setSucursales(data);
        if (data.length > 0) {
            setSelectedSucursal(data[0]);
        }
    }

    async function loadTipoCambio() {
        setTcLoading(true);
        setTcError(null);
        try {
            const res = await fetch('/api/bna-cotizacion');
            const data = await res.json();
            if (data.venta) {
                setTcBna(data.venta);
            } else {
                setTcError('No se pudo obtener cotización');
            }
        } catch {
            setTcError('Error de conexión');
        } finally {
            setTcLoading(false);
        }
    }

    function renderTab() {
        if (!selectedSucursal) return null;

        switch (activeTab) {
            case 'movimientos':
                return <MovimientosTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'arqueo':
                return <ArqueoTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'profesionales':
                return <ProfesionalesTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'personal':
                return <PersonalTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'reportes':
                return <ReportesTab sucursal={selectedSucursal} />;
            default:
                return null;
        }
    }

    return (
        <RoleGuard allowedRoles={['admin']}>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                Caja Administración
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">
                                Gestión de egresos, liquidaciones y control financiero
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Sucursal Selector */}
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
                                <Building2 className="w-5 h-5 text-indigo-500" />
                                <select
                                    value={selectedSucursal?.id || ''}
                                    onChange={(e) => {
                                        const s = sucursales.find(s => s.id === e.target.value);
                                        setSelectedSucursal(s || null);
                                    }}
                                    className="bg-transparent border-none outline-none text-sm font-medium"
                                >
                                    {sucursales.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.nombre} ({s.modo_caja})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* TC BNA (only for ARS) */}
                            {selectedSucursal?.moneda_local === 'ARS' && (
                                <div className="flex items-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl px-4 py-2 border border-green-200 dark:border-green-800">
                                    {tcLoading ? (
                                        <RefreshCw className="w-4 h-4 text-green-600 animate-spin" />
                                    ) : tcError ? (
                                        <span className="text-red-500 text-sm">{tcError}</span>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                                BNA Venta: ${tcBna?.toLocaleString('es-AR')}
                                            </span>
                                            <a
                                                href="https://www.bna.com.ar/Personas"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-green-600 hover:text-green-700"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                            <button
                                                onClick={loadTipoCambio}
                                                className="text-green-600 hover:text-green-700"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-slate-200/50 dark:border-slate-700/50 mb-6 overflow-hidden">
                        <div className="flex overflow-x-auto">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative whitespace-nowrap ${isActive
                                            ? 'text-indigo-600 dark:text-indigo-400'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {tab.label}
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeTab"
                                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tab Content */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {renderTab()}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </RoleGuard>
    );
}
