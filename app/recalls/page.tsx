'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CalendarDays, ListChecks } from 'lucide-react';
import RecallWorklist from '@/components/recalls/RecallWorklist';
import RecallCalendar from '@/components/recalls/RecallCalendar';

export default function RecallsPage() {
    const [view, setView] = useState<'worklist' | 'calendar'>('worklist');

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {/* View Switcher */}
            <div className="flex items-center gap-2 mb-6">
                <button
                    onClick={() => setView('worklist')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all
            ${view === 'worklist'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                    <ListChecks className="w-4 h-4" />
                    Worklist
                </button>
                <button
                    onClick={() => setView('calendar')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all
            ${view === 'calendar'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                    <CalendarDays className="w-4 h-4" />
                    Calendario
                </button>
            </div>

            {/* Views */}
            <motion.div
                key={view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
            >
                {view === 'worklist' ? <RecallWorklist /> : <RecallCalendar />}
            </motion.div>
        </div>
    );
}
