import AgendaCalendar from '@/components/agenda/AgendaCalendar';

export default function AgendaPage() {
    return (
        <div className="h-[calc(100vh-theme(spacing.20))] flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agenda 360</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestión de turnos y estado operativo</p>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <AgendaCalendar />
            </div>
        </div>
    );
}
