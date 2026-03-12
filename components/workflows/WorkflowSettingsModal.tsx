'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Settings2, X, Save, Loader2, Plus, GripVertical, Trash2, Mail, Users, Bell, Clock, Info, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { updateWorkflowStagesConfig, getWorkflowStaffEmailList, sendTestWorkflowEmail } from '@/app/actions/clinical-workflows';
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
    const [staffEmails, setStaffEmails] = useState<{ name: string; email: string }[]>([]);
    const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

    const toggleStage = (id: string) => setExpandedStageId(prev => (prev === id ? null : id));

    React.useEffect(() => {
        if (isOpen && staffEmails.length === 0) {
            getWorkflowStaffEmailList().then(setStaffEmails).catch(() => {});
        }
    }, [isOpen, staffEmails.length]);

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
        setExpandedStageId(newStageId);
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
                                            staffEmails={staffEmails}
                                            workflowName={workflow.name}
                                            workflowId={workflow.id}
                                            isExpanded={expandedStageId === stage.id}
                                            onToggle={() => toggleStage(stage.id)}
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
    { label: 'Carpeta Drive', value: '{{drive_url}}' },
    { label: 'Archivos App', value: '{{app_url}}' },
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

const COLOR_DOT: Record<string, string> = {
    blue: 'bg-blue-400',
    green: 'bg-green-400',
    purple: 'bg-purple-400',
    orange: 'bg-orange-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400',
    gray: 'bg-gray-400',
};

