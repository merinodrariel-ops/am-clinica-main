'use client';

import React, { useMemo, useState } from 'react';
import { Settings2, X, Save, Loader2, Plus, GripVertical, Trash2, Mail, Users, Bell, Clock, Info } from 'lucide-react';
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
    notify_emails: string[];
    reminder_windows_days: string;
    staff_email_template: string;
    patient_email_template: string;
    notify_patient_on_entry: boolean;
    sla_staff_template: string;
    reminder_patient_template: string;
    reminder_staff_template: string;
    staff_email_subject: string;
    patient_email_subject: string;
    sla_staff_subject: string;
    reminder_patient_subject: string;
    reminder_staff_subject: string;
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
            notify_emails: stage.notify_emails || [],
            reminder_windows_days: (stage.reminder_windows_days || []).join(','),
            staff_email_template: stage.staff_email_template || '',
            patient_email_template: stage.patient_email_template || '',
            notify_patient_on_entry: Boolean(stage.notify_patient_on_entry),
            sla_staff_template: stage.sla_staff_template || '',
            reminder_patient_template: stage.reminder_patient_template || '',
            reminder_staff_template: stage.reminder_staff_template || '',
            staff_email_subject: stage.staff_email_subject || '',
            patient_email_subject: stage.patient_email_subject || '',
            sla_staff_subject: stage.sla_staff_subject || '',
            reminder_patient_subject: stage.reminder_patient_subject || '',
            reminder_staff_subject: stage.reminder_staff_subject || '',
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

    const updateStageField = (id: string, field: keyof EditableStage, value: string | boolean | string[]) => {
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
                notify_emails: [],
                reminder_windows_days: '',
                staff_email_template: '',
                patient_email_template: '',
                notify_patient_on_entry: false,
                sla_staff_template: '',
                reminder_patient_template: '',
                reminder_staff_template: '',
                staff_email_subject: '',
                patient_email_subject: '',
                sla_staff_subject: '',
                reminder_patient_subject: '',
                reminder_staff_subject: '',
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
                    notify_emails: stage.notify_emails,
                    reminder_windows_days: stage.reminder_windows_days
                        .split(',')
                        .map(value => Number(value.trim()))
                        .filter(value => Number.isFinite(value) && value > 0)
                        .slice(0, 3),
                    staff_email_template: stage.staff_email_template.trim() || null,
                    patient_email_template: stage.patient_email_template.trim() || null,
                    notify_patient_on_entry: stage.notify_patient_on_entry,
                    sla_staff_template: stage.sla_staff_template.trim() || null,
                    reminder_patient_template: stage.reminder_patient_template.trim() || null,
                    reminder_staff_template: stage.reminder_staff_template.trim() || null,
                    staff_email_subject: stage.staff_email_subject.trim() || null,
                    patient_email_subject: stage.patient_email_subject.trim() || null,
                    sla_staff_subject: stage.sla_staff_subject.trim() || null,
                    reminder_patient_subject: stage.reminder_patient_subject.trim() || null,
                    reminder_staff_subject: stage.reminder_staff_subject.trim() || null,
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

const VARIABLES = [
    { label: 'Paciente', value: '{{paciente}}' },
    { label: 'Etapa', value: '{{etapa}}' },
    { label: 'Workflow', value: '{{workflow}}' },
    { label: 'Hito', value: '{{hito}}' },
];

function VariableToolbar({ onSelect }: { onSelect: (val: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1 mb-1.5">
            {VARIABLES.map(v => (
                <button
                    key={v.value}
                    type="button"
                    onClick={() => onSelect(v.value)}
                    className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-600 transition-colors"
                >
                    +{v.label}
                </button>
            ))}
        </div>
    );
}

function VariableInput({
    value,
    onChange,
    placeholder,
    label,
    description,
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    label: string;
    description?: string;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const insertVariable = (variable: string) => {
        const input = inputRef.current;
        if (!input) return;

        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const text = input.value;
        const newValue = text.substring(0, start) + variable + text.substring(end);

        onChange(newValue);

        setTimeout(() => {
            input.focus();
            input.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</label>
                <VariableToolbar onSelect={insertVariable} />
            </div>
            <input
                ref={inputRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
            {description && <p className="text-[10px] text-gray-400">{description}</p>}
        </div>
    );
}

function VariableTextarea({
    value,
    onChange,
    placeholder,
    label,
    rows = 2,
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    label: string;
    rows?: number;
}) {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const insertVariable = (variable: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const text = textarea.value;
        const newValue = text.substring(0, start) + variable + text.substring(end);

        onChange(newValue);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</label>
                <VariableToolbar onSelect={insertVariable} />
            </div>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
            />
        </div>
    );
}

function SortableStageCard({
    stage,
    updateStageField,
    onRemove,
}: {
    stage: EditableStage;
    updateStageField: (id: string, field: keyof EditableStage, value: string | boolean | string[]) => void;
    onRemove: () => void;
}) {
    const [newEmail, setNewEmail] = useState('');

    const handleAddEmail = () => {
        const email = newEmail.trim().toLowerCase();
        if (!email) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast.error('Email invalido');
            return;
        }
        if (stage.notify_emails.includes(email)) {
            toast.error('El email ya esta en la lista');
            return;
        }
        updateStageField(stage.id, 'notify_emails', [...stage.notify_emails, email]);
        setNewEmail('');
    };

    const handleRemoveEmail = (email: string) => {
        updateStageField(stage.id, 'notify_emails', stage.notify_emails.filter(e => e !== email));
    };
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

                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Recordatorios por columna (max 3)</label>
                    <input
                        value={stage.reminder_windows_days}
                        onChange={e => updateStageField(stage.id, 'reminder_windows_days', e.target.value)}
                        placeholder="30,14,3"
                        className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    />
                </div>

                <div className="md:col-span-2 space-y-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                    {/* EQUIPO SECTION */}
                    <div className="bg-blue-50/30 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100/50 dark:border-blue-900/20">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg">
                                <Users size={16} />
                            </div>
                            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 uppercase tracking-tight">Notificaciones para el Equipo</h4>
                        </div>

                        <div className="space-y-5">
                            <label className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900/30 rounded-xl cursor-pointer hover:bg-blue-50/50 transition-colors">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                    checked={stage.notify_on_entry}
                                    onChange={e => updateStageField(stage.id, 'notify_on_entry', e.target.checked)}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Activar Alerta de Ingreso</span>
                                    <span className="text-[10px] text-gray-500">Se enviara un email al equipo cuando un caso entre a esta etapa.</span>
                                </div>
                            </label>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Recipients</label>
                                    <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded italic">Admin & Professional list</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {stage.notify_emails.map(email => (
                                        <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 rounded-full text-xs border border-blue-200 dark:border-blue-700 shadow-sm transition-transform hover:scale-105">
                                            {email}
                                            <button onClick={() => handleRemoveEmail(email)} className="text-blue-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())}
                                        placeholder="equipo@clinic.com"
                                        className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                                    />
                                    <button onClick={handleAddEmail} type="button" className="px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1 shadow-sm">
                                        <Plus size={14} />
                                        ADD
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 pt-2 border-t border-blue-100/30 dark:border-blue-900/20">
                                <div className="space-y-4">
                                    <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-blue-50 dark:border-blue-900/10">
                                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
                                            <Bell size={14} />
                                            <span className="text-xs font-bold uppercase tracking-widest">Aviso de Ingreso</span>
                                        </div>
                                        <VariableInput
                                            label="Subject Staff Entry"
                                            value={stage.staff_email_subject}
                                            onChange={val => updateStageField(stage.id, 'staff_email_subject', val)}
                                            placeholder="Ej: Nuevo Paciente: {{paciente}}"
                                        />
                                        <VariableTextarea
                                            label="Message Staff Entry"
                                            value={stage.staff_email_template}
                                            onChange={val => updateStageField(stage.id, 'staff_email_template', val)}
                                            placeholder="Detalles: El paciente {{paciente}} ha ingresado a {{etapa}}..."
                                        />
                                    </div>

                                    <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-blue-50 dark:border-blue-900/10">
                                        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                                            <Clock size={14} />
                                            <span className="text-xs font-bold uppercase tracking-widest">Alerta Expiración SLA</span>
                                        </div>
                                        <VariableInput
                                            label="Subject SLA Alert"
                                            value={stage.sla_staff_subject}
                                            onChange={val => updateStageField(stage.id, 'sla_staff_subject', val)}
                                            placeholder="Ej: ALERTA: Vencimiento SLA para {{paciente}}"
                                        />
                                        <VariableTextarea
                                            label="Message SLA Alert"
                                            value={stage.sla_staff_template}
                                            onChange={val => updateStageField(stage.id, 'sla_staff_template', val)}
                                            placeholder="El tiempo limite para {{paciente}} en {{etapa}} esta por vencer..."
                                        />
                                    </div>

                                    <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-blue-50 dark:border-blue-900/10">
                                        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                                            <Clock size={14} />
                                            <span className="text-xs font-bold uppercase tracking-widest">Recordatorios Programados</span>
                                        </div>
                                        <VariableInput
                                            label="Subject Staff Reminder"
                                            value={stage.reminder_staff_subject}
                                            onChange={val => updateStageField(stage.id, 'reminder_staff_subject', val)}
                                            placeholder="Ej: Seguimiento: {{paciente}} en {{etapa}}"
                                        />
                                        <VariableTextarea
                                            label="Message Staff Reminder"
                                            value={stage.reminder_staff_template}
                                            onChange={val => updateStageField(stage.id, 'reminder_staff_template', val)}
                                            placeholder="Recordatorio para el equipo: {{paciente}} lleva tiempo en {{etapa}}..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PACIENTE SECTION */}
                    <div className="bg-green-50/30 dark:bg-green-900/10 rounded-xl p-4 border border-green-100/50 dark:border-green-900/20">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-lg">
                                <Mail size={16} />
                            </div>
                            <h4 className="text-sm font-bold text-green-900 dark:text-green-100 uppercase tracking-tight">Notificaciones para el Paciente</h4>
                        </div>

                        <div className="space-y-5">
                            <label className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-green-100 dark:border-green-900/30 rounded-xl cursor-pointer hover:bg-green-50/50 transition-colors">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                                    checked={stage.notify_patient_on_entry}
                                    onChange={e => updateStageField(stage.id, 'notify_patient_on_entry', e.target.checked)}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Activar Notificación Automática</span>
                                    <span className="text-[10px] text-gray-500">El sistema enviara un email personalizado al paciente al entrar a esta etapa.</span>
                                </div>
                            </label>

                            <div className="grid grid-cols-1 gap-4 pt-2 border-t border-green-100/30 dark:border-green-900/20">
                                <div className="space-y-4">
                                    <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-green-50 dark:border-green-900/10">
                                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
                                            <Bell size={14} />
                                            <span className="text-xs font-bold uppercase tracking-widest">Bienvenida a la Etapa</span>
                                        </div>
                                        <VariableInput
                                            label="Subject Patient Welcome"
                                            value={stage.patient_email_subject}
                                            onChange={val => updateStageField(stage.id, 'patient_email_subject', val)}
                                            placeholder="Ej: Hola {{paciente}}, novedades en tu caso"
                                        />
                                        <VariableTextarea
                                            label="Message Patient Welcome"
                                            value={stage.patient_email_template}
                                            onChange={val => updateStageField(stage.id, 'patient_email_template', val)}
                                            placeholder="Querido {{paciente}}, te informamos que hemos avanzado a la etapa {{etapa}}..."
                                        />
                                    </div>

                                    <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-green-50 dark:border-green-900/10">
                                        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                                            <Clock size={14} />
                                            <span className="text-xs font-bold uppercase tracking-widest">Recordatorios Programados</span>
                                        </div>
                                        <VariableInput
                                            label="Subject Patient Reminder"
                                            value={stage.reminder_patient_subject}
                                            onChange={val => updateStageField(stage.id, 'reminder_patient_subject', val)}
                                            placeholder="Ej: Recordatorio: Novedades en tu tratamiento"
                                        />
                                        <VariableTextarea
                                            label="Message Patient Reminder"
                                            value={stage.reminder_patient_template}
                                            onChange={val => updateStageField(stage.id, 'reminder_patient_template', val)}
                                            placeholder="Hola {{paciente}}, te escribimos para recordarte que seguimos trabajando en {{etapa}}..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg text-gray-500">
                        <Info size={14} className="shrink-0" />
                        <span className="text-[10px] leading-tight font-medium">
                            Los recordatorios se envían automáticamente según la lista de días (Windows) configurada arriba. Asegúrate de que los pacientes tengan un email registrado.
                        </span>
                    </div>
                </div>
            </div>
            {isDragging ? <div className="mt-2 text-xs text-blue-600">Moviendo columna...</div> : null}
        </div>
    );
}
