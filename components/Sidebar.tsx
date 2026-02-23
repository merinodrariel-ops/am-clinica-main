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
    Stethoscope,
    Briefcase,
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
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'pricing_manager', 'developer', 'odontologo']
    },
    {
        icon: CalendarDays,
        label: 'Agenda 360',
        href: '/agenda',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'asistente', 'odontologo']
    },
    {
        icon: Users,
        label: 'Pacientes',
        href: '/patients',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio', 'asistente', 'odontologo']
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
        roles: ['owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo']
    },
    {
        icon: CheckSquare,
        label: 'Tareas',
        href: '/todos',
        roles: ['owner', 'admin', 'reception', 'partner_viewer', 'pricing_manager', 'developer', 'laboratorio', 'asistente', 'odontologo']
    },
    {
        icon: Stethoscope,
        label: 'Prestadores',
        href: '/admin/staff',
        roles: ['owner', 'admin']
    },
    {
        icon: Briefcase,
        label: 'Mi Portal',
        href: '/portal/dashboard',
        roles: ['owner', 'admin', 'odontologo', 'asistente', 'laboratorio']
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

    const userRole = role || 'partner_viewer';

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
                    : (mobileOpen ? 'w-[84vw] max-w-80 translate-x-0 shadow-2xl' : 'w-[84vw] max-w-80 -translate-x-full pointer-events-none')
            )}
                style={{
                    background: 'hsl(var(--sidebar-bg))',
                    borderRight: '1px solid hsl(var(--sidebar-border))',
                }}
            >
                {/* Logo area */}
                <div
                    className={clsx(compactMode ? 'p-3' : 'p-5')}
                    style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}
                >
                    <div className={clsx('flex items-center', compactMode ? 'justify-center' : 'justify-between')}>
                        <div className={clsx(compactMode && 'text-center')}>
                            <h1 className="text-xl font-bold" style={{
                                background: 'linear-gradient(135deg, hsl(165 100% 42%), hsl(165 85% 60%))',
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
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: 'hsl(230 10% 45%)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'hsl(230 15% 18%)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                title="Contraer menú lateral"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}

                        {!isDesktop && (
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: 'hsl(230 10% 45%)' }}
                                title="Cerrar menú"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {isDesktop && compactMode && (
                        <button
                            onClick={toggleCollapsed}
                            className="mt-2 w-full flex items-center justify-center p-2 rounded-lg transition-colors"
                            style={{ color: 'hsl(230 10% 45%)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'hsl(230 15% 18%)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            title="Expandir menú lateral"
                        >
                            <ChevronRight size={16} />
                        </button>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                    {MENU_ITEMS.filter(item => item.roles.includes(userRole)).map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname.startsWith(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    'sidebar-glow flex items-center rounded-xl text-sm font-medium transition-all duration-200 relative',
                                    compactMode ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-2.5',
                                    isActive && 'active'
                                )}
                                style={isActive ? {
                                    background: 'hsla(165, 100%, 42%, 0.1)',
                                    color: 'hsl(165 85% 50%)',
                                } : {
                                    color: 'hsl(230 10% 55%)',
                                }}
                                onMouseEnter={e => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = 'hsl(230 15% 16%)';
                                        e.currentTarget.style.color = 'hsl(210 20% 90%)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = 'hsl(230 10% 55%)';
                                    }
                                }}
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
                <div className="p-3 space-y-1" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>

                    {/* Settings button */}
                    <button
                        onClick={() => setShowSettings(true)}
                        className={clsx(
                            'w-full flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                            compactMode ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2.5'
                        )}
                        style={{
                            color: showSettings ? 'hsl(210 20% 90%)' : 'hsl(230 10% 55%)',
                            background: showSettings ? 'hsl(230 15% 16%)' : 'transparent',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'hsl(230 15% 16%)'; e.currentTarget.style.color = 'hsl(210 20% 90%)'; }}
                        onMouseLeave={e => { if (!showSettings) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(230 10% 55%)'; } }}
                        title={compactMode ? 'Configuración' : undefined}
                    >
                        <SlidersHorizontal size={18} />
                        {!compactMode && <span>Configuración</span>}
                    </button>

                    {/* Admin users link */}
                    {(isRealOwner || userRole === 'owner' || userRole === 'admin') && (
                        <Link
                            href="/admin-users"
                            className={clsx(
                                'flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                                compactMode ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2.5'
                            )}
                            style={{
                                color: pathname.startsWith('/admin-users') ? 'hsl(210 20% 90%)' : 'hsl(230 10% 55%)',
                                background: pathname.startsWith('/admin-users') ? 'hsl(230 15% 16%)' : 'transparent',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'hsl(230 15% 16%)'; e.currentTarget.style.color = 'hsl(210 20% 90%)'; }}
                            onMouseLeave={e => { if (!pathname.startsWith('/admin-users')) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(230 10% 55%)'; } }}
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
                                'w-full flex items-center rounded-xl text-sm font-medium transition-colors',
                                compactMode ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2.5'
                            )}
                            style={{
                                background: 'hsla(38, 92%, 50%, 0.1)',
                                color: 'hsl(38 92% 60%)',
                                border: '1px solid hsla(38, 92%, 50%, 0.2)',
                            }}
                            title={compactMode ? 'Dejar de Imitar' : undefined}
                        >
                            <EyeOff size={18} />
                            {!compactMode && <span>Dejar de Imitar</span>}
                        </button>
                    )}

                    {/* User info */}
                    <div className={clsx('flex items-center py-3', compactMode ? 'justify-center px-2' : 'gap-3 px-4')}>
                        <div
                            className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'linear-gradient(135deg, hsl(165 100% 42%), hsl(200 80% 50%))',
                            }}
                        >
                            <span className="text-xs font-bold text-white">
                                {(profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        {!compactMode && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: 'hsl(210 20% 90%)' }}>
                                    {profile?.full_name || user.email?.split('@')[0]}
                                </p>
                                <p className="text-xs capitalize truncate" style={{ color: 'hsl(230 10% 45%)' }}>
                                    {userRole.replace('_', ' ')}
                                    {impersonatedRole && <span className="ml-1" style={{ color: 'hsl(38 92% 60%)' }}>(Imitando)</span>}
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
                                'flex items-center transition-colors text-sm font-medium',
                                compactMode ? 'justify-center p-1.5' : 'gap-2'
                            )}
                            style={{ color: 'hsl(230 10% 45%)' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'hsl(0 72% 60%)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'hsl(230 10% 45%)'}
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
