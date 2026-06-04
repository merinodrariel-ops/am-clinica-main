'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    CalendarDays,
    DollarSign,
    FileText,
    LogOut,
    Settings,
    ChevronRight,
    Stethoscope,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS = [
    { href: '/portal/agenda', icon: CalendarDays, label: 'Mi Agenda' },
    { href: '/portal/prestaciones', icon: Stethoscope, label: 'Mis Prestaciones' },
    { href: '/portal/liquidation', icon: DollarSign, label: 'Liquidaciones' },
];

function NavLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
    const pathname = usePathname();
    const isActive = pathname === href || pathname.startsWith(href + '/');

    return (
        <Link
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
        >
            <Icon
                size={17}
                className={isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-indigo-400 transition-colors'}
            />
            <span className="flex-1">{label}</span>
            {isActive && <ChevronRight size={14} className="text-indigo-500/60" />}
        </Link>
    );
}

export default function PortalLayoutClient({ children, workerName, workerRole, workerInitials }: {
    children: React.ReactNode;
    workerName: string;
    workerRole: string;
    workerInitials: string;
}) {
    const isAdmin = workerRole?.toLowerCase().includes('admin') || workerRole?.toLowerCase().includes('administra');
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-sans antialiased selection:bg-indigo-500/30 lg:flex lg:h-screen">

            {/* Sidebar */}
            <aside className="hidden w-64 flex-shrink-0 flex-col justify-between border-r border-slate-800/60 bg-slate-950/60 backdrop-blur-xl lg:flex">
                <div>
                    {/* Logo */}
                    <div className="p-6 border-b border-slate-800/40">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-indigo-500/30">
                                AM
                            </div>
                            <div>
                                <h1 className="text-sm font-bold tracking-tight text-white">Portal AM</h1>
                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Prestadores</p>
                            </div>
                        </div>
                    </div>

                    {/* Worker Info */}
                    <div className="px-4 py-4 border-b border-slate-800/40">
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-sm font-black text-white shadow-lg shadow-indigo-500/20 flex-shrink-0">
                                {workerInitials}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-bold text-white truncate">{workerName || 'Sin perfil'}</p>
                                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest truncate">
                                    {workerRole || 'Personal'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="p-3 space-y-0.5">
                        {NAV_ITEMS.map(item => (
                            <NavLink key={item.href} {...item} />
                        ))}
                    </nav>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-800/40 space-y-1">
                    <Link
                        href="/portal/profile"
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
                    >
                        <FileText size={17} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
                        <span>Mi Ficha</span>
                    </Link>
                    {isAdmin && (
                        <Link
                            href="/caja-admin/personal"
                            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
                        >
                            <Settings size={17} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
                            <span>Gestión de Personal</span>
                        </Link>
                    )}
                    <Link
                        href="/auth/logout"
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-400/80 hover:text-red-300 hover:bg-red-900/10 rounded-xl transition-all group"
                    >
                        <LogOut size={17} />
                        <span>Cerrar Sesión</span>
                    </Link>
                </div>
            </aside>

            {/* Mobile top identity bar */}
            <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-slate-950/95 px-4 py-3 backdrop-blur-xl lg:hidden">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">
                            {workerInitials}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{workerName || 'Portal AM'}</p>
                            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                                {workerRole || 'Prestador'}
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/portal/profile"
                        aria-label="Mi ficha"
                        className="rounded-xl border border-slate-800 bg-slate-900/70 p-2 text-slate-400 hover:text-white"
                    >
                        <FileText size={18} />
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-[#0a0a0f]">
                <div className="mx-auto max-w-7xl px-3 py-4 pb-28 sm:px-5 md:p-8 lg:pb-8">
                    {children}
                </div>
            </main>

            {/* Mobile primary navigation */}
            <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-800/80 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl lg:hidden">
                {NAV_ITEMS.map(item => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors ${isActive
                                ? 'bg-indigo-500/10 text-indigo-300'
                                : 'text-slate-500 hover:text-slate-200'
                                }`}
                        >
                            <Icon size={20} />
                            <span>{item.label.replace('Mi ', '')}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
