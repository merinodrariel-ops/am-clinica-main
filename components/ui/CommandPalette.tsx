
'use client';

import * as React from 'react';
import {
    KBarProvider,
    KBarPortal,
    KBarPositioner,
    KBarAnimator,
    KBarSearch,
    KBarResults,
    useMatches,
    Action,
} from 'kbar';
import { useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Wallet,
    PlusCircle,
    MinusCircle,
    Settings,
    Search,
    Stethoscope
} from 'lucide-react';

export default function CommandPalette({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    const actions: Action[] = [
        {
            id: 'dashboard',
            name: 'Ir a Dashboard',
            shortcut: ['g', 'd'],
            keywords: 'home dashboard inicio owner',
            perform: () => router.push('/dashboard'),
            icon: <LayoutDashboard className="w-5 h-5" />,
        },
        {
            id: 'recepcion',
            name: 'Ir a Caja de Recepción',
            shortcut: ['g', 'r'],
            keywords: 'caja recepcion recibos pacientes cobros',
            perform: () => router.push('/caja-recepcion'),
            icon: <Wallet className="w-5 h-5" />,
        },
        {
            id: 'agenda',
            name: 'Ir a Agenda',
            shortcut: ['g', 'a'],
            keywords: 'agenda turnos citas calendario',
            perform: () => router.push('/agenda'),
            icon: <Calendar className="w-5 h-5" />,
        },
        {
            id: 'pacientes',
            name: 'Ir a Pacientes',
            shortcut: ['g', 'p'],
            keywords: 'pacientes lista historial personas',
            perform: () => router.push('/pacientes'),
            icon: <Users className="w-5 h-5" />,
        },
        {
            id: 'portal',
            name: 'Ir al Portal Profesional',
            shortcut: ['g', 'o'],
            keywords: 'portal profesional odontologo doctor',
            perform: () => router.push('/portal-profesional'),
            icon: <Stethoscope className="w-5 h-5" />,
        },
        {
            id: 'caja-admin',
            name: 'Ir a Caja Administración',
            shortcut: ['g', 'c'],
            keywords: 'caja administracion movimientos gastos ingresos',
            perform: () => router.push('/caja-admin'),
            icon: <Settings className="w-5 h-5" />,
        },
        {
            id: 'nuevo-ingreso',
            name: 'Registrar Nuevo Ingreso',
            shortcut: ['n', 'i'],
            keywords: 'nuevo ingreso cobrar dinero venta',
            perform: () => router.push('/caja-recepcion?action=nuevo-ingreso'),
            icon: <PlusCircle className="w-5 h-5 text-emerald-500" />,
        },
        {
            id: 'nuevo-egreso',
            name: 'Registrar Nuevo Egreso',
            shortcut: ['n', 'e'],
            keywords: 'nuevo egreso gasto pago dinero compra',
            perform: () => router.push('/caja-admin?action=nuevo-egreso'),
            icon: <MinusCircle className="w-5 h-5 text-rose-500" />,
        },
    ];

    return (
        <KBarProvider actions={actions}>
            <KBarPortal>
                <KBarPositioner className="z-[99999] bg-black/40 backdrop-blur-sm p-4">
                    <KBarAnimator className="w-full max-w-[600px] bg-white dark:bg-[#1a1c1e] overflow-hidden rounded-2xl shadow-2xl border border-white/20 dark:border-white/10">
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <KBarSearch className="w-full bg-transparent py-5 pl-12 pr-4 text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 text-lg border-b border-gray-100 dark:border-white/5" placeholder="¿Qué necesitas hacer? (Escribe o busca...)" />
                        </div>
                        <div className="max-h-[400px] overflow-y-auto pb-2 scrollbar-hide">
                            <RenderResults />
                        </div>
                        <div className="bg-gray-50/50 dark:bg-black/20 px-4 py-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[11px] text-gray-400 font-medium tracking-wider">
                            <div className="flex gap-4">
                                <span className="flex items-center gap-1"><kbd className="bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">↑↓</kbd> Navegar</span>
                                <span className="flex items-center gap-1"><kbd className="bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">↵</kbd> Seleccionar</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <kbd className="bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">esc</kbd> para cerrar
                            </div>
                        </div>
                    </KBarAnimator>
                </KBarPositioner>
            </KBarPortal>
            {children}
        </KBarProvider>
    );
}

function RenderResults() {
    const { results } = useMatches();

    return (
        <KBarResults
            items={results}
            onRender={({ item, active }) =>
                typeof item === 'string' ? (
                    <div className="px-4 pt-4 pb-2 text-[10px] uppercase font-bold text-emerald-600 tracking-widest dark:text-emerald-400 opacity-60">
                        {item}
                    </div>
                ) : (
                    <div
                        className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-all duration-200 ${active
                                ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-l-4 border-emerald-500'
                                : 'bg-transparent border-l-4 border-transparent'
                            }`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg transition-colors ${active ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>
                                {item.icon}
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${active ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {item.name}
                                </span>
                                {item.subtitle && (
                                    <span className="text-[11px] text-gray-400 mt-0.5">
                                        {item.subtitle}
                                    </span>
                                )}
                            </div>
                        </div>
                        {item.shortcut?.length ? (
                            <div className="flex gap-1">
                                {item.shortcut.map((sc) => (
                                    <kbd key={sc} className={`px-2 py-1 rounded text-[10px] font-bold tracking-tighter transition-colors ${active ? 'bg-emerald-200/50 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-gray-200/50 dark:bg-white/5 text-gray-400'}`}>
                                        {sc.toUpperCase()}
                                    </kbd>
                                ))}
                            </div>
                        ) : null}
                    </div>
                )
            }
        />
    );
}
