'use client';

import { type MouseEvent, use, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
    Calendar,
    CheckCircle2,
    Circle,
    CreditCard,
    Download,
    FileText,
    Loader2,
    Phone,
    Smile,
    Sparkles,
    AlertTriangle,
    Image as ImageIcon,
    Lock,
} from 'lucide-react';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import dynamic from 'next/dynamic';
import PatientPaymentHistory from '@/components/caja/PatientPaymentHistory';

const STLSection = dynamic(() => import('@/components/portal-paciente/STLSection'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-64 rounded-2xl bg-white/5 border border-white/10">
            <Loader2 size={28} className="text-gold-400 animate-spin" />
        </div>
    ),
});

const DesignReviewSection = dynamic(() => import('@/components/portal-paciente/DesignReviewSection'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-48 rounded-2xl bg-white/5 border border-white/10">
            <Loader2 size={28} className="text-[#C9A96E] animate-spin" />
        </div>
    ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalData {
    patient: {
        id_paciente: string;
        nombre: string;
        apellido: string;
        email: string | null;
        whatsapp: string | null;
        estado_paciente: string | null;
    };
    treatment: {
        id: string;
        status: string;
        last_stage_change: string;
        workflow_name: string;
        current_stage_name: string;
        current_stage_order: number;
    } | null;
    allStages: { id: string; name: string; order_index: number }[] | null;
    plan: {
        descripcion: string | null;
        total_usd: number;
        senal_usd: number | null;
        saldo_usd: number | null;
        estado_plan: string;
    } | null;
    payments: {
        id: string;
        fecha_hora: string;
        fecha_movimiento?: string;
        concepto_nombre: string;
        monto: number;
        moneda: string;
        estado: string;
        metodo_pago?: string;
        cuota_nro: number | null;
        cuotas_total: number | null;
        comprobante_url: string | null;
    }[];
    nextAppointment: {
        start_time: string;
        type: string | null;
        doctor_id: string | null;
    } | null;
    files: {
        id: string;
        file_type: string;
        label: string;
        file_url: string;
        thumbnail_url: string | null;
        created_at: string;
    }[];
    designReview?: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
        storage_html_url: string | null;
    } | null;
}

// ─── Smile before/after slider ────────────────────────────────────────────────

function SmileSlider({ before, after, label }: { before: string; after: string; label: string }) {
    const [pos, setPos] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    function updatePos(clientX: number) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
        setPos(pct);
    }

    return (
        <div className="space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-widest">{label}</p>
            <div
                ref={containerRef}
                className="relative h-64 rounded-2xl overflow-hidden cursor-ew-resize select-none border border-white/10"
                onMouseDown={e => { dragging.current = true; updatePos(e.clientX); }}
                onMouseMove={e => { if (dragging.current) updatePos(e.clientX); }}
                onMouseUp={() => { dragging.current = false; }}
                onMouseLeave={() => { dragging.current = false; }}
                onTouchStart={e => { dragging.current = true; updatePos(e.touches[0].clientX); }}
                onTouchMove={e => { if (dragging.current) updatePos(e.touches[0].clientX); }}
                onTouchEnd={() => { dragging.current = false; }}
            >
                {/* Before image */}
                <img src={before} alt="Antes" className="absolute inset-0 w-full h-full object-cover" />

                {/* After image - clipped */}
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
                    <img src={after} alt="Después" className="absolute inset-0 h-full object-cover" style={{ width: `${10000 / pos}%` }} />
                </div>

                {/* Divider */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-lg" style={{ left: `${pos}%` }}>
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-white shadow-xl flex items-center justify-center">
                        <span className="text-gray-800 text-xs font-bold select-none">↔</span>
                    </div>
                </div>

                {/* Labels */}
                <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 rounded-lg text-xs text-white/80 backdrop-blur">Antes</div>
                <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 rounded-lg text-xs text-white/80 backdrop-blur">Después</div>
            </div>
        </div>
    );
}

// ─── Section wrapper with scroll animation ────────────────────────────────────

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

interface StarItem {
    left: number; top: number; size: number;
    opacity: number; duration: number; delay: number;
}

export default function MiClinicaPortal({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const [data, setData] = useState<PortalData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stars, setStars] = useState<StarItem[]>([]);
    const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);

    useEffect(() => {
        const rafId = window.requestAnimationFrame(() => {
            setStars(Array.from({ length: 40 }, () => ({
                left: Math.random() * 100,
                top: Math.random() * 60,
                size: Math.random() > 0.8 ? 2 : 1,
                opacity: Math.random() * 0.4 + 0.1,
                duration: 2 + Math.random() * 3,
                delay: Math.random() * 2,
            })));
        });

        return () => window.cancelAnimationFrame(rafId);
    }, []);

    const { scrollY } = useScroll();
    const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
    const heroY = useTransform(scrollY, [0, 300], [0, -60]);

    useEffect(() => {
        fetch(`/api/portal/${token}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) setError(d.error);
                else setData(d);
            })
            .catch(() => setError('No se pudo cargar tu portal'))
            .finally(() => setLoading(false));
    }, [token]);

    // ── Loading ──
    if (loading) return (
        <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center gap-6">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="h-16 w-16 rounded-full border-2 border-[#C9A96E]/30 border-t-[#C9A96E]"
            />
            <p className="text-white/40 text-sm tracking-widest uppercase">Cargando tu portal</p>
        </div>
    );

    // ── Error ──
    if (error || !data) return (
        <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center gap-4 px-6">
            <div className="h-16 w-16 rounded-2xl bg-red-900/20 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-white text-xl font-bold text-center">Enlace no válido</h2>
            <p className="text-white/40 text-sm text-center max-w-xs">
                {error === 'Token inválido' || error === 'Token expirado'
                    ? 'Este enlace no es válido o expiró. Pedile al equipo de AM Clínica un nuevo enlace.'
                    : 'Ocurrió un error. Por favor contactá a la clínica.'}
            </p>
            <a href="https://wa.me/5491100000000" className="mt-4 px-5 py-2.5 rounded-xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 text-[#C9A96E] text-sm font-medium">
                Contactar AM Clínica
            </a>
        </div>
    );

    const { patient, treatment, allStages, plan, payments, nextAppointment, files, designReview } = data;

    const stlFiles = files.filter(f => f.file_type === 'stl');
    const smileFiles = files.filter(f => f.file_type === 'smile_design');
    const beforePhotos = files.filter(f => f.file_type === 'photo_before');
    const afterPhotos = files.filter(f => f.file_type === 'photo_after');
    const comparisonPhotos = files.filter(f => f.file_type === 'photo_comparison');
    const docFiles = files.filter(f => f.file_type === 'document' || f.file_type === 'comprobante');

    const paidCuotas = payments.filter(p => p.cuota_nro !== null && p.cuota_nro > 0).length;
    const totalCuotas = payments.find(p => p.cuotas_total)?.cuotas_total || 0;
    const totalPaid = payments.reduce((s, p) => s + p.monto, 0);

    return (
        <div className="min-h-screen bg-[#0A0A0F] text-white">

            {/* ── Hero ── */}
            <motion.section
                style={{ opacity: heroOpacity, y: heroY }}
                className="relative min-h-[70vh] sm:min-h-[80vh] flex flex-col justify-end overflow-hidden"
            >
                {/* Background gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F] via-[#0D0D1A] to-[#0A0A0F]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(201,169,110,0.12),transparent)]" />

                {/* Stars effect — generated client-side to avoid hydration mismatch */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {stars.map((s, i) => (
                        <motion.div
                            key={i}
                            className="absolute rounded-full bg-white"
                            style={{
                                left: `${s.left}%`,
                                top: `${s.top}%`,
                                width: s.size,
                                height: s.size,
                                opacity: s.opacity,
                            }}
                            animate={{ opacity: [s.opacity, 0.05, s.opacity] }}
                            transition={{ duration: s.duration, repeat: Infinity, repeatType: 'reverse', delay: s.delay }}
                        />
                    ))}
                </div>

                {/* Clinic header */}
                <div className="relative z-10 px-6 pt-10">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="flex items-center gap-2"
                    >
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#C9A96E] to-[#E8D5A3] flex items-center justify-center">
                            <span className="text-[#0A0A0F] text-xs font-extrabold">AM</span>
                        </div>
                        <span className="text-white/60 text-sm font-medium">AM Clínica · Estética Dental</span>
                        <div className="ml-auto flex items-center gap-1 text-white/30 text-xs">
                            <Lock size={11} />
                            <span>Portal Privado</span>
                        </div>
                    </motion.div>
                </div>

                {/* Main hero content */}
                <div className="relative z-10 px-6 pb-16 pt-24">
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-[#C9A96E] text-sm tracking-widest uppercase mb-3"
                    >
                        Hola,
                    </motion.p>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-none mb-6"
                    >
                        {patient.nombre}
                        <br />
                        <span className="text-white/30">{patient.apellido}</span>
                    </motion.h1>

                    {/* Status badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex flex-wrap gap-3"
                    >
                        {treatment && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#C9A96E]/10 border border-[#C9A96E]/20">
                                <div className="h-1.5 w-1.5 rounded-full bg-[#C9A96E] animate-pulse" />
                                <span className="text-[#C9A96E] text-sm font-medium">{treatment.workflow_name}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                            <Smile size={14} className="text-white/40" />
                            <span className="text-white/60 text-sm">{patient.estado_paciente || 'En tratamiento'}</span>
                        </div>
                    </motion.div>
                </div>

                {/* Scroll indicator */}
                <motion.div
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/20"
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    <div className="h-8 w-px bg-gradient-to-b from-transparent to-white/20" />
                </motion.div>
            </motion.section>

            {/* ── Content sections ── */}
            <div className="px-4 sm:px-6 pb-32 space-y-8 max-w-2xl mx-auto">

                {/* Next appointment */}
                {nextAppointment && (
                    <FadeIn>
                        <div className="rounded-3xl bg-gradient-to-br from-[#C9A96E]/15 to-[#C9A96E]/5 border border-[#C9A96E]/20 p-6">
                            <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-[#C9A96E]/20 flex items-center justify-center flex-shrink-0">
                                    <Calendar size={22} className="text-[#C9A96E]" />
                                </div>
                                <div>
                                    <p className="text-[#C9A96E] text-xs font-semibold tracking-widest uppercase mb-1">Tu Próximo Turno</p>
                                    <p className="text-white text-2xl font-bold">
                                        {format(parseISO(nextAppointment.start_time), "d 'de' MMMM", { locale: es })}
                                    </p>
                                    <p className="text-white/50 text-sm mt-0.5">
                                        {format(parseISO(nextAppointment.start_time), "EEEE 'a las' HH:mm'hs'", { locale: es })}
                                    </p>
                                    {nextAppointment.type && (
                                        <p className="mt-2 text-white/40 text-xs">{nextAppointment.type}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </FadeIn>
                )}

                {/* Treatment journey */}
                {treatment && allStages && allStages.length > 0 && (
                    <FadeIn delay={0.1}>
                        <div className="rounded-3xl bg-[#14141A] border border-white/5 p-6">
                            <div className="flex items-center gap-2 mb-6">
                                <Sparkles size={16} className="text-[#C9A96E]" />
                                <h2 className="text-white font-bold text-lg">Tu Tratamiento</h2>
                            </div>
                            <p className="text-white/40 text-sm mb-6">{treatment.workflow_name}</p>

                            {/* Stage timeline */}
                            <div className="flex flex-col">
                                {allStages.map((stage, idx) => {
                                    const isCurrent = stage.name === treatment.current_stage_name;
                                    const isDone = stage.order_index < treatment.current_stage_order;
                                    const isLast = idx === allStages.length - 1;

                                    return (
                                        <motion.div
                                            key={stage.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            whileInView={{ opacity: 1, x: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: idx * 0.08 }}
                                            className="flex gap-4"
                                        >
                                            {/* Left column: icon + connector */}
                                            <div className="flex flex-col items-center flex-shrink-0 w-9">
                                                <div className={clsx(
                                                    'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                                                    isDone ? 'bg-[#C9A96E]/20' : isCurrent ? 'bg-[#C9A96E]/30 ring-2 ring-[#C9A96E]/40' : 'bg-white/5'
                                                )}>
                                                    {isDone
                                                        ? <CheckCircle2 size={16} className="text-[#C9A96E]" />
                                                        : isCurrent
                                                            ? <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                                                                <div className="h-3 w-3 rounded-full bg-[#C9A96E]" />
                                                            </motion.div>
                                                            : <Circle size={14} className="text-white/20" />
                                                    }
                                                </div>
                                                {!isLast && (
                                                    <div className="w-px flex-1 min-h-[16px] my-1 bg-white/10" />
                                                )}
                                            </div>

                                            {/* Label */}
                                            <div className={clsx('flex-1 min-w-0', isLast ? 'pb-0' : 'pb-4')}>
                                                <p className={clsx(
                                                    'text-sm font-semibold truncate pt-1.5',
                                                    isDone ? 'text-white/50 line-through' : isCurrent ? 'text-white' : 'text-white/30'
                                                )}>
                                                    {stage.name}
                                                </p>
                                                {isCurrent && (
                                                    <p className="text-[#C9A96E] text-[10px] mt-0.5 font-medium tracking-wide uppercase">Etapa actual</p>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </FadeIn>
                )}

                {/* ── Smile Design Gallery ── */}
                {(smileFiles.length > 0 || comparisonPhotos.length > 0 || (beforePhotos.length > 0 && afterPhotos.length > 0)) && (
                    <FadeIn delay={0.15}>
                        <div className="rounded-3xl bg-[#14141A] border border-white/5 p-6 space-y-6">
                            <div className="flex items-center gap-2">
                                <Smile size={16} className="text-[#C9A96E]" />
                                <h2 className="text-white font-bold text-lg">Tu Diseño de Sonrisa</h2>
                            </div>

                            {/* Before/After slider (first pair) */}
                            {beforePhotos.length > 0 && afterPhotos.length > 0 && (
                                <SmileSlider
                                    before={beforePhotos[0].file_url}
                                    after={afterPhotos[0].file_url}
                                    label="Simulador de Sonrisa"
                                />
                            )}

                            {/* Prominent Comparison Image */}
                            {comparisonPhotos.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-xs text-white/50 uppercase tracking-widest">Antes y Después</p>
                                    <motion.div 
                                        whileHover={{ scale: 1.01 }}
                                        className="rounded-2xl overflow-hidden border border-white/10 bg-white/5 shadow-2xl relative group cursor-pointer"
                                        onClick={() => window.open(comparisonPhotos[0].file_url, '_blank')}
                                    >
                                        <img 
                                            src={comparisonPhotos[0].file_url} 
                                            alt="Antes y Después" 
                                            className="w-full h-auto object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="px-4 py-2 bg-white/10 backdrop-blur rounded-xl text-white text-sm border border-white/20 flex items-center gap-2">
                                                <ImageIcon size={16} />
                                                Ver imagen completa
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>
                            )}

                            {/* Smile design renders */}
                            {smileFiles.length > 0 && (
                                <div className="grid grid-cols-2 gap-3">
                                    {smileFiles.map(f => (
                                        <motion.div
                                            key={f.id}
                                            whileHover={{ scale: 1.02 }}
                                            className="rounded-2xl overflow-hidden bg-white/5 border border-white/10 relative group"
                                        >
                                            {f.thumbnail_url
                                                ? <img src={f.thumbnail_url} alt={f.label} className="w-full h-40 object-cover" />
                                                : (
                                                    <div className="h-40 flex flex-col items-center justify-center gap-2">
                                                        <ImageIcon size={28} className="text-white/20" />
                                                        <p className="text-white/30 text-xs">{f.label}</p>
                                                    </div>
                                                )
                                            }
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                                                    className="px-3 py-1.5 bg-white/10 backdrop-blur rounded-lg text-white text-xs border border-white/20">
                                                    Ver completo
                                                </a>
                                            </div>
                                            <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent">
                                                <p className="text-white/70 text-xs truncate">{f.label}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </FadeIn>
                )}

                {designReview && (
                    <FadeIn delay={0.18}>
                        <DesignReviewSection
                            patientId={patient.id_paciente}
                            token={token}
                            label={designReview.label}
                            hasHtml={!!(designReview.drive_html_file_id || designReview.storage_html_url)}
                        />
                    </FadeIn>
                )}

                <FadeIn delay={0.2}>
                    <STLSection stlFiles={stlFiles} />
                </FadeIn>

                {/* ── Payment tracker ── */}
                {(plan || payments.length > 0) && (
                    <FadeIn delay={0.25}>
                        <div className="rounded-3xl bg-[#14141A] border border-white/5 p-6 space-y-5">
                            <div className="flex items-center gap-2">
                                <CreditCard size={16} className="text-[#C9A96E]" />
                                <h2 className="text-white font-bold text-lg">Tu Plan de Pagos</h2>
                            </div>

                            {/* Plan summary */}
                            {plan && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {[
                                        { label: 'Total del plan', value: `U$D ${plan.total_usd.toLocaleString('es-AR')}`, highlight: true },
                                        { label: 'Abonado', value: `U$D ${totalPaid.toLocaleString('es-AR')}`, highlight: false },
                                        { label: 'Saldo', value: `U$D ${(plan.saldo_usd ?? (plan.total_usd - totalPaid)).toLocaleString('es-AR')}`, highlight: false },
                                    ].map(s => (
                                        <div key={s.label} className={clsx(
                                            'rounded-2xl p-4 border',
                                            s.highlight
                                                ? 'bg-[#C9A96E]/10 border-[#C9A96E]/20'
                                                : 'bg-white/5 border-white/5'
                                        )}>
                                            <p className="text-white/40 text-xs mb-1">{s.label}</p>
                                            <p className={clsx('text-lg font-bold', s.highlight ? 'text-[#C9A96E]' : 'text-white')}>
                                                {s.value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Cuotas progress */}
                            {totalCuotas > 0 && (
                                <div>
                                    <div className="flex justify-between text-xs text-white/40 mb-2">
                                        <span>{paidCuotas} cuota{paidCuotas !== 1 ? 's' : ''} abonada{paidCuotas !== 1 ? 's' : ''}</span>
                                        <span>de {totalCuotas} total</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            whileInView={{ width: `${(paidCuotas / totalCuotas) * 100}%` }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                                            className="h-full bg-gradient-to-r from-[#C9A96E] to-[#E8D5A3] rounded-full"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Historial de Pagos</p>
                                <PatientPaymentHistory
                                    payments={payments}
                                    variant="portal"
                                    onReceiptView={setReceiptViewUrl}
                                />
                            </div>
                        </div>
                    </FadeIn>
                )}

                {/* Receipt fullscreen viewer */}
                <AnimatePresence>
                    {receiptViewUrl && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
                            onClick={() => setReceiptViewUrl(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.85 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0.85 }}
                                transition={{ type: 'spring', damping: 25 }}
                                className="max-w-lg w-full max-h-[85vh] relative"
                                onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={receiptViewUrl}
                                    alt="Comprobante"
                                    className="w-full h-auto rounded-2xl shadow-2xl"
                                />
                                <button
                                    onClick={() => setReceiptViewUrl(null)}
                                    className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                >
                                    ✕
                                </button>
                                <a
                                    href={receiptViewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute bottom-4 right-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C9A96E] text-black text-xs font-bold hover:bg-[#E8D5A3] transition-colors"
                                >
                                    <Download size={12} />
                                    Descargar
                                </a>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Documents ── */}
                {docFiles.length > 0 && (
                    <FadeIn delay={0.3}>
                        <div className="rounded-3xl bg-[#14141A] border border-white/5 p-6 space-y-4">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-[#C9A96E]" />
                                <h2 className="text-white font-bold text-lg">Documentos</h2>
                            </div>
                            <div className="space-y-2">
                                {docFiles.map(f => (
                                    <a
                                        key={f.id}
                                        href={f.file_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/5 hover:border-[#C9A96E]/20 hover:bg-[#C9A96E]/5 transition-all group"
                                    >
                                        <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                                            <FileText size={16} className="text-white/40 group-hover:text-[#C9A96E] transition-colors" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white/80 text-sm font-medium truncate">{f.label}</p>
                                            <p className="text-white/30 text-xs">{format(parseISO(f.created_at), 'd MMM yyyy', { locale: es })}</p>
                                        </div>
                                        <Download size={14} className="text-white/20 group-hover:text-[#C9A96E] transition-colors flex-shrink-0" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    </FadeIn>
                )}

                {/* ── Footer ── */}
                <FadeIn delay={0.35}>
                    <div className="rounded-3xl bg-gradient-to-br from-[#C9A96E]/10 to-transparent border border-[#C9A96E]/15 p-6 text-center space-y-3">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#C9A96E] to-[#E8D5A3] flex items-center justify-center mx-auto shadow-lg shadow-[#C9A96E]/20">
                            <span className="text-[#0A0A0F] text-sm font-extrabold">AM</span>
                        </div>
                        <h3 className="text-white font-bold">AM Clínica</h3>
                        <p className="text-white/40 text-sm">Estética Dental de Alta Complejidad</p>
                        <a
                            href="https://wa.me/5491100000000"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                        >
                            <Phone size={14} />
                            Contactar al equipo
                        </a>
                        <p className="text-white/20 text-xs pt-2">
                            Portal privado generado exclusivamente para {patient.nombre} {patient.apellido}
                        </p>
                    </div>
                </FadeIn>
            </div>
        </div>
    );
}
