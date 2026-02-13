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
    Bell,
    EyeOff,
    GitGraph,
    ChevronLeft,
    ChevronRight,
    Menu,
    X
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
    {
        icon: Bell,
        label: 'Recall Engine',
        href: '/recalls',
        roles: ['owner', 'admin', 'reception', 'developer']
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { role, profile, signOut, user, isRealOwner, impersonatedRole, setImpersonatedRole } = useAuth();
    const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(() =>
        typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches
    );

    useEffect(() => {
        const syncCollapsed = () => setCollapsed(readSidebarCollapsed());
        const syncBreakpoint = () => {
            setIsDesktop(window.matchMedia('(min-width: 1024px)').matches);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMobileOpen(false);
                return;
            }

            const isToggleShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b';
            if (!isToggleShortcut) return;

            event.preventDefault();
            if (window.matchMedia('(min-width: 1024px)').matches) {
                setCollapsed(prev => {
                    const next = !prev;
                    writeSidebarCollapsed(next);
                    return next;
                });
            } else {
                setMobileOpen(prev => !prev);
            }
        };

        window.addEventListener('storage', syncCollapsed);
        window.addEventListener('resize', syncBreakpoint);
        window.addEventListener('keydown', onKeyDown);
        syncBreakpoint();

        return () => {
            window.removeEventListener('storage', syncCollapsed);
            window.removeEventListener('resize', syncBreakpoint);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    // Close mobile sidebar on route change – intentional synchronous setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (isDesktop) setMobileOpen(false); }, [isDesktop]);

    // Hide sidebar on login page or if not authenticated (optional, depends on layout)
    if (!user || pathname === '/login' || pathname.startsWith('/portal-profesional')) return null;

    const userRole = role || 'partner_viewer';

    function toggleCollapsed() {
        const next = !collapsed;
        setCollapsed(next);
        writeSidebarCollapsed(next);
    }

    const compactMode = isDesktop && collapsed;

    return (
        <>
            {!isDesktop && !mobileOpen && (
                <button
                    onClick={() => setMobileOpen(true)}
                    className="fixed left-4 bottom-4 z-[60] inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-4 py-2.5 shadow-xl shadow-blue-200 dark:shadow-none"
                    title="Abrir menú"
                    aria-label="Abrir menú lateral"
                >
                    <Menu size={16} />
                    <span className="text-xs font-semibold">Menú</span>
                </button>
            )}

            {!isDesktop && mobileOpen && (
                <button
                    onClick={() => setMobileOpen(false)}
                    aria-label="Cerrar menú lateral"
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                />
            )}

            <aside className={clsx(
                'fixed left-0 top-0 h-screen bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 z-50 flex flex-col transform transition-all duration-200',
                isDesktop
                    ? (compactMode ? 'w-20 translate-x-0' : 'w-64 translate-x-0')
                    : (mobileOpen ? 'w-[84vw] max-w-80 translate-x-0 shadow-2xl' : 'w-[84vw] max-w-80 -translate-x-full pointer-events-none')
            )}>
                {/* Logo area */}
                <div className={clsx('border-b border-gray-200 dark:border-gray-800', compactMode ? 'p-3' : 'p-6')}>
                    <div className={clsx('flex items-center', compactMode ? 'justify-center' : 'justify-between')}>
                        <div className={clsx(compactMode && 'text-center')}>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                {compactMode ? 'AM' : 'AM Clínica'}
                            </h1>
                            {!compactMode && <p className="text-xs text-gray-500 mt-1">Operativa 360</p>}
                        </div>

                        {isDesktop && !compactMode && (
                            <button
                                onClick={toggleCollapsed}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                                title="Contraer menú lateral"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}

                        {!isDesktop && (
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                                title="Cerrar menú"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {isDesktop && compactMode && (
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
                                    compactMode ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3',
                                    isActive
                                        ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                )}
                                onClick={() => {
                                    if (!isDesktop) setMobileOpen(false);
                                }}
                                title={compactMode ? item.label : undefined}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                                {!compactMode && item.label}
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
                                compactMode ? 'justify-center px-2 py-2' : 'gap-3 px-4 py-2',
                                pathname.startsWith('/admin-users')
                                    ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white"
                                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            )}
                            title={compactMode ? 'Gestión de Usuarios' : undefined}
                        >
                            <Settings size={18} />
                            {!compactMode && <span>Gestión de Usuarios</span>}
                        </Link>
                    )}

                    {/* Stop Impersonating Button */}
                    {impersonatedRole && (
                        <button
                            onClick={() => setImpersonatedRole(null)}
                            className={clsx(
                                'w-full flex items-center rounded-lg text-sm font-medium transition-colors bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
                                compactMode ? 'justify-center px-2 py-2' : 'gap-3 px-4 py-2'
                            )}
                            title={compactMode ? 'Dejar de Imitar' : undefined}
                        >
                            <EyeOff size={18} />
                            {!compactMode && <span>Dejar de Imitar</span>}
                        </button>
                    )}

                    <div className={clsx('flex items-center py-3', compactMode ? 'justify-center px-2' : 'gap-3 px-4')}>
                        <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <UserCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </div>
                        {!compactMode && (
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
                                compactMode ? 'justify-center p-1.5' : 'gap-2'
                            )}
                            title="Cerrar Sesión"
                        >
                            <LogOut size={18} />
                            {!compactMode && <span className="hidden sm:inline">Salir</span>}
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
