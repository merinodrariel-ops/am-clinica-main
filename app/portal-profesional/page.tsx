
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Check, Clock, DollarSign, Home, MessageCircle, Mic, Plus, Settings, Stethoscope } from 'lucide-react';
import { getAppointments } from '@/app/actions/agenda';
import Link from 'next/link';

// Dummy components for now
const BottomNav = () => (
    <div className="fixed bottom-0 w-full max-w-lg bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center text-slate-400 z-50">
        <button className="flex flex-col items-center gap-1 text-indigo-600 dark:text-indigo-400">
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Inicio</span>
        </button>
        <button className="flex flex-col items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <Calendar className="w-6 h-6" />
            <span className="text-[10px] font-medium">Agenda</span>
        </button>
        <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center -mt-6 shadow-lg shadow-indigo-300 dark:shadow-indigo-900 text-white cursor-pointer hover:scale-105 transition-transform">
            <Plus className="w-6 h-6" />
        </div>
        <button className="flex flex-col items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <DollarSign className="w-6 h-6" />
            <span className="text-[10px] font-medium">Pagos</span>
        </button>
        <Link href="/dashboard" className="flex flex-col items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-medium">Salir</span>
        </Link>
    </div>
);

export default function PortalDashboard() {
    const [appointments, setAppointments] = useState<
        Array<{
            id: string;
            start_time: string;
            end_time: string;
            type?: string | null;
            notes?: string | null;
            patient?: { full_name?: string } | null;
        }>
    >([]);
    const [loading, setLoading] = useState(true);
    const [stats] = useState({ hoy: 154000, prox: 45000 }); // Mock stats

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        const today = new Date().toISOString().split('T')[0];
        const end = new Date();
        end.setHours(23, 59, 59);

        try {
            // Using existing server action
            const data = await getAppointments(today + 'T00:00:00', end.toISOString());
            if (data) {
                // Filter ensuring dates are valid
                const validAppointments = [...data].sort((a, b) =>
                    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                );
                setAppointments(validAppointments);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    // Find next pending appointment
    const nextPatient = appointments.find(a => new Date(a.start_time) > new Date()) || appointments[appointments.length - 1];

    return (
        <div className="flex-1 p-6 pb-28 overflow-y-auto">
            {/* Header */}
            <header className="flex justify-between items-center mb-8 pt-4">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                >
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        Hola, Dr. Ariel
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </motion.div>
                <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden ring-2 ring-indigo-100 dark:ring-indigo-900">
                    {/* User Avatar */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="https://ui-avatars.com/api/?name=Ariel+Merino&background=0D8ABC&color=fff" alt="User" />
                </div>
            </header>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-none relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white opacity-10 rounded-full -mr-10 -mt-10" />
                    <p className="text-indigo-100 text-xs font-medium mb-1 uppercase tracking-wider">Ganancia Hoy</p>
                    <p className="text-2xl font-bold tracking-tight">$ {stats.hoy.toLocaleString()}</p>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shadow-sm"
                >
                    <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">Pacientes</p>
                    <div className="flex items-baseline gap-1">
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">
                            {appointments.length}
                        </p>
                        <span className="text-sm text-slate-400 font-normal">/ 12</span>
                    </div>
                </motion.div>
            </div>

            {/* Next Patient Card */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" />
                    Próximo Turno
                </h2>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                    En curso
                </span>
            </div>

            {loading ? (
                <div className="animate-pulse h-56 bg-slate-100 dark:bg-slate-800 rounded-3xl" />
            ) : nextPatient ? (
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 relative overflow-hidden group mb-8"
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-50 dark:bg-indigo-900/20 rounded-full -mr-20 -mt-20 transition-transform group-hover:scale-110" />

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                {nextPatient.type || 'Consulta'}
                            </span>
                            <div className="text-right">
                                <span className="block text-3xl font-bold text-slate-800 dark:text-white leading-none">
                                    {new Date(nextPatient.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-xs text-slate-400">Hora inicio</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-inner flex-shrink-0">
                                {/* Patient Avatar */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`https://ui-avatars.com/api/?name=${nextPatient.patient?.full_name || 'Paciente'}&background=random&size=128`}
                                    alt="P"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white leading-tight mb-1">
                                    {nextPatient.patient?.full_name || 'Paciente Anónimo'}
                                </h3>
                                <p className="text-slate-500 text-sm line-clamp-1 flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    {nextPatient.notes || 'Control de rutina'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button className="flex-1 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-colors">
                                Ver Ficha
                            </button>
                            <button className="flex-1 bg-indigo-600 text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-shadow shadow-lg shadow-indigo-200 dark:shadow-none flex justify-center items-center gap-2">
                                <Stethoscope className="w-4 h-4" />
                                Atender
                            </button>
                        </div>
                    </div>
                </motion.div>
            ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-3xl border border-dashed border-slate-200 mb-8">
                    <Check className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>¡Todo listo por hoy!</p>
                </div>
            )}

            {/* Quick Actions Grid */}
            <h2 className="text-lg font-bold mb-4 text-slate-800 dark:text-white">Acciones Rápidas</h2>
            <div className="grid grid-cols-2 gap-3">
                <button className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-1">
                        <DollarSign className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Cobrar Express</span>
                </button>
                <button className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-1">
                        <Mic className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Dictar Evolución</span>
                </button>
            </div>

            <BottomNav />
        </div>
    );
}
