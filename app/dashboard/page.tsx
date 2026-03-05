'use client';

import Link from 'next/link';
import { ArrowRight, Users, Banknote, Calendar, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
const CajaAlerts = dynamic(() => import('@/components/dashboard/CajaAlerts'), { ssr: false });
const UserAlerts = dynamic(() => import('@/components/dashboard/UserAlerts'), { ssr: false });
const StatsGrid = dynamic(() => import('@/components/dashboard/StatsGrid'), {
    ssr: false,
    loading: () => <Skeleton className="h-32 w-full rounded-xl" />
});
import { Skeleton } from '@/components/ui/Skeleton';

const ReferralChart = dynamic(() => import('@/components/dashboard/ReferralChart'), {
    ssr: false,
    loading: () => <Skeleton className="h-[250px] w-full rounded-xl" />
});
const NewPatientsCard = dynamic(() => import('@/components/dashboard/NewPatientsCard'), {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />
});
const FinancialOverview = dynamic(() => import('@/components/dashboard/FinancialOverview'), {
    ssr: false,
    loading: () => <Skeleton className="h-[400px] w-full rounded-xl" />
});
const ExecutiveCommandCenter = dynamic(() => import('@/components/dashboard/ExecutiveCommandCenter'), {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />
});
const OwnerDashboard = dynamic(() => import('@/components/dashboard/OwnerDashboard'), {
    ssr: false,
    loading: () => <Skeleton className="h-[400px] w-full rounded-xl" />
});
const SilentPatientsPanel = dynamic(() => import('@/components/patients/SilentPatientsPanel'), {
    ssr: false,
});
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
    const { categoria: role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && role === 'laboratorio') {
            router.replace('/inventario');
        }
        if (!loading && role === 'asistente') {
            router.replace('/patients');
        }
    }, [role, loading, router]);

    if (loading || role === 'laboratorio' || role === 'asistente') {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="animate-spin" size={40} style={{ color: 'hsl(165 100% 42%)' }} />
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
                    Dashboard
                </h1>
                <p className="mt-1 text-slate-400">AM Clínica – Operativa 360</p>
            </div>

            {/* Owner-only Dashboard */}
            {role === 'owner' && <OwnerDashboard />}

            {/* Pacientes con tratamiento activo sin turno hace +45 días */}
            {(role === 'owner' || role === 'admin') && <SilentPatientsPanel />}

            <UserAlerts />
            <CajaAlerts />

            <ExecutiveCommandCenter />

            {/* Financial Overview */}
            <FinancialOverview />

            {/* Real-time Stats */}
            <StatsGrid />

            {/* Analytics Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="lg:col-span-2">
                    <NewPatientsCard />
                </div>
                <div className="lg:col-span-1">
                    <ReferralChart />
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
                <Link href="/patients" className="group">
                    <div className="glass-card hover:bg-white/5 transition-colors duration-300 rounded-xl p-4 border border-white/10 group-hover:border-teal-500/50">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-teal-400 bg-teal-500/10 border border-teal-500/20 group-hover:bg-teal-500/20 transition-colors">
                                <Users size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm text-slate-200 group-hover:text-white transition-colors">Pacientes</h3>
                                <p className="text-xs text-slate-500">Gestión y fichas</p>
                            </div>
                            <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-slate-500 group-hover:text-teal-400" />
                        </div>
                    </div>
                </Link>

                <Link href="/caja-recepcion" className="group">
                    <div className="glass-card hover:bg-white/5 transition-colors duration-300 rounded-xl p-4 border border-white/10 group-hover:border-emerald-500/50">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                                <Banknote size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm text-slate-200 group-hover:text-white transition-colors">Caja Recepción</h3>
                                <p className="text-xs text-slate-500">Ingresos y cobros</p>
                            </div>
                            <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-slate-500 group-hover:text-emerald-400" />
                        </div>
                    </div>
                </Link>

                <Link href="/agenda" className="group">
                    <div className="glass-card hover:bg-white/5 transition-colors duration-300 rounded-xl p-4 border border-white/10 group-hover:border-purple-500/50">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-purple-400 bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/20 transition-colors">
                                <Calendar size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm text-slate-200 group-hover:text-white transition-colors">Agenda</h3>
                                <p className="text-xs text-slate-500">Citas y turnos</p>
                            </div>
                            <ArrowRight size={16} className="transition-all duration-300 group-hover:translate-x-1 text-slate-500 group-hover:text-purple-400" />
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
