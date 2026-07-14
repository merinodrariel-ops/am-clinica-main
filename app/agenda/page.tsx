'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import AgendaCalendar from '@/components/agenda/AgendaCalendar';
import TodaySchedulePanel from '@/components/agenda/TodaySchedulePanel';
import { Calendar, Settings, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const MonthlyAgendaDashboard = dynamic(() => import('@/components/agenda/MonthlyAgendaDashboard'), { ssr: false });
const DoctorScheduleConfig = dynamic(() => import('@/components/agenda/DoctorScheduleConfig'), { ssr: false });
const AgendaBlocksManager = dynamic(() => import('@/components/agenda/AgendaBlocksManager'), { ssr: false });

type Tab = 'calendar' | 'config';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'calendar', label: 'Agenda AM', icon: <Calendar size={15} /> },
    { id: 'config', label: 'Configuración', icon: <Settings size={15} /> },
];

export default function AgendaPage() {
    const { categoria, loading: authLoading } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('calendar');
    const [showPanel, setShowPanel] = useState(false);
    const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
    const [isDesktop, setIsDesktop] = useState(false);

    const isAdminOrOwner = ['owner', 'admin', 'developer'].includes(categoria || '');
    const visibleTabs = TABS.filter(tab => {
        if (tab.id === 'config') {
            return isAdminOrOwner;
        }
        return true;
    });

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner && activeTab !== 'calendar') {
            setActiveTab('calendar');
        }
    }, [activeTab, authLoading, isAdminOrOwner]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const syncDesktop = () => setIsDesktop(mediaQuery.matches);
        syncDesktop();
        mediaQuery.addEventListener('change', syncDesktop);
        return () => mediaQuery.removeEventListener('change', syncDesktop);
    }, []);

    useEffect(() => {
        if (activeTab !== 'config' || !isAdminOrOwner || doctors.length > 0) return;

        import('@/app/actions/agenda').then(({ getDoctors }) => {
            getDoctors().then(setDoctors);
        });
    }, [activeTab, doctors.length, isAdminOrOwner]);

    return (
        <div className="h-screen flex flex-col px-2 pb-2 pt-2 md:px-4 md:pb-4 md:pt-4">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Agenda AM
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                        Agenda clínica central · Turnos, doctores y seguimiento operativo
                    </p>
                </div>

                {/* Tab Bar */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'calendar' && (
                <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-3">
                    {isDesktop && !authLoading && categoria && ['owner', 'admin', 'reception', 'recaptacion'].includes(categoria) && (
                        <MonthlyAgendaDashboard />
                    )}

                    <div className="flex-1 min-h-0 relative">
                        {/* Calendar — always full width */}
                        <AgendaCalendar />

                        {/* Floating tab to open panel */}
                        {!showPanel && (
                            <button
                                onClick={() => setShowPanel(true)}
                                className="absolute top-1/2 -translate-y-1/2 right-0 z-20 flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-l-xl px-1.5 py-4 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                title="Ver turnos de hoy"
                            >
                                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                    Hoy
                                </span>
                            </button>
                        )}

                        {/* Drawer overlay */}
                        {showPanel && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="absolute inset-0 z-20"
                                    onClick={() => setShowPanel(false)}
                                />
                                {/* Panel */}
                                <div className="absolute top-0 right-0 bottom-0 z-30 w-56 shadow-2xl">
                                    <div className="h-full relative">
                                        <button
                                            onClick={() => setShowPanel(false)}
                                            className="absolute top-2 right-2 z-10 p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                        <TodaySchedulePanel />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'config' && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="max-w-4xl mx-auto space-y-8 pb-8">
                        <DoctorScheduleConfig />
                        <hr className="border-gray-200 dark:border-gray-700" />
                        <AgendaBlocksManager doctors={doctors} />
                    </div>
                </div>
            )}

        </div>
    );
}
