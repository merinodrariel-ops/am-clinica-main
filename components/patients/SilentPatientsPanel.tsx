'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSilentPatients, type SilentPatient } from '@/app/actions/silent-patients';
import Link from 'next/link'; // Added Link import
import { AlertTriangle, MessageCircle, RefreshCw, ChevronDown, ChevronUp, X } from 'lucide-react';

const PANEL_OPEN_KEY = 'dashboard:silent-patients:open';
const PANEL_HIDDEN_KEY = 'dashboard:silent-patients:hidden';

function normalizePhone(tel: string): string {
    const d = tel.replace(/\D/g, '');
    if (d.startsWith('549')) return d;
    if (d.startsWith('54')) return '549' + d.slice(2);
    if (d.startsWith('0')) return '549' + d.slice(1);
    return '549' + d;
}

function waLink(telefono: string, nombre: string, workflow: string): string {
    const num = normalizePhone(telefono);
    const msg = `Hola ${nombre}! 👋 Vimos que hace un tiempo no pasás por la clínica. Tu tratamiento de ${workflow} está en progreso y no queremos que pierdas el avance. ¿Cuándo te queda bien pasar? Te coordinamos un horario 😊`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

function DaysBadge({ days }: { days: number }) {
    const color =
        days >= 120 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            days >= 90 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${color}`}>
            {days}d sin turno
        </span>
    );
}

export default function SilentPatientsPanel() {
    const [patients, setPatients] = useState<SilentPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem(PANEL_OPEN_KEY) === '1';
    });
    const [hidden, setHidden] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem(PANEL_HIDDEN_KEY) === '1';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(PANEL_OPEN_KEY, open ? '1' : '0');
    }, [open]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(PANEL_HIDDEN_KEY, hidden ? '1' : '0');
    }, [hidden]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getSilentPatients();
            setPatients(data);
            if (!hidden && data.length > 0) {
                setOpen(prev => prev || data.length <= 3);
            }
        } finally {
            setLoading(false);
        }
    }, [hidden]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="mb-6 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 animate-pulse" />
        );
    }

    if (patients.length === 0) return null;

    if (hidden) {
        return (
            <div className="mb-4 rounded-xl border border-amber-300/40 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-900/10 px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300 truncate">
                        Pacientes en silencio oculto ({patients.length})
                    </p>
                </div>
                <button
                    onClick={() => setHidden(false)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:hover:bg-amber-800/60 dark:text-amber-200 transition-colors"
                >
                    Mostrar
                </button>
            </div>
        );
    }

    return (
        <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 animate-pulse" />
                    <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
                        Pacientes en silencio
                    </span>
                    <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-full">
                        {patients.length}
                    </span>
                    <span className="text-xs text-amber-600/80 dark:text-amber-400/80 hidden sm:block">
                        — Tratamiento activo sin turno hace +45 días
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); load(); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); load(); } }}
                        className="p-1 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors text-amber-500 cursor-pointer"
                    >
                        <RefreshCw size={13} />
                    </span>
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation();
                            setHidden(true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setHidden(true);
                            }
                        }}
                        className="p-1 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors text-amber-600"
                        title="Ocultar panel"
                    >
                        <X size={13} />
                    </span>
                    {open
                        ? <ChevronUp size={15} className="text-amber-500" />
                        : <ChevronDown size={15} className="text-amber-500" />
                    }
                </div>
            </button>

            {/* List */}
            {open && (
                <div className="px-4 pb-4 space-y-2">
                    {patients.map(p => (
                        <Link
                            key={p.patientId}
                            href={`/patients/${p.patientId}`}
                            className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl px-3 py-2.5 border border-amber-100 dark:border-amber-800/30 hover:border-amber-400/50 transition-all group cursor-pointer no-underline block"
                        >
                            {/* Iniciales */}
                            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-colors">
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                    {(p.nombre.charAt(0) + p.apellido.charAt(0)).toUpperCase()}
                                </span>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                    {p.fullName}
                                </p>
                                <p className="text-xs text-gray-400 truncate leading-tight">
                                    {p.workflowName}{p.stageName ? ` · ${p.stageName}` : ''}
                                </p>
                            </div>

                            {/* Badge días */}
                            <DaysBadge days={p.daysSilent} />

                            {/* WhatsApp */}
                            {p.telefono && (
                                <div
                                    role="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(waLink(p.telefono!, p.nombre, p.workflowName), '_blank');
                                    }}
                                    className="flex-shrink-0 p-1.5 rounded-lg bg-green-100 hover:bg-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 transition-colors"
                                    title="Enviar WhatsApp de re-enganche"
                                >
                                    <MessageCircle size={14} />
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
