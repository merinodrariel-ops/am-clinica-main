'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, UserCheck, ShieldAlert, Zap, X } from 'lucide-react';
import clsx from 'clsx';

export default function RoleSwitcher() {
    const { isRealOwner, impersonatedRole, setImpersonatedRole, profile } = useAuth();
    const [isMinimized, setIsMinimized] = useState(true);

    if (!isRealOwner) return null;

    const roles = [
        { id: 'owner', label: 'Dueño', icon: Zap },
        { id: 'admin', label: 'Administrador', icon: ShieldAlert },
        { id: 'reception', label: 'Recepción', icon: UserCheck },
        { id: 'asistente', label: 'Asistente', icon: UserCheck },
        { id: 'pricing_manager', label: 'Gestor Precios', icon: Eye },
        { id: 'partner_viewer', label: 'Socio (Solo Lectura)', icon: Eye },
    ] as const;

    if (isMinimized) {
        return (
            <button
                onClick={() => setIsMinimized(false)}
                className="fixed bottom-6 right-6 z-[9999] p-3 bg-blue-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all group"
                title="Cambiar de Rol (Previsualización)"
            >
                <Zap size={24} fill={impersonatedRole ? "currentColor" : "none"} className={impersonatedRole ? "text-amber-400" : ""} />
                {impersonatedRole && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-white"></span>
                    </span>
                )}
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-900 overflow-hidden transform transition-all overflow-y-auto max-h-[80vh]">
                <div className="px-4 py-2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Zap size={12} fill="currentColor" />
                        Modo Previsualización
                    </div>
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="hover:bg-blue-700 p-1 rounded transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="p-3 grid grid-cols-1 gap-1">
                    <button
                        onClick={() => setImpersonatedRole(null)}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all w-full text-left",
                            !impersonatedRole
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shadow-sm border border-blue-100 dark:border-blue-800"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Perfil Real: {profile?.role || 'Cargando...'}
                    </button>

                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-2" />

                    {roles.map((role) => (
                        <button
                            key={role.id}
                            onClick={() => setImpersonatedRole(role.id)}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all w-full text-left",
                                impersonatedRole === role.id
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 shadow-sm border border-amber-100 dark:border-amber-800"
                                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                            )}
                        >
                            <role.icon size={14} className={impersonatedRole === role.id ? "text-amber-500" : "text-gray-400"} />
                            Ver como: {role.label}
                        </button>
                    ))}
                </div>
            </div>

            {impersonatedRole && (
                <div className="px-3 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-full shadow-lg">
                    VISTA: {impersonatedRole.toUpperCase()}
                </div>
            )}
        </div>
    );
}
