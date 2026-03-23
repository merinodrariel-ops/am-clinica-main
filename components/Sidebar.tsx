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
    Package,
    CalendarDays,
    Bell,
    EyeOff,
    GitGraph,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
    SlidersHorizontal,
    CheckSquare,
    Briefcase,
    Mail,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';
import { readSidebarCollapsed, writeSidebarCollapsed } from '@/lib/sidebar-preferences';
import SettingsModal from '@/components/settings/SettingsModal';
import NotificationBell from '@/components/NotificationBell';

const MENU_ITEMS = [
    {
        icon: LayoutDashboard,
        label: 'Dashboard',
        href: '/dashboard',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'pricing_manager', 'developer', 'odontologo', 'recaptacion']
    },
    {
        icon: CalendarDays,
        label: 'Agenda 360',
        href: '/agenda',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio', 'asistente', 'odontologo', 'recaptacion']
    },
    {
        icon: Users,
        label: 'Pacientes',
        href: '/patients',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio', 'asistente', 'odontologo', 'recaptacion']
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
        icon: Package,
        label: 'Inventario',
        href: '/inventario',
        roles: ['owner', 'admin', 'reception', 'developer', 'laboratorio', 'asistente']
    },
    {
        icon: GitGraph,
        label: 'Workflows',
        href: '/workflows',
        roles: ['owner', 'admin', 'reception', 'developer', 'laboratorio', 'asistente', 'odontologo']
    },
    {
        icon: Bell,
        label: 'Recall Engine',
        href: '/recalls',
        roles: ['owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo', 'recaptacion']
    },
    {
        icon: CheckSquare,
        label: 'Tareas',
        href: '/todos',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'pricing_manager', 'developer', 'laboratorio', 'asistente', 'odontologo', 'recaptacion']
    },
    {
        icon: Briefcase,
        label: 'Mi Portal',
        href: '/portal/dashboard',
        roles: ['owner', 'admin', 'odontologo', 'asistente', 'laboratorio']
    },
    {
        icon: Mail,
        label: 'Templates Email',
        href: '/admin/email-templates',
        roles: ['owner', 'admin', 'developer']
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { categoria, profile, signOut, user, isRealOwner, impersonatedCategoria, setImpersonatedCategoria } = useAuth();
    const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(() =>
        typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches
    );
    const [showSettings, setShowSettings] = useState(false);

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

    // Close mobile sidebar on route change
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (isDesktop) setMobileOpen(false); }, [isDesktop]);

    // Hide sidebar on login page or if not authenticated
    if (!user || pathname === '/login' || pathname.startsWith('/portal-profesional')) return null;

    const userCategoria = categoria || 'partner_viewer';

    function toggleCollapsed() {
        const next = !collapsed;
        setCollapsed(next);
        writeSidebarCollapsed(next);
    }

    const compactMode = isDesktop && collapsed;

    return (
        <>
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

            {/* Mobile toggle button */}
            {!isDesktop && !mobileOpen && (
                <button
                    onClick={() => setMobileOpen(true)}
                    className="fixed left-4 bottom-4 z-[60] inline-flex items-center gap-2 rounded-full px-4 py-2.5 shadow-xl text-white"
                    style={{ background: 'hsl(165 100% 42%)' }}
                    title="Abrir menú"
                    aria-label="Abrir menú lateral"
                >
                    <Menu size={16} />
                    <span className="text-xs font-semibold">Menú</span>
                </button>
            )}

            {/* Mobile overlay */}
            {!isDesktop && mobileOpen && (
                <button
                    onClick={() => setMobileOpen(false)}
                    aria-label="Cerrar menú lateral"
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                'fixed left-0 top-0 h-screen z-50 flex flex-col transform transition-all duration-300',
                isDesktop
                    ? (compactMode ? 'w-20 translate-x-0' : 'w-64 translate-x-0')
                    : (mobileOpen ? 'w-[84vw] max-w-80 translate-x-0 shadow-2xl' : 'w-[84vw] max-w-80 -translate-x-full pointer-events-none'),
                'glass-card rounded-none border-y-0 border-l-0 border-r border-[var(--glass-border)]'
            )}
            >
                <div
                    className={clsx(compactMode ? 'p-3' : 'p-5', 'border-b border-[var(--glass-border)]')}
                >
                    <div className={clsx('flex items-center', compactMode ? 'justify-center' : 'justify-between')}>
                        <div className={clsx(compactMode && 'text-center')}>
                            <h1 className="text-xl font-bold tracking-tight drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]" style={{
                                background: 'linear-gradient(135deg, hsl(165 100% 50%), hsl(165 85% 70%))',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}>
                                {compactMode ? 'AM' : 'AM Clínica'}
                            </h1>
                            {!compactMode && (
                                <p className="text-xs mt-0.5" style={{ color: 'hsl(230 10% 45%)' }}>
                                    Operativa 360
                                </p>
                            )}
                        </div>

                        {isDesktop && !compactMode && (
                            <button
                                onClick={toggleCollapsed}
                                className="p-2 rounded-lg transition-all duration-300 text-gray-400 hover:text-white hover:bg-white/10"
                                title="Contraer menú lateral"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}

                        {!isDesktop && (
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="p-2 rounded-lg transition-all duration-300 text-gray-400 hover:text-white hover:bg-white/10"
                                title="Cerrar menú"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {isDesktop && compactMode && (
                        <button
                            onClick={toggleCollapsed}
                            className="mt-2 w-full flex items-center justify-center p-2 rounded-lg transition-all duration-300 text-gray-400 hover:text-white hover:bg-white/10"
                            title="Expandir menú lateral"
                        >
                            <ChevronRight size={16} />
                        </button>
                    )}
                </div>

                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                    {MENU_ITEMS.filter(item => item.roles.includes(userCategoria)).map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname.startsWith(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    'sidebar-glow flex items-center rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden',
                                    compactMode ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-2.5',
                                    isActive ? 'active text-emerald-400 font-semibold shadow-[inset_0_0_20px_rgba(52,211,153,0.1)]' : 'text-gray-400 hover:text-white hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]'
                                )}
                                onClick={() => {
                                    if (!isDesktop) setMobileOpen(false);
                                }}
                                title={compactMode ? item.label : undefined}
                            >
                                {/* Active background gradient layer */}
                                <div className={clsx(
                                    'absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent transition-opacity duration-300 -z-10',
                                    isActive ? 'opacity-100' : 'opacity-0'
                                )} />
                                {/* Hover background gradient layer */}
                                <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10" />

                                <Icon size={20} strokeWidth={isActive ? 2 : 1.5} className={clsx("transition-transform duration-300", isActive && "drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]")} />
                                {!compactMode && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* User Profile & Actions */}
                <div className="p-3 space-y-2 border-t border-[var(--glass-border)]">

                    {/* Settings button */}
                    <button
                        onClick={() => setShowSettings(true)}
                        className={clsx(
                            'w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden',
                            compactMode ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2.5',
                            showSettings ? 'text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]' : 'text-gray-400 hover:text-white hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]'
                        )}
                        title={compactMode ? 'Configuración' : undefined}
                    >
                        {/* Selected/Hover background gradient layers */}
                        <div className={clsx('absolute inset-0 bg-white/10 transition-opacity duration-300 pointer-events-none -z-10', showSettings ? 'opacity-100' : 'opacity-0')} />
                        <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10" />

                        <SlidersHorizontal size={18} />
                        {!compactMode && <span>Configuración</span>}
                    </button>

                    {/* Admin users link */}
                    {(isRealOwner || userCategoria === 'owner' || userCategoria === 'admin') && (
                        <Link
                            href="/admin-users"
                            className={clsx(
                                'flex items-center rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden',
                                compactMode ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2.5',
                                pathname.startsWith('/admin-users') ? 'text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]' : 'text-gray-400 hover:text-white hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]'
                            )}
                            title={compactMode ? 'Gestión de Usuarios' : undefined}
                        >
                            <div className={clsx('absolute inset-0 bg-white/10 transition-opacity duration-300 pointer-events-none -z-10', pathname.startsWith('/admin-users') ? 'opacity-100' : 'opacity-0')} />
                            <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10" />

                            <Settings size={18} />
                            {!compactMode && <span>Gestión de Usuarios</span>}
                        </Link>
                    )}

                    {/* Stop Impersonating Button */}
                    {impersonatedCategoria && (
                        <button
                            onClick={() => setImpersonatedCategoria(null)}
                            className={clsx(
                                'w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden text-amber-500 border border-amber-500/30 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:bg-amber-500/10',
                                compactMode ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2.5'
                            )}
                            title={compactMode ? 'Dejar de Imitar' : undefined}
                        >
                            <EyeOff size={18} className="drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]" />
                            {!compactMode && <span>Dejar de Imitar</span>}
                        </button>
                    )}

                    {/* User info */}
                    <div className={clsx('flex items-center py-3 pt-4', compactMode ? 'justify-center px-2' : 'gap-3 px-4')}>
                        <div
                            className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(52,211,153,0.3)] ring-2 ring-white/10"
                            style={{
                                background: 'linear-gradient(135deg, hsl(165 100% 40%), hsl(200 80% 40%))',
                            }}
                        >
                            <span className="text-xs font-bold text-white tracking-widest">
                                {(profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        {!compactMode && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-white tracking-wide">
                                    {profile?.full_name || user.email?.split('@')[0]}
                                </p>
                                <p className="text-xs capitalize truncate text-emerald-400 font-medium">
                                    {userCategoria.replace('_', ' ')}
                                    {impersonatedCategoria && <span className="ml-1 text-amber-500">(Imitando)</span>}
                                </p>
                            </div>
                        )}
                        {!compactMode && user.id && (
                            <NotificationBell userId={user.id} />
                        )}
                        <button
                            onClick={async () => {
                                await signOut();
                                window.location.href = '/login';
                            }}
                            className={clsx(
                                'flex items-center transition-all duration-300 text-sm font-medium text-gray-400 hover:text-red-400 hover:drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]',
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
