'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Paciente } from '@/lib/patients';
import { Loader2 } from 'lucide-react';

const ENRICHMENT_FIELDS: (keyof Paciente)[] = ['documento', 'fecha_nacimiento', 'email', 'whatsapp', 'como_nos_conocio'];

function getMissingCount(patient: Paciente): number {
    return ENRICHMENT_FIELDS.filter((f) => {
        if (f === 'como_nos_conocio') {
            const referral = patient.como_nos_conocio || patient.referencia_origen;
            return !referral || referral.trim() === '';
        }
        const v = patient[f];
        return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    }).length;
}

// Deterministic pastel color from a string (Gmail-style avatar).
const INITIAL_PALETTE = [
    { from: 'from-teal-500', to: 'to-emerald-600' },
    { from: 'from-sky-500', to: 'to-indigo-600' },
    { from: 'from-amber-500', to: 'to-orange-600' },
    { from: 'from-rose-500', to: 'to-pink-600' },
    { from: 'from-violet-500', to: 'to-purple-600' },
    { from: 'from-lime-500', to: 'to-emerald-600' },
    { from: 'from-fuchsia-500', to: 'to-rose-600' },
    { from: 'from-cyan-500', to: 'to-teal-600' },
];

function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function getInitials(nombre: string, apellido: string): string {
    const a = (apellido || '').trim()[0] || '';
    const n = (nombre || '').trim()[0] || '';
    return (a + n).toUpperCase() || '?';
}

function extractGoogleFileIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;

    const patterns = [
        /\/d\/([a-zA-Z0-9_-]{10,})/,
        /[?&]id=([a-zA-Z0-9_-]{10,})/,
        /^([a-zA-Z0-9_-]{10,})$/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

function resolvePatientPhotoSrc(patient: Paciente): string | null {
    const cover = patient.foto_perfil_url?.trim();
    if (cover) {
        if (/^https?:\/\//i.test(cover)) return cover;
        return `/api/drive/thumbnail/${encodeURIComponent(cover)}`;
    }

    const profilePhoto = patient.profile_photo_url?.trim();
    if (profilePhoto) return profilePhoto;

    return null;
}

function getStatusTag(status?: string): { label: string; cls: string } | null {
    if (!status) return null;
    switch (status) {
        case 'Activo':
            return { label: 'Activo', cls: 'bg-emerald-500/90 text-white' };
        case 'En tratamiento':
            return { label: 'En tratamiento', cls: 'bg-teal-500/90 text-white' };
        case 'Alta':
            return { label: 'Alta', cls: 'bg-purple-500/90 text-white' };
        case 'Inactivo':
            return { label: 'Inactivo', cls: 'bg-slate-500/90 text-white' };
        default:
            return { label: status, cls: 'bg-slate-500/90 text-white' };
    }
}

interface PatientCardProps {
    patient: Paciente;
    index: number;
}

function PatientCard({ patient, index }: PatientCardProps) {
    const [imgFailed, setImgFailed] = useState(false);
    const missingCount = getMissingCount(patient);
    const photoSrc = useMemo(() => resolvePatientPhotoSrc(patient), [patient]);
    const hasPhoto = !!photoSrc && !imgFailed;
    const paletteIdx = hashString(patient.id_paciente) % INITIAL_PALETTE.length;
    const palette = INITIAL_PALETTE[paletteIdx];
    const initials = getInitials(patient.nombre, patient.apellido);
    const tag = getStatusTag(patient.estado_paciente);

    useEffect(() => {
        setImgFailed(false);
    }, [photoSrc]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.015, 0.3) }}
        >
            <Link
                href={`/patients/${patient.id_paciente}?section=archivos`}
                className="group block overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 shadow-sm transition-all hover:border-teal-400/40 hover:shadow-[0_0_25px_rgba(20,184,166,0.15)]"
            >
                <div className="relative aspect-square w-full overflow-hidden bg-slate-800">
                    {hasPhoto ? (
                        <img
                            src={photoSrc as string}
                            alt={`${patient.nombre} ${patient.apellido}`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => setImgFailed(true)}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${palette.from} ${palette.to}`}>
                            <span className="text-5xl font-bold tracking-tight text-white/95 drop-shadow-sm">
                                {initials}
                            </span>
                        </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

                    {tag && (
                        <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ${tag.cls}`}>
                            {tag.label}
                        </span>
                    )}

                    {missingCount > 0 && (
                        <span
                            className="absolute left-2 top-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-500/90 px-1.5 text-[11px] font-bold text-white shadow"
                            title={`${missingCount} dato${missingCount > 1 ? 's' : ''} faltante${missingCount > 1 ? 's' : ''}`}
                        >
                            {missingCount}
                        </span>
                    )}

                    <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                        <p className="truncate text-sm font-semibold text-white drop-shadow-md">
                            {patient.apellido}
                        </p>
                        <p className="truncate text-xs text-slate-200/90 drop-shadow-md">
                            {patient.nombre}
                        </p>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

interface PatientGridProps {
    patients: Paciente[];
    onRefresh?: () => void;
}

export default function PatientGrid({ patients }: PatientGridProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 48;

    if (patients.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="mb-4 h-8 w-8 animate-pulse text-slate-600/50" />
                <p>No se encontraron pacientes.</p>
            </div>
        );
    }

    const totalPages = Math.ceil(patients.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const current = patients.slice(startIndex, startIndex + itemsPerPage);

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {current.map((p, i) => (
                    <PatientCard key={p.id_paciente} patient={p} index={i} />
                ))}
            </div>

            {totalPages > 1 && (
                <div className="glass-card flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                    <p className="text-sm text-slate-400">
                        Mostrando <span className="font-medium text-white">{startIndex + 1}</span> a{' '}
                        <span className="font-medium text-white">
                            {Math.min(startIndex + itemsPerPage, patients.length)}
                        </span>{' '}
                        de <span className="font-medium text-white">{patients.length}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                            let p = i + 1;
                            if (totalPages > 5) {
                                if (currentPage > 3) p = currentPage - 2 + i;
                                if (p > totalPages) p = totalPages - (4 - i);
                            }
                            if (p < 1) p = 1;
                            return (
                                <button
                                    key={i}
                                    onClick={() => goToPage(p)}
                                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all ${currentPage === p
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                        : 'border border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
