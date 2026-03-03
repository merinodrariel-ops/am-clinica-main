'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Target,
    DollarSign,
    Users,
    Award,
    LogOut,
    Settings,
    ChevronRight,
    Stethoscope,
} from 'lucide-react';

const NAV_ITEMS = [
    { href: '/portal/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/portal/prestaciones', icon: Stethoscope, label: 'Mis Prestaciones' },
    { href: '/portal/goals', icon: Target, label: 'Objetivos' },
    { href: '/portal/liquidation', icon: DollarSign, label: 'Liquidaciones' },
    { href: '/portal/profile', icon: Users, label: 'Mi Ficha' },
    { href: '/portal/medals', icon: Award, label: 'Medallas' },
];

function NavLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
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

    return (
        <div className="flex h-screen bg-[#0a0a0f] text-slate-100 font-sans antialiased selection:bg-indigo-500/30">

            {/* Sidebar */}
            <aside className="w-64 border-r border-slate-800/60 bg-slate-950/60 backdrop-blur-xl flex flex-col justify-between flex-shrink-0">
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

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-[#0a0a0f]">
                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
