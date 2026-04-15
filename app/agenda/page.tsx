'use client';

import { useState, useEffect } from 'react';
import AgendaCalendar from '@/components/agenda/AgendaCalendar';
import TodaySchedulePanel from '@/components/agenda/TodaySchedulePanel';
import DoctorScheduleConfig from '@/components/agenda/DoctorScheduleConfig';
import CsvImportWizard from '@/components/agenda/CsvImportWizard';
import DoctorReassignmentPanel from '@/components/agenda/DoctorReassignmentPanel';
import AgendaBlocksManager from '@/components/agenda/AgendaBlocksManager';
import { Calendar, Settings, Upload, X } from 'lucide-react';

type Tab = 'calendar' | 'config' | 'import';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'calendar', label: 'Agenda 360', icon: <Calendar size={15} /> },
    { id: 'config', label: 'Configuración', icon: <Settings size={15} /> },
    { id: 'import', label: 'Importar Histórico', icon: <Upload size={15} /> },
];

export default function AgendaPage() {
    const [activeTab, setActiveTab] = useState<Tab>('calendar');
    const [showPanel, setShowPanel] = useState(false);
    const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);

    useEffect(() => {
        import('@/app/actions/agenda').then(({ getDoctors }) => {
            getDoctors().then(setDoctors);
        });
    }, []);

    return (
        <div className="h-screen flex flex-col px-4 pb-4 pt-4">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        AM·Scheduler
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sistema de agenda propietario · Reemplaza Google Calendar y Calendly
                    </p>
                </div>

                {/* Tab Bar */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                    {TABS.map(tab => (
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

            {activeTab === 'import' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 xl:p-8">
                    <div className="max-w-4xl mx-auto space-y-8">
                        <CsvImportWizard />
                        <DoctorReassignmentPanel />
                    </div>
                </div>
            )}
        </div>
    );
}
