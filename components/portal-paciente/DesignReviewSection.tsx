'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';

interface DesignReviewSectionProps {
    patientId: string;
    token: string;
    label: string;
    hasHtml: boolean;
}

type Step = 'view' | 'respond' | 'confirmed';
type Action = 'approved' | 'revision';

export default function DesignReviewSection({ patientId, token, label, hasHtml }: DesignReviewSectionProps) {
    const [step, setStep] = useState<Step>('view');
    const [action, setAction] = useState<Action | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [markedViewed, setMarkedViewed] = useState(false);

    function handleIframeLoad() {
        setIframeLoaded(true);
        if (!markedViewed) {
            setMarkedViewed(true);
            fetch(`/api/design-review/${patientId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action: 'viewed' }),
            }).catch(() => {});
        }
    }

    async function handleRespond() {
        if (!action) return;
        setLoading(true);
        try {
            await fetch(`/api/design-review/${patientId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action, comment: comment.trim() || undefined }),
            });
        } catch {
            // no bloquear al paciente
        }
        setStep('confirmed');
        setLoading(false);
    }

    const htmlSrc = `/api/design-review/${patientId}/html?token=${token}`;

    return (
        <section className="rounded-3xl bg-[#14141A] border border-white/5 overflow-hidden">
            <div className="p-6 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={16} className="text-[#C9A96E]" />
                    <h2 className="text-white font-bold text-lg">Tu Diseño de Sonrisa</h2>
                </div>
                <p className="text-white/40 text-sm">
                    {label} · Mirá el diseño en 3D y contanos qué pensás.
                </p>
            </div>

            {hasHtml ? (
                <div className="relative">
                    {!iframeLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0D0D12] z-10 min-h-[50vh]">
                            <div className="text-center">
                                <RefreshCw size={28} className="text-[#C9A96E] animate-spin mx-auto mb-3" />
                                <p className="text-white/40 text-sm">Cargando tu diseño...</p>
                            </div>
                        </div>
                    )}
                    <div className={fullscreen ? 'fixed inset-0 z-50 bg-black' : 'relative min-h-[70vh]'}>
                        <iframe
                            src={htmlSrc}
                            onLoad={handleIframeLoad}
                            className="w-full h-full min-h-[70vh] border-0"
                            sandbox="allow-scripts allow-same-origin"
                            title="Diseño de Sonrisa"
                        />
                        <button
                            onClick={() => setFullscreen(f => !f)}
                            className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white/60 text-xs border border-white/10 hover:bg-black/80 transition-colors"
                        >
                            {fullscreen ? 'Cerrar' : 'Pantalla completa'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mx-6 mb-4 p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <p className="text-white/40 text-sm">El diseño se está preparando. Te avisamos cuando esté listo.</p>
                </div>
            )}

            <div className="p-6 pt-4">
                <AnimatePresence mode="wait">
                    {step === 'view' && (
                        <motion.div key="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
                            <p className="text-white/60 text-sm font-medium">¿Qué te parece el diseño?</p>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Escribí tu opinión (opcional)..."
                                rows={3}
                                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm px-4 py-3 focus:outline-none focus:border-[#C9A96E]/40 resize-none"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={() => { setAction('approved'); setStep('respond'); }}
                                    className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-sm hover:bg-emerald-500/20 transition-colors active:scale-95"
                                >
                                    <CheckCircle2 size={18} />
                                    Me encanta, apruebo el diseño
                                </button>
                                <button
                                    onClick={() => { setAction('revision'); setStep('respond'); }}
                                    className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold text-sm hover:bg-amber-500/20 transition-colors active:scale-95"
                                >
                                    Quiero hacer cambios
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'respond' && (
                        <motion.div key="respond" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                            <div className={`p-4 rounded-2xl border text-sm font-medium ${action === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                                {action === 'approved' ? 'Vas a aprobar este diseño de sonrisa' : 'Vas a pedir cambios en el diseño'}
                            </div>
                            <p className="text-white/40 text-xs text-center">¿Estás segura?</p>
                            <div className="flex gap-3">
                                <button onClick={() => setStep('view')} className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-colors">
                                    Volver
                                </button>
                                <button onClick={handleRespond} disabled={loading} className="flex-[2] px-4 py-3 rounded-xl bg-[#C9A96E] text-black font-bold text-sm hover:bg-[#C9A96E]/90 transition-colors disabled:opacity-50">
                                    {loading ? 'Enviando...' : 'Confirmar'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'confirmed' && (
                        <motion.div key="confirmed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                            <div className="text-4xl mb-3">✨</div>
                            <p className="text-white font-bold text-lg mb-1">
                                {action === 'approved' ? '¡Diseño aprobado!' : '¡Mensaje enviado!'}
                            </p>
                            <p className="text-white/40 text-sm">
                                {action === 'approved'
                                    ? 'Le avisamos al equipo. Pronto nos ponemos en contacto.'
                                    : 'Recibimos tu feedback. El diseñador va a trabajar en los cambios.'}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
}
