'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { KanbanColumn } from './KanbanColumn';
import { TreatmentCard } from './TreatmentCard';
import { moveTreatmentStage, getPatientTimeline, updateWorkflowStagesOrder } from '@/app/actions/clinical-workflows';
import { Toaster as SharedToaster } from 'sonner';
import { toast } from 'sonner';
import { TreatmentDetailsModal } from './TreatmentDetailsModal';
import { PatientTimelineModal } from './PatientTimelineModal';
import { Search, X, AlertTriangle, Clock } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import type { ClinicalWorkflow, PatientTreatment, PatientSummary, PatientTimelineData, WorkflowStage } from './types';

// Prefix used to differentiate column drag IDs from card drag IDs
const COL_PREFIX = 'col-';

interface SortableColumnProps {
    stage: WorkflowStage;
    isDraggingAnyColumn: boolean;
    children: (dragHandleProps: React.HTMLAttributes<HTMLButtonElement>) => React.ReactNode;
}

function SortableColumn({ stage, isDraggingAnyColumn, children }: SortableColumnProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `${COL_PREFIX}${stage.id}`,
    });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
    };
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx('snap-center shrink-0 h-full', isDraggingAnyColumn && !isDragging && 'cursor-grabbing')}
        >
            {children({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>)}
        </div>
    );
}

interface KanbanBoardProps {
    workflow: ClinicalWorkflow;
    initialTreatments: PatientTreatment[];
}

type AlertFilter = 'all' | 'red' | 'yellow';
type DaysFilter = 'all' | '3' | '7' | '14';

