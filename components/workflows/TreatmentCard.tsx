import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Clock, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { PatientTreatment } from './types';

interface TreatmentCardProps {
    treatment: PatientTreatment;
    daysInStage: number;
    timeLimit?: number | null;
    progressPercent?: number;
    onClick?: () => void;
}

export function TreatmentCard({ treatment, daysInStage, timeLimit, progressPercent = 0, onClick }: TreatmentCardProps) {
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
    const derivedNowMs = new Date(treatment.last_stage_change).getTime() + (daysInStage * msPerDay);

    const milestoneDaysRemaining = treatment.next_milestone_date
        ? Math.ceil((new Date(treatment.next_milestone_date).getTime() - derivedNowMs) / msPerDay)
        : null;

    if (milestoneDaysRemaining !== null) {
        if (milestoneDaysRemaining < 0) {
            alertStatus = 'red';
        } else if (milestoneDaysRemaining <= 14 && alertStatus !== 'red') {
            alertStatus = 'yellow';
        }
    }

    const slaProgressPercent = timeLimit ? Math.min(100, Math.max(0, Math.round((daysInStage / timeLimit) * 100))) : 0;

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
                "bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-3 cursor-grab hover:shadow-md transition-all select-none",
                isDragging && "opacity-50 scale-105 shadow-xl rotate-2 z-50",
                alertStatus === 'red' && "border-l-4 border-l-red-500",
                alertStatus === 'yellow' && "border-l-4 border-l-yellow-500",
                alertStatus === 'green' && "border-l-4 border-l-green-500"
            )}
            onClick={onClick}
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-900 dark:text-white truncate pr-2">
                    {treatment.patient.apellido}, {treatment.patient.nombre}
                </h4>
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

                {treatment.next_milestone_date && (
                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <AlertCircle size={14} />
                        <span>{new Date(treatment.next_milestone_date).toLocaleDateString()}</span>
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
                        <span>Consumo SLA</span>
                        <span>{slaProgressPercent}%</span>
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
        </div>
    );
}
