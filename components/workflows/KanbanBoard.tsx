'use client';

import React, { useState } from 'react';
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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { TreatmentCard } from './TreatmentCard';
import { moveTreatmentStage } from '@/app/actions/clinical-workflows';
import { Toaster as SharedToaster } from 'sonner';
import { toast } from 'sonner';
import { TreatmentDetailsModal } from './TreatmentDetailsModal';
import type { ClinicalWorkflow, PatientTreatment } from './types';

interface KanbanBoardProps {
    workflow: ClinicalWorkflow;
    initialTreatments: PatientTreatment[];
}

export function KanbanBoard({ workflow, initialTreatments }: KanbanBoardProps) {
    const [treatments, setTreatments] = useState(initialTreatments);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [dragOriginStageId, setDragOriginStageId] = useState<string | null>(null);
    const [selectedTreatment, setSelectedTreatment] = useState<PatientTreatment | null>(null);

    // Effect to update treatments when initialTreatments changes (e.g. tab switch)
    React.useEffect(() => {
        setTreatments(initialTreatments);
    }, [initialTreatments]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Helper to get treatments for a specific column
    const getTreatmentsByStage = (stageId: string) => {
        return treatments.filter(t => t.current_stage_id === stageId);
    };

    const handleDragStart = (event: DragStartEvent) => {
        const draggedId = event.active.id as string;
        const draggedTreatment = treatments.find(t => t.id === draggedId);

        setActiveId(draggedId);
        setDragOriginStageId(draggedTreatment?.current_stage_id || null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // Find the containers
        const activeTreatment = treatments.find(t => t.id === activeId);
        // const overTreatment = treatments.find(t => t.id === overId); // This variable is not used

        if (!activeTreatment) return;

        // If over a container (column) directly
        const overColumnId = workflow.stages.find(s => s.id === overId)?.id;

        if (overColumnId && activeTreatment.current_stage_id !== overColumnId) {
            setTreatments(prev => {
                return prev.map(t => {
                    if (t.id === activeId) {
                        return { ...t, current_stage_id: overColumnId };
                    }
                    return t;
                });
            });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        const draggedId = active.id as string;

        if (!over) {
            if (dragOriginStageId) {
                setTreatments(prev => prev.map(t => {
                    if (t.id === draggedId) {
                        return { ...t, current_stage_id: dragOriginStageId };
                    }
                    return t;
                }));
            }
            setDragOriginStageId(null);
            return;
        }

        const activeTreatment = treatments.find(t => t.id === draggedId);
        const overContainerId = over.id as string; // Can be a treatment ID or a stage ID

        if (!activeTreatment) {
            setDragOriginStageId(null);
            return;
        }

        // Determine target stage
        let targetStageId = activeTreatment.current_stage_id;


        // Check if dropped on a stage column
        if (workflow.stages.some(s => s.id === overContainerId)) {
            targetStageId = overContainerId;
        } else {
            // Dropped on another card, find its stage
            const overTreatment = treatments.find(t => t.id === overContainerId);
            if (overTreatment) {
                targetStageId = overTreatment.current_stage_id;
            }
        }

        const previousStageId = dragOriginStageId || activeTreatment.current_stage_id;

        if (previousStageId && previousStageId !== targetStageId) {
            try {
                await moveTreatmentStage(
                    activeTreatment.id,
                    targetStageId,
                    previousStageId
                );
                setTreatments(prev => {
                    return prev.map(t => {
                        if (t.id === draggedId) {
                            return { ...t, current_stage_id: targetStageId, last_stage_change: new Date().toISOString() };
                        }
                        return t;
                    });
                });
                toast.success('Etapa actualizada');
            } catch {
                setTreatments(prev => {
                    return prev.map(t => {
                        if (t.id === draggedId) {
                            return { ...t, current_stage_id: previousStageId };
                        }
                        return t;
                    });
                });
                toast.error('Error al mover tarjeta');
            }
        }

        setDragOriginStageId(null);
    };

    const activeTreatment = activeId ? treatments.find(t => t.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full overflow-x-auto pb-4 gap-4 px-2 snap-x snap-mandatory">
                {workflow.stages.map(stage => (
                    <div key={stage.id} className="snap-center shrink-0 h-full">
                        <KanbanColumn
                            stage={stage}
                            treatments={getTreatmentsByStage(stage.id)}
                            stagePosition={Math.max((stage.order_index || 1), 1)}
                            totalStages={workflow.stages.length}
                            onTreatmentClick={setSelectedTreatment}
                        />
                    </div>
                ))}
            </div>

            <SharedToaster />

            {selectedTreatment && (
                <TreatmentDetailsModal
                    treatment={selectedTreatment}
                    onClose={() => setSelectedTreatment(null)}
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
                            timeLimit={0} // Doesn't matter for overlay
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