function getAlertStatus(treatment: PatientTreatment, timeLimitDays?: number | null): 'red' | 'yellow' | 'green' {
    const today = new Date();
    const daysInStage = Math.ceil(Math.abs(today.getTime() - new Date(treatment.last_stage_change).getTime()) / (1000 * 60 * 60 * 24));

    if (timeLimitDays) {
        if (daysInStage > timeLimitDays) return 'red';
        if (daysInStage >= timeLimitDays - 3) return 'yellow';
    }

    const milestoneDate = treatment.next_milestone_date ? new Date(treatment.next_milestone_date) : null;
    if (milestoneDate) {
        const daysRemaining = Math.ceil((milestoneDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) return 'red';
        if (daysRemaining <= 14) return 'yellow';
    }
    return 'green';
}

export function KanbanBoard({ workflow, initialTreatments }: KanbanBoardProps) {
    const { categoria } = useAuth();
    const canReorderColumns = categoria === 'owner' || categoria === 'admin';

    const [treatments, setTreatments] = useState(initialTreatments);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [dragOriginStageId, setDragOriginStageId] = useState<string | null>(null);
    const [isDraggingColumn, setIsDraggingColumn] = useState(false);
    const [localStages, setLocalStages] = useState(
        () => [...workflow.stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    );
    const [selectedTreatment, setSelectedTreatment] = useState<PatientTreatment | null>(null);
    const [timelinePatient, setTimelinePatient] = useState<PatientSummary | null>(null);
    const [timelineData, setTimelineData] = useState<PatientTimelineData | null>(null);
    const [timelineLoading, setTimelineLoading] = useState(false);

    // Filter state
    const [searchFilter, setSearchFilter] = useState('');
    const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
    const [daysFilter, setDaysFilter] = useState<DaysFilter>('all');

    const isFiltered = searchFilter.trim() !== '' || alertFilter !== 'all' || daysFilter !== 'all';

    const handlePatientClick = useCallback(async (patient: PatientSummary) => {
        setTimelinePatient(patient);
        setTimelineLoading(true);
        setTimelineData(null);
        try {
            const data = await getPatientTimeline(patient.id_paciente);
            setTimelineData(data);
        } catch {
            toast.error('No se pudo cargar el historial del paciente');
        } finally {
            setTimelineLoading(false);
        }
    }, []);

    // Effect to update treatments when initialTreatments changes (e.g. tab switch)
    React.useEffect(() => {
        setTreatments(initialTreatments);
    }, [initialTreatments]);

    // Keep localStages in sync when workflow prop changes (tab switch)
    React.useEffect(() => {
        setLocalStages([...workflow.stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    }, [workflow.stages]);

    const sortedStages = localStages;
    const lastStageId = sortedStages[sortedStages.length - 1]?.id;

    const handleMoveToNextStage = useCallback(async (treatment: PatientTreatment, currentStageId: string) => {
        const currentIndex = sortedStages.findIndex(s => s.id === currentStageId);
        const nextStage = sortedStages[currentIndex + 1];
        if (!nextStage) return;

        // Optimistic update
        setTreatments(prev => prev.map(t =>
            t.id === treatment.id
                ? { ...t, current_stage_id: nextStage.id, last_stage_change: new Date().toISOString() }
                : t
        ));

        try {
            await moveTreatmentStage(treatment.id, nextStage.id, currentStageId);
            toast.success(`Movido a "${nextStage.name}"`);
        } catch {
            setTreatments(prev => prev.map(t =>
                t.id === treatment.id ? { ...t, current_stage_id: currentStageId } : t
            ));
            toast.error('Error al mover etapa');
        }
    }, [sortedStages]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Filter + stage helper
    const getTreatmentsByStage = useCallback((stageId: string) => {
        const stage = workflow.stages.find(s => s.id === stageId);
        return treatments.filter(t => {
            if (t.current_stage_id !== stageId) return false;

            if (searchFilter.trim()) {
                const q = searchFilter.toLowerCase().trim();
                const name = `${t.patient.apellido} ${t.patient.nombre}`.toLowerCase();
                const doc = (t.patient.documento || '').toLowerCase();
                if (!name.includes(q) && !doc.includes(q)) return false;
            }

            if (daysFilter !== 'all') {
                const days = Math.ceil(Math.abs(new Date().getTime() - new Date(t.last_stage_change).getTime()) / (1000 * 60 * 60 * 24));
                if (days < parseInt(daysFilter)) return false;
            }

            if (alertFilter !== 'all') {
                const status = getAlertStatus(t, stage?.time_limit_days);
                if (alertFilter === 'red' && status !== 'red') return false;
                if (alertFilter === 'yellow' && status === 'green') return false;
            }

            return true;
        });
    }, [treatments, searchFilter, alertFilter, daysFilter, workflow.stages]);

    // Counts for filter bar info
    const totalVisible = useMemo(
        () => workflow.stages.reduce((acc, s) => acc + getTreatmentsByStage(s.id).length, 0),
        [workflow.stages, getTreatmentsByStage]
    );

    const handleDragStart = (event: DragStartEvent) => {
        const draggedId = event.active.id as string;
        if (draggedId.startsWith(COL_PREFIX)) {
            setIsDraggingColumn(true);
            return;
        }
        const draggedTreatment = treatments.find(t => t.id === draggedId);
        setActiveId(draggedId);
        setDragOriginStageId(draggedTreatment?.current_stage_id || null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;
        // Skip card logic when dragging a column
        if ((active.id as string).startsWith(COL_PREFIX)) return;

        const activeId = active.id;
        const overId = over.id as string;
        const activeTreatment = treatments.find(t => t.id === activeId);
        if (!activeTreatment) return;

        const overColumnId = localStages.find(s => s.id === overId)?.id;
        if (overColumnId && activeTreatment.current_stage_id !== overColumnId) {
            setTreatments(prev => prev.map(t =>
                t.id === activeId ? { ...t, current_stage_id: overColumnId } : t
            ));
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        const draggedId = active.id as string;

        // ── Column reorder ──
        if (draggedId.startsWith(COL_PREFIX)) {
            setIsDraggingColumn(false);
            if (!over) return;
            const activeStageId = draggedId.slice(COL_PREFIX.length);
            const overStageId = (over.id as string).slice(COL_PREFIX.length);
            const oldIdx = localStages.findIndex(s => s.id === activeStageId);
            const newIdx = localStages.findIndex(s => s.id === overStageId);
            if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
            const reordered = arrayMove(localStages, oldIdx, newIdx);
            setLocalStages(reordered);
            updateWorkflowStagesOrder(
                workflow.id,
                reordered.map((s, i) => ({ id: s.id, order_index: i + 1 }))
            ).catch(() => toast.error('No se pudo guardar el orden'));
            return;
        }

        // ── Card move ──
        setActiveId(null);

        if (!over) {
            if (dragOriginStageId) {
                setTreatments(prev => prev.map(t =>
                    t.id === draggedId ? { ...t, current_stage_id: dragOriginStageId } : t
                ));
            }
            setDragOriginStageId(null);
            return;
        }

        const activeTreatment = treatments.find(t => t.id === draggedId);
        const overContainerId = over.id as string;

        if (!activeTreatment) {
            setDragOriginStageId(null);
            return;
        }

        let targetStageId = activeTreatment.current_stage_id;

        if (localStages.some(s => s.id === overContainerId)) {
            targetStageId = overContainerId;
        } else {
            const overTreatment = treatments.find(t => t.id === overContainerId);
            if (overTreatment) targetStageId = overTreatment.current_stage_id;
        }

        const previousStageId = dragOriginStageId || activeTreatment.current_stage_id;

        if (previousStageId && previousStageId !== targetStageId) {
            try {
                await moveTreatmentStage(activeTreatment.id, targetStageId, previousStageId);
                setTreatments(prev => prev.map(t =>
                    t.id === draggedId
                        ? { ...t, current_stage_id: targetStageId, last_stage_change: new Date().toISOString() }
                        : t
                ));
                toast.success('Etapa actualizada');
            } catch {
                setTreatments(prev => prev.map(t =>
                    t.id === draggedId ? { ...t, current_stage_id: previousStageId } : t
                ));
                toast.error('Error al mover tarjeta');
            }
        }

        setDragOriginStageId(null);
    };

    const activeTreatment = activeId ? treatments.find(t => t.id === activeId) : null;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Filter bar ── */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar paciente..."
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* Alert filter */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    {([
                        { value: 'all', label: 'Todos' },
                        { value: 'red', label: '🔴 Urgentes' },
                        { value: 'yellow', label: '🟡 Alertas' },
                    ] as { value: AlertFilter; label: string }[]).map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setAlertFilter(opt.value)}
                            className={clsx(
                                'text-xs px-2.5 py-1 rounded-md transition-all font-medium',
                                alertFilter === opt.value
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Days filter */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    {([
                        { value: 'all', label: 'Todos' },
                        { value: '3', label: '+3d' },
                        { value: '7', label: '+7d' },
                        { value: '14', label: '+14d' },
                    ] as { value: DaysFilter; label: string }[]).map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDaysFilter(opt.value)}
                            className={clsx(
                                'text-xs px-2.5 py-1 rounded-md transition-all font-medium',
                                daysFilter === opt.value
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Result count + clear */}
                <div className="flex items-center gap-2 ml-auto">
                    {isFiltered && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock size={12} />
                            {totalVisible} de {treatments.length}
                        </span>
                    )}
                    {isFiltered && (
                        <button
                            type="button"
                            onClick={() => { setSearchFilter(''); setAlertFilter('all'); setDaysFilter('all'); }}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                        >
                            <X size={12} />
                            Limpiar
                        </button>
                    )}
                    {/* Global urgency summary */}
                    {(() => {
                        const redTotal = treatments.filter(t => {
                            const stage = workflow.stages.find(s => s.id === t.current_stage_id);
                            return getAlertStatus(t, stage?.time_limit_days) === 'red';
                        }).length;
                        return redTotal > 0 ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg animate-pulse">
                                <AlertTriangle size={12} />
                                {redTotal} vencido{redTotal !== 1 ? 's' : ''}
                            </span>
                        ) : null;
                    })()}
                </div>
            </div>

            {/* ── Kanban columns ── */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={localStages.map(s => `${COL_PREFIX}${s.id}`)}
                    strategy={horizontalListSortingStrategy}
                >
                    <div className="flex flex-1 overflow-x-auto pb-4 gap-4 px-2 snap-x snap-mandatory min-h-0">
                        {localStages.map((stage, idx) => (
                            canReorderColumns ? (
                                <SortableColumn key={stage.id} stage={stage} isDraggingAnyColumn={isDraggingColumn}>
                                    {(dragHandleProps) => (
                                        <KanbanColumn
                                            stage={stage}
                                            treatments={getTreatmentsByStage(stage.id)}
                                            stagePosition={idx + 1}
                                            totalStages={localStages.length}
                                            onTreatmentClick={setSelectedTreatment}
                                            onPatientClick={handlePatientClick}
                                            onMoveToNext={(treatment) => handleMoveToNextStage(treatment, stage.id)}
                                            isLastStage={stage.id === lastStageId}
                                            dragHandleProps={dragHandleProps}
                                        />
                                    )}
                                </SortableColumn>
                            ) : (
                                <div key={stage.id} className="snap-center shrink-0 h-full">
                                    <KanbanColumn
                                        stage={stage}
                                        treatments={getTreatmentsByStage(stage.id)}
                                        stagePosition={idx + 1}
                                        totalStages={localStages.length}
                                        onTreatmentClick={setSelectedTreatment}
                                        onPatientClick={handlePatientClick}
                                        onMoveToNext={(treatment) => handleMoveToNextStage(treatment, stage.id)}
                                        isLastStage={stage.id === lastStageId}
                                    />
                                </div>
                            )
                        ))}
                    </div>
                </SortableContext>

                <SharedToaster />

                {selectedTreatment && (
                    <TreatmentDetailsModal
                        treatment={selectedTreatment}
                        onClose={() => setSelectedTreatment(null)}
                    />
                )}

                {timelinePatient && (
                    <PatientTimelineModal
                        patient={timelinePatient}
                        data={timelineData}
                        loading={timelineLoading}
                        onClose={() => { setTimelinePatient(null); setTimelineData(null); }}
                    />
                )}

                <DragOverlay dropAnimation={{
                    sideEffects: defaultDropAnimationSideEffects({
                        styles: {
                            active: {
                                opacity: '0.5',
                            },
                        },
                    }),
                }}>
                    {activeTreatment ? (
                        <div className="w-80">
                            <TreatmentCard
                                treatment={activeTreatment}
                                daysInStage={0}
                                timeLimit={0}
                            />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
