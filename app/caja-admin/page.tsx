'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Building2,
    Receipt,
    Archive,
    Users,
    Clock,
    BarChart3,
    ExternalLink,
    RefreshCw,
    Settings,
    AlertTriangle,
} from 'lucide-react';
import { getObservadosCriticalLeaders, getObservadosSlaSummary, getSucursales, type Sucursal } from '@/lib/caja-admin';
import MovimientosTab from '@/components/caja-admin/MovimientosTab';
import ArqueoTab from '@/components/caja-admin/ArqueoTab';
import ProfesionalesTab from '@/components/caja-admin/ProfesionalesTab';
import PersonalTab from '@/components/caja-admin/PersonalTab';
import ReportesTab from '@/components/caja-admin/ReportesTab';
import ConfiguracionTab from '@/components/caja-admin/ConfiguracionTab';
import RoleGuard from "@/components/auth/RoleGuard";

const TABS = [
    { id: 'movimientos', label: 'Movimientos', icon: Receipt },
    { id: 'arqueo', label: 'Inicio / Cierre', icon: Archive },
    { id: 'profesionales', label: 'Profesionales', icon: Users },
    { id: 'personal', label: 'Personal', icon: Clock },
    { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
] as const;

type TabId = typeof TABS[number]['id'];

function currentMes() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function CajaAdminContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [sucursales, setSucursales] = useState<Sucursal[]>([]);
    const [selectedSucursal, setSelectedSucursal] = useState<Sucursal | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('movimientos');
    const [tcBna, setTcBna] = useState<number | null>(null);
    const [tcLoading, setTcLoading] = useState(false);
    const [tcError, setTcError] = useState<string | null>(null);
    const [observadosSummary, setObservadosSummary] = useState<{ total: number; warn: number; critical: number }>({
        total: 0,
        warn: 0,
        critical: 0,
    });
    const [observadosCriticalLeaders, setObservadosCriticalLeaders] = useState<Array<{
        personal_id: string;
        nombre: string;
        apellido: string;
        critical_count: number;
    }>>([]);

    useEffect(() => {
        loadSucursales();
        loadObservadosSummary();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            loadObservadosSummary();
        }, 60000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const requestedTab = searchParams.get('tab');
        if (requestedTab && TABS.some((tab) => tab.id === requestedTab)) {
            setActiveTab(requestedTab as TabId);
        }
    }, [searchParams]);

    useEffect(() => {
        if (selectedSucursal?.moneda_local === 'ARS') {
            loadTipoCambio();
        }
    }, [selectedSucursal]);

    async function loadSucursales() {
        const data = await getSucursales();
        const filtered = data.filter((s) => !s.nombre.toLowerCase().includes('montevideo'));
        setSucursales(filtered);
        if (filtered.length > 0) {
            const buenosAires = filtered.find((s) => s.nombre.toLowerCase().includes('buenos'));
            setSelectedSucursal(buenosAires || filtered[0]);
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

    async function loadObservadosSummary() {
        const mes = currentMes();
        const [summary, leaders] = await Promise.all([
            getObservadosSlaSummary(mes),
            getObservadosCriticalLeaders(mes, 3),
        ]);
        setObservadosSummary(summary);
        setObservadosCriticalLeaders(leaders);
    }

    function renderTab() {
        if (!selectedSucursal) return null;

        const requestedSubTab = searchParams.get('subtab');
        const validPersonalSubTabs = new Set(['equipo', 'profesionales', 'registros', 'observados']);
        const initialSubTab = requestedSubTab && validPersonalSubTabs.has(requestedSubTab)
            ? requestedSubTab as 'equipo' | 'profesionales' | 'registros' | 'observados'
            : undefined;
        const initialObservedPersonalId = requestedSubTab === 'observados'
            ? (searchParams.get('observado_personal_id') || undefined)
            : undefined;

        switch (activeTab) {
            case 'movimientos':
                return <MovimientosTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'arqueo':
                return <ArqueoTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'profesionales':
                return <ProfesionalesTab sucursal={selectedSucursal} tcBna={tcBna} />;
            case 'personal':
                return (
                    <PersonalTab
                        sucursal={selectedSucursal}
                        tcBna={tcBna}
                        initialTab={initialSubTab}
                        initialObservedPersonalId={initialObservedPersonalId}
                    />
                );
            case 'reportes':
                return <ReportesTab sucursal={selectedSucursal} />;
            case 'configuracion':
                return <ConfiguracionTab sucursal={selectedSucursal} />;
            default:
                return null;
        }
    }

    function handleTabChange(tabId: TabId) {
        setActiveTab(tabId);

        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tabId);
        if (tabId !== 'personal') {
            params.delete('subtab');
            params.delete('observado_personal_id');
        }

        router.replace(`/caja-admin?${params.toString()}`, { scroll: false });
    }

    function openObservadosTab(personalId?: string) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', 'personal');
        params.set('subtab', 'observados');

        if (personalId) {
            params.set('observado_personal_id', personalId);
        } else {
            params.delete('observado_personal_id');
        }

        setActiveTab('personal');
        router.replace(`/caja-admin?${params.toString()}`, { scroll: false });
    }

    return (
        <RoleGuard allowedRoles={['admin', 'owner']}>
            <div className="min-h-screen relative">
                {/* Ambient Glows */}
                <div className="absolute top-0 left-1/4 w-[40rem] h-[30rem] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 right-1/4 w-[30rem] h-[30rem] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">
                                Caja Administración
                            </h1>
                            <p className="text-slate-400 mt-1">
                                Gestión de egresos, liquidaciones y control financiero
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Sucursal Selector */}
                            <div className="flex items-center gap-2 glass-card rounded-xl px-4 py-2 border border-white/10 bg-navy-900/50">
                                <Building2 className="w-5 h-5 text-indigo-400" />
                                <select
                                    value={selectedSucursal?.id || ''}
                                    onChange={(e) => {
                                        const s = sucursales.find(s => s.id === e.target.value);
                                        setSelectedSucursal(s || null);
                                    }}
                                    className="bg-transparent border-none outline-none text-sm font-medium text-slate-200 cursor-pointer [&>option]:bg-navy-900"
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
                                <div className="flex items-center gap-2 glass-card bg-emerald-500/10 rounded-xl px-4 py-2 border border-emerald-500/20">
                                    {tcLoading ? (
                                        <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                                    ) : tcError ? (
                                        <span className="text-red-400 text-sm">{tcError}</span>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium text-emerald-400">
                                                BNA Venta: ${tcBna?.toLocaleString('es-AR')}
                                            </span>
                                            <a
                                                href="https://www.bna.com.ar/Personas"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-emerald-500 hover:text-emerald-400 transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                            <button
                                                onClick={loadTipoCambio}
                                                className="text-emerald-500 hover:text-emerald-400 transition-colors"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {observadosSummary.critical > 0 && (
                        <div className="mb-6 rounded-2xl glass-card bg-red-500/10 border border-red-500/20 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-300">
                                            Hay {observadosSummary.critical} observado(s) crítico(s) sin resolver este mes
                                        </p>
                                        <p className="text-xs text-red-400/80 mt-0.5">
                                            También hay {observadosSummary.warn} en ventana 24h+ y {observadosSummary.total} observados totales.
                                        </p>
                                        {observadosCriticalLeaders.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {observadosCriticalLeaders.map((leader) => (
                                                    <button
                                                        key={leader.personal_id}
                                                        onClick={() => openObservadosTab(leader.personal_id)}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                                                    >
                                                        {`${leader.nombre} ${leader.apellido}`.trim()}: {leader.critical_count}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => openObservadosTab()}
                                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-sm font-medium transition-all"
                                >
                                    Ir a Observados
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="glass-card rounded-2xl border border-white/10 mb-6 overflow-hidden">
                        <div className="flex overflow-x-auto no-scrollbar">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => handleTabChange(tab.id)}
                                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative whitespace-nowrap ${isActive
                                            ? 'text-teal-400'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {tab.label}
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeTab"
                                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-400 to-emerald-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]"
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

export default function CajaAdminPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-navy-950 text-slate-500">Cargando Administración...</div>}>
            <CajaAdminContent />
        </Suspense>
    );
}
