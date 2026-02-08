import Link from 'next/link';
import { ArrowRight, Users, Banknote, Calendar, TrendingUp } from 'lucide-react';
import CajaAlerts from '@/components/dashboard/CajaAlerts';
import UserAlerts from '@/components/dashboard/UserAlerts';
import StatsGrid from '@/components/dashboard/StatsGrid';
import ReferralChart from '@/components/dashboard/ReferralChart';
import NewPatientsCard from '@/components/dashboard/NewPatientsCard';

export default function DashboardPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Dashboard
                </h1>
                <p className="text-gray-500 mt-1">AM Clínica – Operativa 360</p>
            </div>

            <UserAlerts />
            <CajaAlerts />

            {/* Real-time Stats */}
            <StatsGrid />

            {/* Analytics Section - Redesigned */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {/* Pacientes Nuevos - Principal */}
                <div className="lg:col-span-2">
                    <NewPatientsCard />
                </div>

                {/* Origen de Pacientes - Compacto */}
                <div className="lg:col-span-1">
                    <ReferralChart />
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/patients" className="group">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center text-white">
                                <Users size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Pacientes</h3>
                                <p className="text-xs text-gray-500 truncate">Gestión y fichas</p>
                            </div>
                            <ArrowRight size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                        </div>
                    </div>
                </Link>

                <Link href="/caja-recepcion" className="group">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-green-500 flex items-center justify-center text-white">
                                <Banknote size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Caja Recepción</h3>
                                <p className="text-xs text-gray-500 truncate">Ingresos y cobros</p>
                            </div>
                            <ArrowRight size={16} className="text-gray-400 group-hover:text-green-500 transition-colors" />
                        </div>
                    </div>
                </Link>

                <Link href="/agenda" className="group">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-purple-500 flex items-center justify-center text-white">
                                <Calendar size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Agenda</h3>
                                <p className="text-xs text-gray-500 truncate">Citas y turnos</p>
                            </div>
                            <ArrowRight size={16} className="text-gray-400 group-hover:text-purple-500 transition-colors" />
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