function SortableStageCard({
    stage,
    updateStageField,
    onRemove,
    staffEmails = [],
    workflowName = '',
    workflowId,
    isExpanded = false,
    onToggle,
}: {
    stage: EditableStage;
    updateStageField: (id: string, field: keyof EditableStage, value: string | boolean | string[]) => void;
    onRemove: () => void;
    staffEmails?: { name: string; email: string }[];
    workflowName?: string;
    workflowId?: string;
    isExpanded?: boolean;
    onToggle?: () => void;
}) {
    const [newEmail, setNewEmail] = useState('');
    const [testEmailTo, setTestEmailTo] = useState('');
    const [testDriveUrl, setTestDriveUrl] = useState('');
    const [testAppUrl, setTestAppUrl] = useState('');
    const [testingTemplate, setTestingTemplate] = useState<string | null>(null);

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

    const handleAddStaffEmail = (email: string) => {
        if (stage.notify_emails.includes(email)) return;
        updateStageField(stage.id, 'notify_emails', [...stage.notify_emails, email]);
    };

    const handleRemoveEmail = (email: string) => {
        updateStageField(stage.id, 'notify_emails', stage.notify_emails.filter(e => e !== email));
    };

    const handleSendTestEmail = async (templateKey: 'staff_entry' | 'sla_alert' | 'staff_reminder' | 'patient_entry' | 'patient_reminder') => {
        const to = testEmailTo.trim();
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            toast.error('Ingresá un email destino válido');
            return;
        }
        const subjects: Record<string, string> = {
            staff_entry: stage.staff_email_subject,
            sla_alert: stage.sla_staff_subject,
            staff_reminder: stage.reminder_staff_subject,
            patient_entry: stage.patient_email_subject,
            patient_reminder: stage.reminder_patient_subject,
        };
        const bodies: Record<string, string> = {
            staff_entry: stage.staff_email_template,
            sla_alert: stage.sla_staff_template,
            staff_reminder: stage.reminder_staff_template,
            patient_entry: stage.patient_email_template,
            patient_reminder: stage.reminder_patient_template,
        };
        const subject = subjects[templateKey] || `Prueba: ${stage.name}`;
        const body = bodies[templateKey] || '(sin cuerpo configurado)';
        setTestingTemplate(templateKey);
        try {
            const result = await sendTestWorkflowEmail({
                toEmail: to,
                subject,
                body,
                stageName: stage.name,
                stageId: stage.persistedId,
                workflowName,
                workflowId,
                driveUrl: testDriveUrl || undefined,
                appUrl: testAppUrl || undefined,
            });
            if (result.ok) {
                toast.success(`Email de prueba enviado a ${to}`);
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } finally {
            setTestingTemplate(null);
        }
    };

    const availableStaff = staffEmails.filter(s => !stage.notify_emails.includes(s.email));
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

    // Summary line for collapsed state
    const summaryParts: string[] = [];
    if (stage.time_limit_days) summaryParts.push(`SLA ${stage.time_limit_days}d`);
    if (stage.notify_emails.length > 0) summaryParts.push(`${stage.notify_emails.length} destinatario${stage.notify_emails.length > 1 ? 's' : ''}`);
    if (stage.notify_on_entry) summaryParts.push('aviso ingreso');
    if (stage.notify_patient_on_entry) summaryParts.push('notif. paciente');
    const summary = summaryParts.join(' · ') || 'Sin configuración';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx(
                'rounded-xl border transition-all',
                isExpanded
                    ? 'border-blue-200 dark:border-blue-700 bg-blue-50/20 dark:bg-blue-900/10 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 hover:border-blue-200 dark:hover:border-blue-800'
            )}
        >
            {/* Collapsed header — always visible */}
            <div className="flex items-center gap-2 px-3 py-3">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="text-gray-400 hover:text-gray-600 cursor-grab shrink-0"
                    title="Arrastrar para reordenar"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical size={16} />
                </button>

                <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', COLOR_DOT[stage.color] || 'bg-gray-400')} />

                <button
                    type="button"
                    onClick={onToggle}
                    className="flex-1 text-left min-w-0"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                            {stage.name || 'Sin nombre'}
                        </span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{summary}</p>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        type="button"
                        onClick={onToggle}
                        className={clsx(
                            'px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors',
                            isExpanded
                                ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                        )}
                    >
                        {isExpanded ? 'Cerrar' : 'Configurar'}
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded"
                        title="Eliminar columna"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {isExpanded && (
            <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4">
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
                        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <Users size={16} />
                                </div>
                                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 uppercase tracking-tight">Notificaciones para el Equipo</h4>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <input
                                    value={testEmailTo}
                                    onChange={e => setTestEmailTo(e.target.value)}
                                    placeholder="tu@email.com para probar"
                                    className="rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-[11px] outline-none w-56 focus:border-amber-400"
                                />
                                <input
                                    value={testDriveUrl}
                                    onChange={e => setTestDriveUrl(e.target.value)}
                                    placeholder="Link Drive (opcional, sino toma automático)"
                                    className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 px-2.5 py-1.5 text-[11px] outline-none w-56 focus:border-amber-400 text-gray-500"
                                />
                                <input
                                    value={testAppUrl}
                                    onChange={e => setTestAppUrl(e.target.value)}
                                    placeholder="Link Archivos app (opcional, sino toma automático)"
                                    className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 px-2.5 py-1.5 text-[11px] outline-none w-56 focus:border-amber-400 text-gray-500"
                                />
                            </div>
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

                                {availableStaff.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Agregar del equipo</p>
                                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                                            {availableStaff.map(s => (
                                                <button
                                                    key={s.email}
                                                    type="button"
                                                    onClick={() => handleAddStaffEmail(s.email)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 rounded-full text-[11px] border border-gray-200 dark:border-gray-700 hover:border-blue-300 transition-colors"
                                                >
                                                    <Plus size={10} />
                                                    {s.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-4 pt-2 border-t border-blue-100/30 dark:border-blue-900/20">
                                <div className="space-y-4">
                                    <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-blue-50 dark:border-blue-900/10">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                                                <Bell size={14} />
                                                <span className="text-xs font-bold uppercase tracking-widest">Aviso de Ingreso</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSendTestEmail('staff_entry')}
                                                disabled={testingTemplate === 'staff_entry'}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg border border-amber-200 disabled:opacity-50 transition-colors"
                                            >
                                                {testingTemplate === 'staff_entry' ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                                Probar
                                            </button>
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
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                                <Clock size={14} />
                                                <span className="text-xs font-bold uppercase tracking-widest">Alerta Expiración SLA</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSendTestEmail('sla_alert')}
                                                disabled={testingTemplate === 'sla_alert'}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg border border-amber-200 disabled:opacity-50 transition-colors"
                                            >
                                                {testingTemplate === 'sla_alert' ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                                Probar
                                            </button>
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
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                                                <Clock size={14} />
                                                <span className="text-xs font-bold uppercase tracking-widest">Recordatorios Programados</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSendTestEmail('staff_reminder')}
                                                disabled={testingTemplate === 'staff_reminder'}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg border border-amber-200 disabled:opacity-50 transition-colors"
                                            >
                                                {testingTemplate === 'staff_reminder' ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                                Probar
                                            </button>
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
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                                <Bell size={14} />
                                                <span className="text-xs font-bold uppercase tracking-widest">Bienvenida a la Etapa</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSendTestEmail('patient_entry')}
                                                disabled={testingTemplate === 'patient_entry'}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg border border-amber-200 disabled:opacity-50 transition-colors"
                                            >
                                                {testingTemplate === 'patient_entry' ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                                Probar
                                            </button>
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
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                                                <Clock size={14} />
                                                <span className="text-xs font-bold uppercase tracking-widest">Recordatorios Programados</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSendTestEmail('patient_reminder')}
                                                disabled={testingTemplate === 'patient_reminder'}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg border border-amber-200 disabled:opacity-50 transition-colors"
                                            >
                                                {testingTemplate === 'patient_reminder' ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                                Probar
                                            </button>
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
            </div>
            )}
        </div>
    );
}
