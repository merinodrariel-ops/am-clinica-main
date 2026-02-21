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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center p-4">
            {/* Ambient glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Card */}
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
                >
                    <AnimatePresence mode="wait">

                        {/* ── Input step ── */}
                        {(step === 'input' || step === 'error') && (
                            <motion.div
                                key="input"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Logo mark */}
                                <div className="flex items-center justify-center mb-8">
                                    <div className="h-14 w-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                                        <ShieldCheck size={28} className="text-white" />
                                    </div>
                                </div>

                                <h1 className="text-2xl font-bold text-white text-center mb-1">
                                    Tu Portal de Clínica
                                </h1>
                                <p className="text-slate-400 text-sm text-center mb-8">
                                    Ingresá tu email y te enviamos un enlace seguro de acceso
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="relative">
                                        <Mail
                                            size={18}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                                        />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => { setEmail(e.target.value); if (step === 'error') setStep('input'); }}
                                            placeholder="tu@email.com"
                                            required
                                            autoFocus
                                            className="w-full pl-12 pr-4 py-4 bg-white/[0.06] border border-white/10 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                        />
                                    </div>

                                    {step === 'error' && (
                                        <p className="text-red-400 text-xs text-center">{errorMsg}</p>
                                    )}

                                    <button
                                        type="submit"
                                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 text-sm"
                                    >
                                        Recibir Acceso Mágico
                                        <ArrowRight size={16} />
                                    </button>
                                </form>

                                <p className="text-slate-600 text-xs text-center mt-6">
                                    🔒 Enlace de un solo uso · Sin contraseña · Expira en 24h
                                </p>
                            </motion.div>
                        )}

                        {/* ── Loading step ── */}
                        {step === 'loading' && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.3 }}
                                className="flex flex-col items-center justify-center py-12 gap-6"
                            >
                                <div className="relative">
                                    <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                                        <Loader2 size={32} className="text-blue-400 animate-spin" />
                                    </div>
                                    <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                                </div>
                                <div className="text-center">
                                    <p className="text-white font-medium mb-1">Enviando tu enlace...</p>
                                    <p className="text-slate-400 text-sm">Estamos preparando tu acceso seguro</p>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Sent step ── */}
                        {step === 'sent' && (
                            <motion.div
                                key="sent"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col items-center justify-center py-8 gap-5 text-center"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 18 }}
                                    className="h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center"
                                >
                                    <CheckCircle2 size={40} className="text-emerald-400" />
                                </motion.div>

                                <div>
                                    <h2 className="text-xl font-bold text-white mb-2">¡Enlace enviado!</h2>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        Revisá tu bandeja de entrada en<br />
                                        <span className="text-white font-medium">{email}</span>
                                    </p>
                                    <p className="text-slate-500 text-xs mt-3">
                                        Si no aparece, revisá la carpeta de spam.
                                    </p>
                                </div>

                                <button
                                    onClick={() => { setStep('input'); setEmail(''); }}
                                    className="text-slate-400 hover:text-white text-xs underline underline-offset-2 transition-colors mt-2"
                                >
                                    Usar otro email
                                </button>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </motion.div>

                {/* Footer */}
                <p className="text-center text-slate-600 text-xs mt-6">
                    AM Clínica · Puerto Madero, CABA
                </p>
            </div>
        </div>
    );
}
