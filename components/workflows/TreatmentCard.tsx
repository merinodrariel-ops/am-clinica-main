import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Clock, AlertCircle, ChevronRight, User, ExternalLink, Loader2, HardDrive } from 'lucide-react';
import { getPatientPortalUrl } from '@/app/actions/patient-portal';
import { resolvePatientPresentationLinkAction } from '@/app/actions/presentaciones';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { PatientTreatment, PatientSummary } from './types';

interface TreatmentCardProps {
    treatment: PatientTreatment;
    daysInStage: number;
    timeLimit?: number | null;
    progressPercent?: number;
    onClick?: () => void;
    onPatientClick?: (patient: PatientSummary) => void;
    onMoveToNext?: () => void;
}

export function TreatmentCard({ treatment, daysInStage, timeLimit, progressPercent = 0, onClick, onPatientClick, onMoveToNext }: TreatmentCardProps) {
    const [isPortalLoading, setIsPortalLoading] = React.useState(false);
    const [isResolvingPresentation, setIsResolvingPresentation] = React.useState(false);
    const [resolvedPresentationUrl, setResolvedPresentationUrl] = React.useState<string | null>(null);
    const profilePhotoUrl = typeof treatment.patient.profile_photo_url === 'string' && treatment.patient.profile_photo_url.trim().length > 0
        ? treatment.patient.profile_photo_url
        : null;
    const patientPresentationUrl = typeof treatment.patient.link_google_slides === 'string' && treatment.patient.link_google_slides.trim().length > 0
        ? treatment.patient.link_google_slides
        : null;
    const effectivePresentationUrl = patientPresentationUrl || resolvedPresentationUrl;
    const patientFolderUrl = typeof treatment.patient.link_historia_clinica === 'string' && treatment.patient.link_historia_clinica.trim().length > 0
        ? treatment.patient.link_historia_clinica
        : null;
    const canOpenPatient = Boolean(onPatientClick || patientPresentationUrl || patientFolderUrl);

    const presentationThumbUrl = React.useMemo(() => {
        const sourceUrl = effectivePresentationUrl;
        if (!sourceUrl) return null;

        const patterns = [
            /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            /[?&]id=([a-zA-Z0-9_-]+)/,
            /\/d\/([a-zA-Z0-9_-]+)/,
        ];

        for (const pattern of patterns) {
            const match = sourceUrl.match(pattern);
            if (match?.[1]) {
                return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w256-h256`;
            }
        }

        return null;
    }, [effectivePresentationUrl]);

    const effectiveProfilePhotoUrl = profilePhotoUrl || presentationThumbUrl;

    const handlePatientOpen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (effectivePresentationUrl) {
            window.open(effectivePresentationUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        if (!isResolvingPresentation) {
            setIsResolvingPresentation(true);
            try {
                const resolved = await resolvePatientPresentationLinkAction(treatment.patient.id_paciente);
                if (resolved.success && resolved.url) {
                    if (resolved.source !== 'folder') {
                        setResolvedPresentationUrl(resolved.url);
                    }
                    window.open(resolved.url, '_blank', 'noopener,noreferrer');
                    return;
                }
            } catch (error) {
                console.error('Presentation resolve error:', error);
            } finally {
                setIsResolvingPresentation(false);
            }
        }

        if (patientFolderUrl) {
            window.open(patientFolderUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        if (onPatientClick) {
            onPatientClick(treatment.patient);
        }
    };

    const patientOpenTitle = effectivePresentationUrl
        ? 'Abrir presentación del paciente'
        : patientFolderUrl
            ? 'Abrir carpeta clínica del paciente'
            : 'Abrir ficha del paciente';

    const handlePortalClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isPortalLoading) return;

        setIsPortalLoading(true);
        try {
            const url = await getPatientPortalUrl(treatment.patient_id || treatment.patient.id_paciente);
            window.open(url, '_blank');
        } catch (error) {
            console.error('Portal access error:', error);
            toast.error(error instanceof Error ? error.message : 'Error al acceder al portal');
        } finally {
            setIsPortalLoading(false);
        }
    };
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: treatment.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Determine alert status
    let alertStatus = 'green';
    if (timeLimit) {
        if (daysInStage > timeLimit) {
            alertStatus = 'red';
        } else if (daysInStage > timeLimit - 3) { // Warning 3 days before
            alertStatus = 'yellow';
        }
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const nowMs = new Date(treatment.last_stage_change).getTime() + (daysInStage * msPerDay);

    const treatmentBaseDate = typeof treatment.metadata?.treatment_completed_at === 'string'
        ? new Date(treatment.metadata.treatment_completed_at)
        : treatment.start_date
            ? new Date(treatment.start_date)
            : null;

    const milestoneDate = treatment.next_milestone_date ? new Date(treatment.next_milestone_date) : null;
    const appointmentDate = typeof treatment.metadata?.appointment_date === 'string'
        ? new Date(treatment.metadata.appointment_date)
        : null;

    const milestoneDaysRemaining = milestoneDate
        ? Math.ceil((milestoneDate.getTime() - nowMs) / msPerDay)
        : null;

    const appointmentDaysRemaining = appointmentDate
        ? Math.ceil((appointmentDate.getTime() - nowMs) / msPerDay)
        : null;

    if (milestoneDaysRemaining !== null) {
        if (milestoneDaysRemaining < 0) {
            alertStatus = 'red';
        } else if (milestoneDaysRemaining <= 14 && alertStatus !== 'red') {
            alertStatus = 'yellow';
        }
    }

    const slaProgressPercent = timeLimit ? Math.min(100, Math.max(0, Math.round((daysInStage / timeLimit) * 100))) : 0;

    const followUpProgressPercent = treatmentBaseDate && milestoneDate
        ? Math.min(
            100,
            Math.max(
                0,
                Math.round(
                    ((nowMs - treatmentBaseDate.getTime()) /
                        Math.max(msPerDay, milestoneDate.getTime() - treatmentBaseDate.getTime())) * 100
                )
            )
        )
        : null;

    const appointmentProgressPercent = appointmentDate && nowMs <= appointmentDate.getTime()
        ? Math.min(
            100,
            Math.max(
                0,
                Math.round(
                    ((nowMs - (treatmentBaseDate?.getTime() || nowMs)) /
                        Math.max(msPerDay, appointmentDate.getTime() - (treatmentBaseDate?.getTime() || nowMs))) * 100
                )
            )
        )
        : null;

    const metadataType = typeof treatment.metadata?.type === 'string'
        ? treatment.metadata.type
        : null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={clsx(
                "group bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-3 cursor-grab hover:shadow-md transition-all select-none",
                isDragging && "opacity-50 scale-105 shadow-xl rotate-2 z-50",
                alertStatus === 'red' && "border-l-4 border-l-red-500",
                alertStatus === 'yellow' && "border-l-4 border-l-yellow-500",
                alertStatus === 'green' && "border-l-4 border-l-green-500"
            )}
            onClick={onClick}
        >
            <div className="flex justify-between items-start mb-2 gap-2">
                <div className="flex items-start gap-2 min-w-0">
                    {canOpenPatient ? (
                        <button
                            type="button"
                            onClick={handlePatientOpen}
                            className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0 flex items-center justify-center hover:ring-2 hover:ring-blue-400/60 transition"
                            title={patientOpenTitle}
                            aria-label={`${patientOpenTitle} ${treatment.patient.nombre} ${treatment.patient.apellido}`}
                        >
                            {effectiveProfilePhotoUrl ? (
                                <img
                                    src={effectiveProfilePhotoUrl}
                                    alt={`Foto de ${treatment.patient.nombre} ${treatment.patient.apellido}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            ) : isResolvingPresentation ? (
                                <Loader2 size={14} className="text-gray-500 dark:text-gray-300 animate-spin" />
                            ) : (
                                <User size={14} className="text-gray-500 dark:text-gray-300" />
                            )}
                        </button>
                    ) : (
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0 flex items-center justify-center">
                            {effectiveProfilePhotoUrl ? (
                                <img
                                    src={effectiveProfilePhotoUrl}
                                    alt={`Foto de ${treatment.patient.nombre} ${treatment.patient.apellido}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            ) : isResolvingPresentation ? (
                                <Loader2 size={14} className="text-gray-500 dark:text-gray-300 animate-spin" />
                            ) : (
                                <User size={14} className="text-gray-500 dark:text-gray-300" />
                            )}
                        </div>
                    )}

                    {canOpenPatient ? (
                        <button
                            type="button"
                            className="font-semibold text-gray-900 dark:text-white truncate pr-2 text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline underline-offset-2 transition-colors cursor-pointer"
                            onClick={handlePatientOpen}
                        >
                            {treatment.patient.apellido}, {treatment.patient.nombre}
                        </button>
                    ) : (
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate pr-2">
                            {treatment.patient.apellido}, {treatment.patient.nombre}
                        </h4>
                    )}
                </div>

                {metadataType && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 font-medium">
                        {metadataType}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-3">
                <div className={clsx(
                    "flex items-center gap-1",
                    alertStatus === 'red' && "text-red-500 font-medium",
                    alertStatus === 'yellow' && "text-yellow-600 font-medium"
                )}>
                    <Clock size={14} />
                    <span>{daysInStage}d</span>
                </div>

                {milestoneDate && (
                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <AlertCircle size={14} />
                        <span>{milestoneDate.toLocaleDateString()}</span>
                        {milestoneDaysRemaining !== null ? (
                            <span className={clsx(
                                'text-[10px] ml-1',
                                milestoneDaysRemaining < 0 ? 'text-red-600 dark:text-red-400' : milestoneDaysRemaining <= 14 ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'
                            )}>
                                {milestoneDaysRemaining < 0
                                    ? `· Vencido ${Math.abs(milestoneDaysRemaining)}d`
                                    : `· ${milestoneDaysRemaining}d`}
                            </span>
                        ) : null}
                    </div>
                )}

                {appointmentDate && (
                    <div className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                        <AlertCircle size={14} />
                        <span>Turno {appointmentDate.toLocaleDateString()}</span>
                        {appointmentDaysRemaining !== null ? (
                            <span className={clsx(
                                'text-[10px] ml-1',
                                appointmentDaysRemaining < 0 ? 'text-red-600 dark:text-red-400' : appointmentDaysRemaining <= 2 ? 'text-yellow-600 dark:text-yellow-400' : 'text-violet-600 dark:text-violet-400'
                            )}>
                                {appointmentDaysRemaining < 0
                                    ? `· Vencido ${Math.abs(appointmentDaysRemaining)}d`
                                    : `· ${appointmentDaysRemaining}d`}
                            </span>
                        ) : null}
                    </div>
                )}
            </div>

            <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                    <span>Progreso</span>
                    <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {timeLimit ? (
                <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                        <span>SLA</span>
                        <span className={clsx(
                            'font-bold px-1.5 py-0.5 rounded-full text-[10px]',
                            slaProgressPercent >= 100
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : slaProgressPercent >= 80
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        )}>
                            {slaProgressPercent >= 100
                                ? `Vencido ${daysInStage - timeLimit}d`
                                : `${timeLimit - daysInStage}d restantes`}
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                            className={clsx(
                                'h-full transition-all',
                                slaProgressPercent >= 100 ? 'bg-red-500' : slaProgressPercent >= 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${slaProgressPercent}%` }}
                        />
                    </div>
                </div>
            ) : null}

            {followUpProgressPercent !== null ? (
                <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                        <span>Cuenta regresiva control</span>
                        <span>{milestoneDaysRemaining !== null ? `${milestoneDaysRemaining}d` : '-'} </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                            className={clsx(
                                'h-full transition-all',
                                followUpProgressPercent >= 100 ? 'bg-red-500' : followUpProgressPercent >= 70 ? 'bg-yellow-500' : 'bg-cyan-500'
                            )}
                            style={{ width: `${followUpProgressPercent}%` }}
                        />
                    </div>
                </div>
            ) : null}

            {appointmentProgressPercent !== null ? (
                <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                        <span>Cuenta regresiva turno</span>
                        <span>{appointmentDaysRemaining !== null ? `${appointmentDaysRemaining}d` : '-'} </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                            className={clsx(
                                'h-full transition-all',
                                appointmentProgressPercent >= 100 ? 'bg-red-500' : appointmentProgressPercent >= 80 ? 'bg-amber-500' : 'bg-violet-500'
                            )}
                            style={{ width: `${appointmentProgressPercent}%` }}
                        />
                    </div>
                </div>
            ) : null}

            {/* Quick actions — visibles al hover */}
            {(onPatientClick || onMoveToNext) && (
                <div className="hidden group-hover:flex items-center gap-1 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                    {onPatientClick && (
                        <button
                            type="button"
                            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-0.5 rounded transition-colors"
                            onClick={(e) => { e.stopPropagation(); onPatientClick(treatment.patient); }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <User size={11} />
                            Timeline
                        </button>
                    )}
                    {Boolean(treatment.metadata?.drive_folder_url) && (
                        <a
                            href={String(treatment.metadata?.drive_folder_url || '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 px-2 py-0.5 rounded transition-colors"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <HardDrive size={11} />
                            Drive
                        </a>
                    )}
                    <button
                        type="button"
                        className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-2 py-0.5 rounded transition-colors"
                        onClick={handlePortalClick}
                        disabled={isPortalLoading}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {isPortalLoading ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                        Portal
                    </button>
                    {onMoveToNext && (
                        <button
                            type="button"
                            className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-2 py-0.5 rounded transition-colors ml-auto"
                            onClick={(e) => { e.stopPropagation(); onMoveToNext(); }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            Siguiente
                            <ChevronRight size={11} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
