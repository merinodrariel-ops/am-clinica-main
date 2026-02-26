'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

type Step = 'input' | 'loading' | 'sent' | 'error';

export default function PatientPortalAccess() {
    const [email, setEmail] = useState('');
    const [step, setStep] = useState<Step>('input');
    const [errorMsg, setErrorMsg] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return;

        setStep('loading');

        try {
            const res = await fetch('/api/patient-portal/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Error al enviar');
            }

            setStep('sent');
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
            setStep('error');
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0a1128] to-[#020617] flex items-center justify-center p-4 relative font-sans">
            {/* Ambient High-Contrast Glows */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] opacity-40" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] opacity-40" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Branding Above Card */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center mb-10"
                >
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-md mb-4 shadow-sm">
                        <ShieldCheck size={14} className="text-blue-400" />
                        <span className="text-[10px] font-black tracking-[0.2em] text-blue-200 uppercase">Acceso Privado Premium</span>
                    </div>
                </motion.div>

                {/* Main Card */}
                <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-slate-900/40 backdrop-blur-2xl border border-white/[0.08] rounded-[2.5rem] p-10 shadow-[0_32px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
                >
                    <AnimatePresence mode="wait">

                        {/* ── Input step ── */}
                        {(step === 'input' || step === 'error') && (
                            <motion.div
                                key="input"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.4 }}
                            >
                                <div className="text-center mb-10">
                                    <h1 className="text-3xl font-black text-white tracking-tight mb-3">
                                        Hola de nuevo.
                                    </h1>
                                    <p className="text-slate-400 text-sm leading-relaxed max-w-[280px] mx-auto font-medium">
                                        Ingresá tu email para que te enviemos un acceso directo a tu historial.
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                                            <Mail
                                                size={20}
                                                className="text-slate-500 group-focus-within:text-blue-400 transition-colors"
                                            />
                                        </div>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => { setEmail(e.target.value); if (step === 'error') setStep('input'); }}
                                            placeholder="tu@email.com"
                                            required
                                            autoFocus
                                            className="w-full pl-14 pr-6 py-5 bg-white/[0.03] border border-white/10 rounded-3xl text-white placeholder-slate-600 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all shadow-inner"
                                        />
                                    </div>

                                    {step === 'error' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-xl"
                                        >
                                            <p className="text-red-400 text-xs font-bold text-center">{errorMsg}</p>
                                        </motion.div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={step === 'loading'}
                                        className="w-full group/btn relative flex items-center justify-center gap-3 bg-white text-slate-950 font-black py-5 rounded-3xl transition-all active:scale-[0.98] overflow-hidden shadow-[0_12px_24px_rgba(255,255,255,0.1)]"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/40 to-blue-400/0 opacity-0 group-hover/btn:opacity-100 group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                        <span className="relative">Recibir Enlace Mágico</span>
                                        <ArrowRight size={18} className="relative group-hover/btn:translate-x-1 transition-transform" />
                                    </button>
                                </form>

                                <div className="mt-12 pt-8 border-t border-white/[0.05] text-center">
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">¿No tenés cuenta?</p>
                                    <a
                                        href="/admision"
                                        className="inline-flex items-center gap-2 text-white hover:text-blue-400 text-sm font-black transition-all group/link"
                                    >
                                        Registrarme como Paciente
                                        <ArrowRight size={14} className="group-hover/link:translate-x-1 transition-transform" />
                                    </a>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Loading step ── */}
                        {step === 'loading' && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center justify-center py-16 gap-8 text-center"
                            >
                                <div className="relative">
                                    <div className="h-24 w-24 rounded-[30%] bg-blue-500/10 flex items-center justify-center border border-blue-500/20 rotate-12 animate-pulse">
                                        <Loader2 size={48} className="text-blue-400 animate-spin" />
                                    </div>
                                    <div className="absolute -inset-4 rounded-full bg-blue-400/5 blur-xl animate-pulse" />
                                </div>
                                <div>
                                    <h2 className="text-white text-2xl font-black mb-2 tracking-tight">Validando...</h2>
                                    <p className="text-slate-400 font-medium">Estamos protegiendo tu información.</p>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Sent step ── */}
                        {step === 'sent' && (
                            <motion.div
                                key="sent"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 20 }}
                                className="flex flex-col items-center justify-center py-6 gap-8 text-center"
                            >
                                <div className="h-28 w-28 rounded-full bg-emerald-500/10 flex items-center justify-center border-4 border-emerald-500/20 relative shadow-[0_0_60px_rgba(16,185,129,0.1)]">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -45 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ delay: 0.2, type: 'spring' }}
                                    >
                                        <CheckCircle2 size={56} className="text-emerald-400" />
                                    </motion.div>
                                    <div className="absolute inset-0 rounded-full bg-emerald-400/10 animate-ping" />
                                </div>

                                <div className="space-y-4">
                                    <h2 className="text-3xl font-black text-white tracking-tight leading-tight">
                                        ¡Revisá tu email!
                                    </h2>
                                    <p className="text-slate-400 text-base leading-relaxed font-medium">
                                        Enviamos un enlace de acceso a<br />
                                        <span className="text-white font-black underline decoration-blue-500/30 underline-offset-4">{email}</span>
                                    </p>
                                    <div className="inline-flex items-center gap-2 py-2 px-4 bg-white/5 rounded-full border border-white/10">
                                        <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Válido por 24 horas</span>
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <button
                                        onClick={() => { setStep('input'); setEmail(''); }}
                                        className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-300 hover:text-white text-sm font-bold transition-all"
                                    >
                                        Intentar con otro email
                                    </button>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </motion.div>

                {/* Footer Credits */}
                <p className="text-center text-slate-700 text-[10px] font-black uppercase tracking-[0.3em] mt-12 opacity-50">
                    AM Clínica &copy; 2024 · All Rights Reserved
                </p>
            </div>

            <style jsx global>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
}
