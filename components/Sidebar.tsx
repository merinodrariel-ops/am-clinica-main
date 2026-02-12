'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
    LayoutDashboard,
    Users,
    Banknote,
    Wallet,
    Settings,
    LogOut,
    UserCircle,
    Upload,
    Package,
    CalendarDays,
    EyeOff,
    GitGraph,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';
import { readSidebarCollapsed, writeSidebarCollapsed } from '@/lib/sidebar-preferences';

const MENU_ITEMS = [
    {
        icon: LayoutDashboard,
        label: 'Dashboard',
        href: '/dashboard',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'pricing_manager', 'developer']
    },
    {
        icon: CalendarDays,
        label: 'Agenda 360',
        href: '/agenda',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer']
    },
    {
        icon: Users,
        label: 'Pacientes',
        href: '/patients',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio']
    },
    {
        icon: Banknote,
        label: 'Caja Recepción',
        href: '/caja-recepcion',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer']
    },
    {
        icon: Wallet,
        label: 'Caja Administración',
        href: '/caja-admin',
        roles: ['owner', 'admin', 'partner_viewer', 'developer']
    },
    {
        icon: Upload,
        label: 'Importador CSV',
        href: '/importador-csv',
        roles: ['owner', 'admin']
    },
    {
        icon: Package,
        label: 'Inventario',
        href: '/inventario',
        roles: ['owner', 'admin', 'reception', 'developer', 'laboratorio']
    },
    {
        icon: GitGraph, // Using GitGraph as a metaphor for workflows/branches
        label: 'Workflows',
        href: '/workflows',
        roles: ['owner', 'admin', 'reception', 'developer', 'laboratorio']
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { role, profile, signOut, user, isRealOwner, impersonatedRole, setImpersonatedRole } = useAuth();
    const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());

    useEffect(() => {
        const syncCollapsed = () => setCollapsed(readSidebarCollapsed());
        window.addEventListener('storage', syncCollapsed);
        return () => window.removeEventListener('storage', syncCollapsed);
    }, []);

    // Hide sidebar on login page or if not authenticated (optional, depends on layout)
    if (!user || pathname === '/login' || pathname.startsWith('/portal-profesional')) return null;

    const userRole = role || 'partner_viewer';

    function toggleCollapsed() {
        const next = !collapsed;
        setCollapsed(next);
        writeSidebarCollapsed(next);
    }

    return (
        <aside className={clsx(
            'fixed left-0 top-0 h-screen bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 z-50 flex flex-col transition-all duration-200',
            collapsed ? 'w-20' : 'w-64'
        )}>
            {/* Logo area */}
            <div className={clsx('border-b border-gray-200 dark:border-gray-800', collapsed ? 'p-3' : 'p-6')}>
                <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
                    <div className={clsx(collapsed && 'text-center')}>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            {collapsed ? 'AM' : 'AM Clínica'}
                        </h1>
                        {!collapsed && <p className="text-xs text-gray-500 mt-1">Operativa 360</p>}
                    </div>

                    {!collapsed && (
                        <button
                            onClick={toggleCollapsed}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                            title="Contraer menú lateral"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    )}
                </div>

                {collapsed && (
                    <button
                        onClick={toggleCollapsed}
                        className="mt-2 w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                        title="Expandir menú lateral"
                    >
                        <ChevronRight size={16} />
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {MENU_ITEMS.filter(item => item.roles.includes(userRole)).map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                'flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                                collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3',
                                isActive
                                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            )}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                            {!collapsed && item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* User Profile & Actions */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">

                {/* Always Show Admin Link for Real Owner or Active Admin */}
                {(isRealOwner || userRole === 'owner' || userRole === 'admin') && (
                    <Link
                        href="/admin-users"
                        className={clsx(
                            'flex items-center rounded-lg text-sm font-medium transition-colors',
                            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-4 py-2',
                            pathname.startsWith('/admin-users')
                                ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white"
                                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        )}
                        title={collapsed ? 'Gestión de Usuarios' : undefined}
                    >
                        <Settings size={18} />
                        {!collapsed && <span>Gestión de Usuarios</span>}
                    </Link>
                )}

                {/* Stop Impersonating Button */}
                {impersonatedRole && (
                    <button
                        onClick={() => setImpersonatedRole(null)}
                        className={clsx(
                            'w-full flex items-center rounded-lg text-sm font-medium transition-colors bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
                            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-4 py-2'
                        )}
                        title={collapsed ? 'Dejar de Imitar' : undefined}
                    >
                        <EyeOff size={18} />
                        {!collapsed && <span>Dejar de Imitar</span>}
                    </button>
                )}

                <div className={clsx('flex items-center py-3', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
                    <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {profile?.full_name || user.email?.split('@')[0]}
                            </p>
                            <p className="text-xs text-gray-500 capitalize truncate">
                                {userRole.replace('_', ' ')}
                                {impersonatedRole && <span className="ml-1 text-amber-600">(Imitando)</span>}
                            </p>
                        </div>
                    )}
                    <button
                        onClick={async () => {
                            await signOut();
                            window.location.href = '/login';
                        }}
                        className={clsx(
                            'flex items-center text-gray-500 hover:text-red-600 transition-colors text-sm font-medium',
                            collapsed ? 'justify-center p-1.5' : 'gap-2'
                        )}
                        title="Cerrar Sesión"
                    >
                        <LogOut size={18} />
                        {!collapsed && <span className="hidden sm:inline">Salir</span>}
                    </button>
                </div>
            </div>
        </aside>
    );
}
