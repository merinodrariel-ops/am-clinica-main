'use client';

import { useState, useEffect } from 'react';
import { X, Moon, Sun, Monitor, Database, Settings } from 'lucide-react';
import { useTheme } from 'next-themes';
import DataImporter from './DataImporter';
import { useAuth } from '@/contexts/AuthContext';
import { useModalKeyboard } from '@/hooks/useModalKeyboard';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<'general' | 'data' | 'system'>('general');
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { categoria: role, isRealOwner } = useAuth();

    // Prevent hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    useModalKeyboard(isOpen, onClose);

    if (!isOpen) return null;

    const isAdmin = role === 'admin' || role === 'owner' || isRealOwner;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Configuración</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Preferencias y herramientas del sistema</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-gray-50 dark:bg-gray-900/50 border-r border-gray-200 dark:border-gray-800 p-4 space-y-2 overflow-y-auto hidden md:block">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'general'
                                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-700'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                        >
                            <Monitor className="w-4 h-4" />
                            General
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => setActiveTab('data')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'data'
                                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-700'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <Database className="w-4 h-4" />
                                Datos e Importación
                            </button>
                        )}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900">
                        {/* Mobile Tabs (only visible on small screens) */}
                        <div className="md:hidden flex gap-2 mb-6 overflow-x-auto pb-2">
                            <button
                                onClick={() => setActiveTab('general')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === 'general' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                    }`}
                            >
                                <Monitor className="w-4 h-4" />
                                General
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setActiveTab('data')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === 'data' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                        }`}
                                >
                                    <Database className="w-4 h-4" />
                                    Datos
                                </button>
                            )}
                        </div>

                        {activeTab === 'general' && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <section>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Apariencia</h3>
                                    <div className="grid grid-cols-3 gap-4 max-w-lg">
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'light'
                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                }`}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-900">
                                                <Sun className="w-5 h-5" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">Claro</span>
                                        </button>

                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'dark'
                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                }`}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-gray-900 shadow-sm flex items-center justify-center text-white">
                                                <Moon className="w-5 h-5" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">Oscuro</span>
                                        </button>

                                        <button
                                            onClick={() => setTheme('system')}
                                            className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'system'
                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                }`}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-white to-gray-900 shadow-sm flex items-center justify-center border border-gray-200">
                                                <Monitor className="w-5 h-5 text-gray-500 mix-blend-difference" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">Sistema</span>
                                        </button>
                                    </div>
                                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                                        Elegí cómo se ve la aplicación. El modo sistema se adapta a la configuración de tu dispositivo.
                                    </p>
                                </section>

                                <section className="pt-8 border-t border-gray-200 dark:border-gray-800">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Preferencias de Interfaz</h3>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Más opciones de personalización estarán disponibles próximamente para las pestañas de Pacientes, Agenda y Caja.
                                        </p>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'data' && isAdmin && (
                            <div className="animate-in fade-in duration-300">
                                <DataImporter />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
