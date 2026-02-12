'use client';

import React, { useMemo, useState } from 'react';
import { Settings2, X, Save, Loader2, Plus, GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { updateWorkflowStagesConfig } from '@/app/actions/clinical-workflows';
import type { ClinicalWorkflow } from './types';
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface WorkflowSettingsModalProps {
    workflow: ClinicalWorkflow;
}

interface EditableStage {
    id: string;
    persistedId?: string;
    name: string;
    color: string;
    time_limit_days: string;
    notify_on_entry: boolean;
    notify_before_days: string;
    notify_emails: string;
}

const COLOR_OPTIONS = ['blue', 'green', 'purple', 'orange', 'red', 'yellow', 'gray'];

export function WorkflowSettingsModal({ workflow }: WorkflowSettingsModalProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const initialStages = useMemo<EditableStage[]>(
        () => workflow.stages.map(stage => ({
            id: stage.id,
            persistedId: stage.id,
            name: stage.name,
            color: stage.color || 'gray',
            time_limit_days: stage.time_limit_days?.toString() || '',
            notify_on_entry: Boolean(stage.notify_on_entry),
            notify_before_days: stage.notify_before_days?.toString() || '',
            notify_emails: (stage.notify_emails || []).join(', '),
        })),
        [workflow.stages]
    );

    const [stages, setStages] = useState<EditableStage[]>(initialStages);
    const [deletedStageIds, setDeletedStageIds] = useState<string[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    React.useEffect(() => {
        setStages(initialStages);
        setDeletedStageIds([]);
    }, [initialStages]);

    const updateStageField = (id: string, field: keyof EditableStage, value: string | boolean) => {
        setStages(prev => prev.map(stage => {
            if (stage.id !== id) return stage;
            return { ...stage, [field]: value };
        }));
    };

    const handleAddStage = () => {
        const newStageId = `new-${crypto.randomUUID()}`;
        setStages(prev => [
            ...prev,
            {
                id: newStageId,
                name: 'Nueva columna',
                color: 'gray',
                time_limit_days: '',
                notify_on_entry: false,
                notify_before_days: '',
                notify_emails: '',
            },
        ]);
    };

    const handleRemoveStage = (stage: EditableStage) => {
        if (stages.length <= 1) {
            toast.error('El workflow debe tener al menos una columna');
            return;
        }

        setStages(prev => prev.filter(item => item.id !== stage.id));
        if (stage.persistedId) {
            setDeletedStageIds(prev => [...prev, stage.persistedId as string]);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setStages(prev => {
            const oldIndex = prev.findIndex(item => item.id === active.id);
            const newIndex = prev.findIndex(item => item.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateWorkflowStagesConfig({
                workflowId: workflow.id,
                stages: stages.map((stage, index) => ({
                    id: stage.persistedId,
                    name: stage.name.trim(),
                    color: stage.color,
                    order_index: index + 1,
                    time_limit_days: stage.time_limit_days ? Number(stage.time_limit_days) : null,
                    notify_on_entry: stage.notify_on_entry,
                    notify_before_days: stage.notify_before_days ? Number(stage.notify_before_days) : null,
                    notify_emails: stage.notify_emails
                        .split(',')
                        .map(email => email.trim())
                        .filter(Boolean),
                })),
                deletedStageIds,
            });
            toast.success('Configuracion del workflow actualizada');
            setIsOpen(false);
            router.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error al guardar configuracion';
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
                <Settings2 size={16} />
                Configurar Flujo
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">Configuracion de {workflow.name}</h3>
                                <p className="text-xs text-gray-500">Edita columnas, SLA y notificaciones por etapa</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-4 pt-4">
                            <button
                                onClick={handleAddStage}
                                className="px-3 py-2 text-sm font-medium bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg flex items-center gap-2"
                            >
                                <Plus size={14} />
                                Agregar columna
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto space-y-4">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={stages.map(stage => stage.id)} strategy={verticalListSortingStrategy}>
                                    {stages.map(stage => (
                                        <SortableStageCard
                                            key={stage.id}
                                            stage={stage}
                                            updateStageField={updateStageField}
                                            onRemove={() => handleRemoveStage(stage)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        </div>

                        <div className="px-4 pb-2 text-xs text-gray-500">
                            Arrastra las columnas con el icono para reordenarlas.
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end gap-2">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Guardar configuracion
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function SortableStageCard({
    stage,
    updateStageField,
    onRemove,
}: {
    stage: EditableStage;
    updateStageField: (id: string, field: keyof EditableStage, value: string | boolean) => void;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: stage.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/30"
        >
            <div className="flex items-center justify-between mb-3">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
                    title="Arrastrar para reordenar"
                >
                    <GripVertical size={14} />
                    Reordenar
                </button>
                <button
                    onClick={onRemove}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                    title="Eliminar columna"
                >
                    <Trash2 size={14} />
                    Eliminar
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Nombre de columna</label>
                    <input
                        value={stage.name}
                        onChange={e => updateStageField(stage.id, 'name', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Color</label>
                    <select
                        value={stage.color}
                        onChange={e => updateStageField(stage.id, 'color', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    >
                        {COLOR_OPTIONS.map(color => (
                            <option key={color} value={color}>{color}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Limite de dias (SLA)</label>
                    <input
                        type="number"
                        min={0}
                        value={stage.time_limit_days}
                        onChange={e => updateStageField(stage.id, 'time_limit_days', e.target.value)}
                        placeholder="Ej: 7"
                        className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Avisar X dias antes del SLA</label>
                    <input
                        type="number"
                        min={0}
                        value={stage.notify_before_days}
                        onChange={e => updateStageField(stage.id, 'notify_before_days', e.target.value)}
                        placeholder="Ej: 2"
                        className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Emails de notificacion (separados por coma)</label>
                    <input
                        value={stage.notify_emails}
                        onChange={e => updateStageField(stage.id, 'notify_emails', e.target.value)}
                        placeholder="coordinacion@clinic.com, recepcion@clinic.com"
                        className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    />
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
                    <input
                        type="checkbox"
                        checked={stage.notify_on_entry}
                        onChange={e => updateStageField(stage.id, 'notify_on_entry', e.target.checked)}
                    />
                    Enviar notificacion cuando una tarjeta entra a esta columna
                </label>
            </div>
            {isDragging ? <div className="mt-2 text-xs text-blue-600">Moviendo columna...</div> : null}
        </div>
    );
}
