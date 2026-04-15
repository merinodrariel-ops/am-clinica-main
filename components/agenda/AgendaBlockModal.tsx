'use client';

import { useState } from 'react';
import { X, BanIcon } from 'lucide-react';
import { toast } from 'sonner';
import { createAgendaBlock } from '@/app/actions/agenda';
import type { CreateAgendaBlockPayload } from '@/app/actions/agenda';

interface Doctor {
    id: string;
    full_name: string;
}

interface AgendaBlockModalProps {
    doctors: Doctor[];
    initialStart?: Date;
    initialEnd?: Date;
    onClose: () => void;
    onCreated: () => void;
}

const BLOCK_TYPES = [
    { value: 'evento_externo', label: 'Evento externo' },
    { value: 'vacaciones', label: 'Vacaciones' },
    { value: 'feriado', label: 'Feriado' },
    { value: 'mantenimiento', label: 'Mantenimiento' },
    { value: 'otro', label: 'Otro' },
];

function toLocalDatetimeValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AgendaBlockModal({
    doctors,
    initialStart,
    initialEnd,
    onClose,
    onCreated,
}: AgendaBlockModalProps) {
    const now = new Date();
    const defaultEnd = new Date(now);
    defaultEnd.setHours(23, 59, 0, 0);

    const [doctorId, setDoctorId] = useState<string>('__all__');
    const [startValue, setStartValue] = useState(toLocalDatetimeValue(initialStart ?? now));
    const [endValue, setEndValue] = useState(toLocalDatetimeValue(initialEnd ?? defaultEnd));
    const [blockType, setBlockType] = useState('evento_externo');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!startValue || !endValue) return;

        const start = new Date(startValue);
        const end = new Date(endValue);
        if (end <= start) {
            toast.error('La fecha de fin debe ser posterior a la de inicio');
            return;
        }

        setSaving(true);
        const payload: CreateAgendaBlockPayload = {
            doctor_id: doctorId === '__all__' ? null : doctorId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            block_type: blockType,
            reason: reason.trim() || undefined,
        };

        const result = await createAgendaBlock(payload);
        setSaving(false);

        if (result.error) {
            toast.error(`Error al crear bloqueo: ${result.error}`);
            return;
        }

        toast.success('Bloqueo de agenda creado');
        onCreated();
        onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <BanIcon size={18} className="text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Bloquear agenda
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Doctor selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Afecta a
                        </label>
                        <select
                            value={doctorId}
                            onChange={e => setDoctorId(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="__all__">Toda la clínica</option>
                            {doctors.map(d => (
                                <option key={d.id} value={d.id}>{d.full_name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Desde
                            </label>
                            <input
                                type="datetime-local"
                                value={startValue}
                                onChange={e => setStartValue(e.target.value)}
                                required
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Hasta
                            </label>
                            <input
                                type="datetime-local"
                                value={endValue}
                                onChange={e => setEndValue(e.target.value)}
                                required
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Block type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Tipo de bloqueo
                        </label>
                        <select
                            value={blockType}
                            onChange={e => setBlockType(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {BLOCK_TYPES.map(bt => (
                                <option key={bt.value} value={bt.value}>{bt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Motivo (opcional)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Ej: Congreso odontológico, obra en el local..."
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                        >
                            {saving ? 'Guardando...' : 'Crear bloqueo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
