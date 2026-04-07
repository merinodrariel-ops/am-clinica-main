'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CalendarDays, ListChecks, Download } from 'lucide-react';
import Link from 'next/link';
import RecallWorklist from '@/components/recalls/RecallWorklist';
import RecallCalendar from '@/components/recalls/RecallCalendar';

export default function RecallsPage() {
    const [view, setView] = useState<'worklist' | 'calendar'>('worklist');

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {/* View Switcher */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setView('worklist')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all
                ${view === 'worklist'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                        <ListChecks className="w-4 h-4" />
                        Seguimientos
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

                <Link
                    href="/recalls/import"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-xl transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Importar desde Calendar
                </Link>
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
