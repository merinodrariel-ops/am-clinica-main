'use client';

import { useState } from 'react';
import AgendaCalendar from '@/components/agenda/AgendaCalendar';
import TodaySchedulePanel from '@/components/agenda/TodaySchedulePanel';
import WaitingRoomDashboard from '@/components/agenda/WaitingRoomDashboard';
import DoctorScheduleConfig from '@/components/agenda/DoctorScheduleConfig';
import CsvImportWizard from '@/components/agenda/CsvImportWizard';
import { Calendar, Users, Settings, Upload } from 'lucide-react';

type Tab = 'calendar' | 'waiting' | 'config' | 'import';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'calendar', label: 'Agenda 360', icon: <Calendar size={15} /> },
    { id: 'waiting', label: 'Sala de Espera', icon: <Users size={15} /> },
    { id: 'config', label: 'Configuración', icon: <Settings size={15} /> },
    { id: 'import', label: 'Importar Histórico', icon: <Upload size={15} /> },
];

export default function AgendaPage() {
    const [activeTab, setActiveTab] = useState<Tab>('calendar');

    return (
        <div className="h-[calc(100vh-theme(spacing.20))] flex flex-col">
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
                <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,2.1fr)_minmax(320px,1fr)] gap-4">
                    <div className="min-h-[65vh] xl:min-h-0">
                        <AgendaCalendar />
                    </div>
                    <div className="min-h-[320px] xl:min-h-0">
                        <TodaySchedulePanel />
                    </div>
                </div>
            )}

            {activeTab === 'waiting' && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="max-w-3xl mx-auto">
                        <WaitingRoomDashboard />
                    </div>
                </div>
            )}

            {activeTab === 'config' && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="max-w-4xl mx-auto">
                        <DoctorScheduleConfig />
                    </div>
                </div>
            )}

            {activeTab === 'import' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 xl:p-8">
                    <div className="max-w-4xl mx-auto">
                        <CsvImportWizard />
                    </div>
                </div>
            )}
        </div>
    );
}
