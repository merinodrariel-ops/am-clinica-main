import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TreatmentCard } from './TreatmentCard';
import clsx from 'clsx';
import { Bell, Timer, AlertTriangle, GripVertical } from 'lucide-react';
import type { PatientTreatment, PatientSummary, WorkflowStage } from './types';

interface KanbanColumnProps {
    stage: WorkflowStage;
    treatments: PatientTreatment[];
    stagePosition: number;
    totalStages: number;
    onTreatmentClick: (treatment: PatientTreatment) => void;
    onPatientClick: (patient: PatientSummary) => void;
    onMoveToNext: (treatment: PatientTreatment) => void;
    isLastStage: boolean;
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> };
}

export function KanbanColumn({ stage, treatments, stagePosition, totalStages, onTreatmentClick, onPatientClick, onMoveToNext, isLastStage, dragHandleProps }: KanbanColumnProps) {
    const { setNodeRef } = useDroppable({
        id: stage.id,
    });

    const getStageColor = (colorName?: string | null) => {
        switch (colorName) {
            case 'blue': return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800';
            case 'green': return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800';
            case 'purple': return 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800';
            case 'orange': return 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800';
            case 'red': return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800';
            case 'yellow': return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800';
            case 'gray': return 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700';
            default: return 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700';
        }
    };

    // Compute urgency counts for the badge
    const today = new Date();
    const urgentCount = treatments.filter(t => {
        const daysInStage = Math.ceil(Math.abs(today.getTime() - new Date(t.last_stage_change).getTime()) / (1000 * 60 * 60 * 24));
        if (stage.time_limit_days && daysInStage > stage.time_limit_days) return true;
        if (t.next_milestone_date && new Date(t.next_milestone_date) < today) return true;
        return false;
    }).length;

    const warningCount = treatments.filter(t => {
        const daysInStage = Math.ceil(Math.abs(today.getTime() - new Date(t.last_stage_change).getTime()) / (1000 * 60 * 60 * 24));
        const timeLimit = stage.time_limit_days;
        if (timeLimit && daysInStage > timeLimit) return false; // ya contado como urgente
        if (timeLimit && daysInStage >= timeLimit - 3) return true;
        const milestone = t.next_milestone_date ? new Date(t.next_milestone_date) : null;
        if (milestone) {
            const daysRemaining = Math.ceil((milestone.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysRemaining < 0) return false; // ya urgente
            if (daysRemaining <= 14) return true;
        }
        return false;
    }).length;

    const stageLabel = stage.name === 'Pendiente de Control'
        ? 'Esperando por turno'
        : stage.name === 'Turno Agendado'
            ? 'Turno dado'
            : stage.name;

    return (
        <div className="flex flex-col min-w-[280px] w-80 h-full max-h-full">
            {/* Header */}
            <div className={clsx(
                "p-3 rounded-t-xl border-b-2 font-semibold flex justify-between items-center gap-2",
                getStageColor(stage.color)
            )}>
                {dragHandleProps && (
                    <button
                        {...dragHandleProps}
                        className="p-0.5 rounded cursor-grab active:cursor-grabbing text-current opacity-40 hover:opacity-80 transition-opacity touch-none shrink-0"
                        tabIndex={-1}
                    >
                        <GripVertical size={14} />
                    </button>
                )}
                <span className="truncate">{stageLabel}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Urgency badges */}
                    {urgentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">
                            <AlertTriangle size={9} />
                            {urgentCount}
                        </span>
                    )}
                    {warningCount > 0 && urgentCount === 0 && (
                        <span className="inline-flex items-center gap-0.5 bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            <AlertTriangle size={9} />
                            {warningCount}
                        </span>
                    )}
                    {stage.time_limit_days ? (
                        <span className="inline-flex items-center gap-1 bg-white/60 dark:bg-black/20 px-1.5 py-0.5 rounded text-[10px]">
                            <Timer size={11} />
                            {stage.time_limit_days}d
                        </span>
                    ) : null}
                    {stage.notify_on_entry || (stage.notify_emails && stage.notify_emails.length > 0) ? (
                        <span className="inline-flex items-center gap-1 bg-white/60 dark:bg-black/20 px-1.5 py-0.5 rounded text-[10px]">
                            <Bell size={11} />
                            Notif
                        </span>
                    ) : null}
                    <span className="bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded text-xs">
                        {treatments.length}
                    </span>
                </div>
            </div>

            {/* Droppable Area */}
            <div
                ref={setNodeRef}
                className="flex-1 bg-gray-50/50 dark:bg-gray-900/50 p-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700"
            >
                <SortableContext
                    items={treatments.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {treatments.map((treatment) => {
                        const lastChange = new Date(treatment.last_stage_change);
                        const diffTime = Math.abs(today.getTime() - lastChange.getTime());
                        const daysInStage = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        return (
                            <TreatmentCard
                                key={treatment.id}
                                treatment={treatment}
                                daysInStage={daysInStage}
                                timeLimit={stage.time_limit_days}
                                progressPercent={Math.min(100, Math.max(0, Math.round((stagePosition / Math.max(totalStages, 1)) * 100)))}
                                onClick={() => onTreatmentClick(treatment)}
                                onPatientClick={onPatientClick}
                                onMoveToNext={!isLastStage ? () => onMoveToNext(treatment) : undefined}
                            />
                        );
                    })}
                </SortableContext>
            </div>
        </div>
    );
}
