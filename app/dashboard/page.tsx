import Link from 'next/link';
import { ArrowRight, Users, Banknote, BarChart3 } from 'lucide-react';
import CajaAlerts from '@/components/dashboard/CajaAlerts';
import UserAlerts from '@/components/dashboard/UserAlerts';
import StatsGrid from '@/components/dashboard/StatsGrid';
import ReferralChart from '@/components/dashboard/ReferralChart';

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

            {/* Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <ReferralChart />
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-center items-center text-center">
                    <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                        <BarChart3 size={24} />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Análisis de Tratamientos</h3>
                    <p className="text-sm text-gray-500 mt-2 max-w-[250px]">
                        Próximamente: Gráficos de rentabilidad por especialidad y evolución de cobros.
                    </p>
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link href="/patients" className="group">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                                    <Users size={24} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Pacientes</h3>
                                    <p className="text-sm text-gray-500">Gestión de pacientes y fichas</p>
                                </div>
                            </div>
                            <ArrowRight className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                        </div>
                    </div>
                </Link>

                <Link href="/caja-recepcion" className="group">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-green-500 flex items-center justify-center text-white">
                                    <Banknote size={24} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Caja Recepción</h3>
                                    <p className="text-sm text-gray-500">Ingresos y cobros de pacientes</p>
                                </div>
                            </div>
                            <ArrowRight className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
