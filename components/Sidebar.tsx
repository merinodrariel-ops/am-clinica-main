'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    Banknote,
    Wallet,
    Settings,
    LogOut,
    UserCircle,
    Upload
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

const MENU_ITEMS = [
    {
        icon: LayoutDashboard,
        label: 'Dashboard',
        href: '/dashboard',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'pricing_manager', 'developer']
    },
    {
        icon: Users,
        label: 'Pacientes',
        href: '/patients',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer']
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
];

export default function Sidebar() {
    const pathname = usePathname();
    const { profile, signOut, user } = useAuth();

    // Hide sidebar on login page or if not authenticated (optional, depends on layout)
    if (!user || pathname === '/login') return null;

    const userRole = profile?.role || 'partner_viewer';

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 z-50 flex flex-col">
            {/* Logo area */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    AM Clínica
                </h1>
                <p className="text-xs text-gray-500 mt-1">Operativa 360</p>
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
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            )}
                        >
                            <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* User Profile & Actions */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                {/* Admin/Owner User Management Link */}
                {userRole === 'owner' && (
                    <Link
                        href="/settings/users"
                        className={clsx(
                            "flex items-center gap-3 px-4 py-2 mb-2 rounded-lg text-sm font-medium transition-colors",
                            pathname.startsWith('/settings/users')
                                ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white"
                                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        )}
                    >
                        <Settings size={18} />
                        <span>Gestión de Usuarios</span>
                    </Link>
                )}

                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {profile?.full_name || user.email?.split('@')[0]}
                        </p>
                        <p className="text-xs text-gray-500 capitalize truncate">
                            {userRole.replace('_', ' ')}
                        </p>
                    </div>
                    <button
                        onClick={signOut}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
