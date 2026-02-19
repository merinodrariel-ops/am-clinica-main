'use client';

import React from 'react';
import {
    X,
    Activity,
    Calendar,
    Clock,
    CheckCircle2,
    Archive,
    Loader2,
    User,
    Hourglass,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import clsx from 'clsx';
import type { PatientSummary, PatientTimelineData, TreatmentStatus } from './types';

interface PatientTimelineModalProps {
    patient: PatientSummary;
    data: PatientTimelineData | null;
    loading: boolean;
    onClose: () => void;
}

function PatientAvatar({ nombre, apellido }: { nombre: string; apellido: string }) {
    const initials = `${apellido.charAt(0)}${nombre.charAt(0)}`.toUpperCase();
    return (
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0">
            {initials}
        </div>
    );
}

function StatusBadge({ status }: { status: TreatmentStatus }) {
    const map: Record<TreatmentStatus, { label: string; className: string }> = {
        active:     { label: 'Activo',      className: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
        finished:   { label: 'Finalizado',  className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
        archived:   { label: 'Archivado',   className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
        waiting:    { label: 'Esperando',   className: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
        production: { label: 'Producción',  className: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
    };
    const { label, className } = map[status] ?? map.active;
    return (
        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', className)}>
            {label}
        </span>
    );
}

function WorkflowBadge({ type, name }: { type?: string | null; name?: string | null }) {
    const isRecurrent = type === 'recurrent';
    return (
        <span className={clsx(
            'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded',
            isRecurrent
                ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
        )}>
            {name || (isRecurrent ? 'Recurrente' : 'Tratamiento')}
        </span>
    );
}

function TimelineDot({ variant }: { variant: 'created' | 'stage' | 'future' }) {
    return (
        <span className={clsx(
            'absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2',
            variant === 'created' && 'bg-gray-400 dark:bg-gray-500 border-white dark:border-gray-900',
            variant === 'stage'   && 'bg-blue-500 border-white dark:border-gray-900',
            variant === 'future'  && 'bg-white dark:bg-gray-900 border-blue-400 dark:border-blue-500',
        )} />
    );
}

function formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
        return format(new Date(dateStr), "d MMM yyyy", { locale: es });
    } catch {
        return '—';
    }
}

function formatDateTime(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
        return format(new Date(dateStr), "d MMM yyyy, HH:mm", { locale: es });
    } catch {
        return '—';
    }
}

function getWorkflowAccentClass(type?: string | null) {
    return type === 'recurrent'
        ? 'border-l-purple-400 dark:border-l-purple-600'
        : 'border-l-indigo-400 dark:border-l-indigo-600';
}

export function PatientTimelineModal({ patient, data, loading, onClose }: PatientTimelineModalProps) {
    const totalTreatments = data?.treatments.length ?? 0;
    const activeTreatments = data?.treatments.filter(e => e.treatment.status === 'active').length ?? 0;
    const finishedTreatments = data?.treatments.filter(e => e.treatment.status === 'finished').length ?? 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <PatientAvatar nombre={patient.nombre} apellido={patient.apellido} />
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {patient.apellido}, {patient.nombre}
                            </h2>
                            {patient.documento && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                                    <User size={13} />
                                    {patient.documento}
                                </p>
                            )}
                            {!loading && data && (
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="flex items-center gap-1">
                                        <Activity size={12} />
                                        {totalTreatments} tratamiento{totalTreatments !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                        <CheckCircle2 size={12} />
                                        {activeTreatments} activo{activeTreatments !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                        <Archive size={12} />
                                        {finishedTreatments} finalizado{finishedTreatments !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* BODY */}
                <div className="overflow-y-auto flex-1 p-6">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                            <Loader2 size={32} className="animate-spin" />
                            <span className="text-sm">Cargando historial del paciente...</span>
                        </div>
                    )}

                    {!loading && !data && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                            <Activity size={32} />
                            <span className="text-sm">No se encontró historial para este paciente.</span>
                        </div>
                    )}

                    {!loading && data && data.treatments.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                            <Activity size={32} />
                            <span className="text-sm">Este paciente no tiene tratamientos registrados.</span>
                        </div>
                    )}

                    {!loading && data && data.treatments.length > 0 && (
                        <div className="space-y-6">
                            {data.treatments.map(({ treatment, history }) => {
                                const workflowType = treatment.workflow?.type ?? null;
                                const createdDate = treatment.start_date || treatment.created_at;
                                const milestoneDate = treatment.next_milestone_date;
                                const appointmentDate = typeof treatment.metadata?.appointment_date === 'string'
                                    ? treatment.metadata.appointment_date
                                    : null;

                                return (
                                    <div
                                        key={treatment.id}
                                        className={clsx(
                                            'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden border-l-4',
                                            getWorkflowAccentClass(workflowType)
                                        )}
                                    >
                                        {/* Treatment section header */}
                                        <div className="px-4 py-3 bg-gray-50/80 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <WorkflowBadge
                                                    type={workflowType}
                                                    name={treatment.workflow?.name}
                                                />
                                                <StatusBadge status={treatment.status} />
                                            </div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                                <Calendar size={12} />
                                                Inicio: {formatDate(createdDate)}
                                            </div>
                                        </div>

                                        {/* Timeline events */}
                                        <div className="px-4 py-4">
                                            <div className="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-5">

                                                {/* Treatment created */}
                                                <div className="relative">
                                                    <TimelineDot variant="created" />
                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        Tratamiento iniciado
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                                        <Clock size={11} />
                                                        {formatDateTime(createdDate)}
                                                    </p>
                                                </div>

                                                {/* Stage history — ascending (cronológico) */}
                                                {history.map((entry) => (
                                                    <div key={entry.id} className="relative">
                                                        <TimelineDot variant="stage" />
                                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                                            {entry.new_stage?.name
                                                                ? `Cambio a "${entry.new_stage.name}"`
                                                                : 'Cambio de etapa'}
                                                        </p>
                                                        {entry.previous_stage?.name && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                Desde: {entry.previous_stage.name}
                                                            </p>
                                                        )}
                                                        {entry.comments && (
                                                            <p className="text-xs text-gray-600 dark:text-gray-300 italic mt-0.5 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
                                                                &ldquo;{entry.comments}&rdquo;
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                                            <Clock size={11} />
                                                            {formatDateTime(entry.created_at)}
                                                        </p>
                                                    </div>
                                                ))}

                                                {/* Future: próximo control */}
                                                {milestoneDate && (
                                                    <div className="relative opacity-70">
                                                        <TimelineDot variant="future" />
                                                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                                            <Hourglass size={13} />
                                                            Próximo control
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-0.5">
                                                            {formatDate(milestoneDate)}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Future: turno programado */}
                                                {appointmentDate && (
                                                    <div className="relative opacity-70">
                                                        <TimelineDot variant="future" />
                                                        <p className="text-sm font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                                                            <Calendar size={13} />
                                                            Turno programado
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-0.5">
                                                            {formatDate(appointmentDate)}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
