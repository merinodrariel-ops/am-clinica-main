'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar, Check, Clock, DollarSign, Home,
    Settings, Stethoscope, Menu, X, Bell,
    LogOut, Plus
} from 'lucide-react';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import { getMyLiquidation, getEmpireLeaderboard } from '@/app/actions/empire';
import { getAppointments } from '@/app/actions/agenda';

// Empire Components
import { GlassCard } from '@/components/portal-empire/GlassCard';
import { VirtualWallet } from '@/components/portal-empire/VirtualWallet';
import { EmpireLeaderboard } from '@/components/portal-empire/EmpireLeaderboard';
import { CommanderView } from '@/components/portal-empire/CommanderView';
import { BadgeDisplay } from '@/components/portal-empire/BadgeDisplay';

export default function PortalDashboard() {
    const { profile, role, user, signOut } = useAuth();
    const [appointments, setAppointments] = useState<any[]>([]);
    const [liquidation, setLiquidation] = useState<any>(null);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const isCommander = role === 'owner' || user?.email === 'dr.arielmerinopersonal@gmail.com';

    useEffect(() => {
        if (profile?.id) {
            loadAllData();
        }
    }, [profile?.id]);

    async function loadAllData() {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const end = new Date();
        end.setHours(23, 59, 59);

        try {
            const [apptData, liqData, leaderData] = await Promise.all([
                getAppointments(today + 'T00:00:00', end.toISOString()),
                getMyLiquidation(profile!.id),
                getEmpireLeaderboard()
            ]);

            if (apptData) setAppointments(apptData);
            if (liqData) setLiquidation(liqData);
            if (leaderData) setLeaderboard(leaderData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const nextPatient = appointments.find(a => new Date(a.start_time) > new Date()) || appointments[appointments.length - 1];
    const myRank = leaderboard.findIndex(e => e.profileId === profile?.id) + 1;
    const myBadges = leaderboard.find(e => e.profileId === profile?.id)?.badges || [];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
            {/* Background Decorative Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full" />
                <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-blue-600/10 blur-[100px] rounded-full" />
            </div>

            <div className="relative z-10 p-6 pb-28 max-w-lg mx-auto">
                {/* Header */}
                <header className="flex justify-between items-center mb-10 pt-4">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                        <h1 className="text-3xl font-black bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent italic">
                            EMPIRE ENGINE
                        </h1>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </motion.div>

                    <div className="flex items-center gap-3">
                        <button className="relative w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                            <Bell className="w-5 h-5 text-indigo-300" />
                            <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full border-2 border-slate-950" />
                        </button>
                        <button
                            onClick={() => setIsMenuOpen(true)}
                            className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"
                        >
                            <Menu className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </header>

                {loading ? (
                    <div className="space-y-6">
                        <div className="h-48 bg-white/5 animate-pulse rounded-3xl" />
                        <div className="h-64 bg-white/5 animate-pulse rounded-3xl" />
                    </div>
                ) : (
                    <>
                        {/* Status Quo: User Info & Badges */}
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-16 h-16 rounded-2xl border-2 border-indigo-500/50 p-1 bg-indigo-500/10">
                                <img
                                    src={`https://ui-avatars.com/api/?name=${profile?.full_name || 'User'}&background=6366f1&color=fff&size=128`}
                                    alt="Profile"
                                    className="w-full h-full rounded-xl object-cover"
                                />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-black text-white leading-tight">
                                    Hola, {profile?.full_name?.split(' ')[0] || 'Doc'}
                                </h2>
                                <p className="text-indigo-400/60 text-xs font-bold uppercase tracking-widest">
                                    Rango #{myRank || '-'} Empire
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {myBadges.map((b: string) => (
                                    <BadgeDisplay key={b} badgeName={b} />
                                ))}
                            </div>
                        </div>

                        {/* Commander View for Dr. Merino */}
                        {isCommander && (
                            <CommanderView leaderboardEntries={leaderboard} />
                        )}

                        {/* Liquidación Engine: Virtual Wallet */}
                        {liquidation && (
                            <VirtualWallet
                                totalUsd={liquidation.totalUsd}
                                totalArs={liquidation.totalArs}
                                exchangeRate={liquidation.exchangeRate}
                                status={liquidation.status}
                            />
                        )}

                        {/* Next Patient - The Glass Style */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300/50 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Próxima Intervención
                            </h3>
                        </div>

                        {nextPatient ? (
                            <GlassCard className="p-6 mb-8 group" delay={0.2}>
                                <div className="flex justify-between items-start mb-6">
                                    <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                        {nextPatient.type || 'Consulta'}
                                    </span>
                                    <div className="text-right">
                                        <span className="block text-3xl font-black text-white leading-none">
                                            {new Date(nextPatient.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 p-1">
                                        <img
                                            src={`https://ui-avatars.com/api/?name=${nextPatient.patient?.full_name || 'Paciente'}&background=random&size=128`}
                                            alt="P"
                                            className="w-full h-full rounded-xl object-cover opacity-80"
                                        />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-white leading-tight">
                                            {nextPatient.patient?.full_name || 'Paciente Anónimo'}
                                        </h4>
                                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                                            {nextPatient.notes || 'Control de rutina'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">
                                        Ficha
                                    </button>
                                    <button className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2">
                                        <Stethoscope className="w-4 h-4" />
                                        Atender
                                    </button>
                                </div>
                            </GlassCard>
                        ) : (
                            <GlassCard className="p-10 text-center mb-8 border-dashed">
                                <Check className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
                                <p className="text-xs font-black uppercase tracking-widest text-white/30">Misión Cumplida por Hoy</p>
                            </GlassCard>
                        )}

                        {/* Leaderboard Section */}
                        <EmpireLeaderboard
                            entries={leaderboard}
                            currentUserId={profile?.id || ''}
                        />
                    </>
                )}

                {/* Bottom Navigation */}
                <div className="fixed bottom-6 left-6 right-6 h-20 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex justify-around items-center px-6 shadow-2xl z-50">
                    <button className="p-3 text-indigo-400">
                        <Home className="w-6 h-6" />
                    </button>
                    <button className="p-3 text-white/40 hover:text-white transition-colors">
                        <Calendar className="w-6 h-6" />
                    </button>
                    <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center -mt-10 shadow-xl shadow-indigo-600/40 border-4 border-slate-950">
                        <Plus className="w-6 h-6 text-white" />
                    </div>
                    <button className="p-3 text-white/40 hover:text-white transition-colors">
                        <DollarSign className="w-6 h-6" />
                    </button>
                    <button className="p-3 text-white/40 hover:text-white transition-colors">
                        <Settings className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Side Menu Drawer */}
            <AnimatePresence>
                {isMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMenuOpen(false)}
                            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100]"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-slate-900 border-l border-white/10 z-[101] p-8 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-12">
                                <h3 className="font-black italic text-xl">MENU</h3>
                                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-white/5 rounded-xl">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <nav className="space-y-6">
                                <Link href="/portal-profesional" className="flex items-center gap-4 text-white hover:text-indigo-400 transition-colors">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                                        <Home className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold uppercase tracking-widest text-sm">Dashboard</span>
                                </Link>
                                <button onClick={() => signOut()} className="flex items-center gap-4 text-rose-400 hover:text-rose-300 transition-colors w-full text-left">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                                        <LogOut className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold uppercase tracking-widest text-sm">Cerrar Sesión</span>
                                </button>
                            </nav>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
