'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Check, Loader2, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { getDoctors, getImportedEventTypes, reassignDoctorBulk } from '@/app/actions/agenda';

interface EventTypeGroup {
    title: string;
    source: string;
    doctorId: string;
    doctorName: string;
    count: number;
}

interface Doctor {
    id: string;
    full_name: string;
    role: string;
}

function suggestDoctor(title: string, doctors: Doctor[]): string | null {
    const titleLower = title.toLowerCase();
    for (const doc of doctors) {
        const nameParts = doc.full_name.toLowerCase().split(' ');
        for (const part of nameParts) {
            if (part.length >= 3 && titleLower.includes(part)) {
                return doc.id;
            }
        }
    }
    return null;
}

export default function DoctorReassignmentPanel() {
    const [eventTypes, setEventTypes] = useState<EventTypeGroup[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [done, setDone] = useState<Record<string, boolean>>({});

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [types, docs] = await Promise.all([getImportedEventTypes(), getDoctors()]);
            setEventTypes(types);
            setDoctors(docs);

            // Auto-suggest doctors based on title matching
            const suggestions: Record<string, string> = {};
            for (const et of types) {
                const suggested = suggestDoctor(et.title, docs);
                if (suggested) {
                    const key = `${et.title}||${et.source}||${et.doctorId}`;
                    suggestions[key] = suggested;
                }
            }
            setAssignments(suggestions);
            setDone({});
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleReassign = async (et: EventTypeGroup) => {
        const key = `${et.title}||${et.source}||${et.doctorId}`;
        const newDoctorId = assignments[key];
        if (!newDoctorId || newDoctorId === et.doctorId) {
            toast.error('Seleccioná un doctor diferente');
            return;
        }

        setSaving(prev => ({ ...prev, [key]: true }));
        try {
            const result = await reassignDoctorBulk(
                { title: et.title, source: et.source, currentDoctorId: et.doctorId },
                newDoctorId
            );
            if (result.success) {
                const docName = doctors.find(d => d.id === newDoctorId)?.full_name || '';
                toast.success(`${result.updatedCount} turnos reasignados a ${docName}`);
                setDone(prev => ({ ...prev, [key]: true }));
                // Refresh data after a short delay
                setTimeout(loadData, 1000);
            } else {
                toast.error(result.error || 'Error al reasignar');
            }
        } catch (err) {
            toast.error('Error al reasignar');
        } finally {
            setSaving(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleApplyAll = async () => {
        const pending = eventTypes.filter(et => {
            const key = `${et.title}||${et.source}||${et.doctorId}`;
            return assignments[key] && assignments[key] !== et.doctorId && !done[key];
        });

        if (pending.length === 0) {
            toast.info('No hay reasignaciones pendientes');
            return;
        }

        for (const et of pending) {
            await handleReassign(et);
        }
    };

    const totalImported = eventTypes.reduce((sum, et) => sum + et.count, 0);
    const pendingCount = eventTypes.filter(et => {
        const key = `${et.title}||${et.source}||${et.doctorId}`;
        return !done[key];
    }).length;
    const suggestedCount = Object.keys(assignments).length;

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8">
                <div className="flex items-center justify-center gap-3 text-gray-500">
                    <Loader2 size={20} className="animate-spin" />
                    Cargando turnos importados...
                </div>
            </div>
        );
    }

    if (eventTypes.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                <Users size={32} className="mx-auto mb-3 text-gray-400" />
                <p className="text-gray-500">No hay turnos importados para reasignar.</p>
                <p className="text-xs text-gray-400 mt-1">Importá turnos desde Calendly o Google Calendar primero.</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/10">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                            <Users size={20} />
                            Reasignar Doctores
                        </h3>
                        <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-1">
                            {totalImported} turnos importados en {eventTypes.length} tipos de evento
                            {suggestedCount > 0 && (
                                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <Sparkles size={12} />
                                    {suggestedCount} auto-sugeridos
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={loadData}
                            className="h-8 w-8 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                        >
                            <RefreshCw size={16} />
                        </Button>
                        {pendingCount > 0 && suggestedCount > 0 && (
                            <Button
                                onClick={handleApplyAll}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-xl h-auto"
                            >
                                Aplicar Todos ({pendingCount})
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {eventTypes.map((et) => {
                    const key = `${et.title}||${et.source}||${et.doctorId}`;
                    const isDone = done[key];
                    const isSaving = saving[key];
                    const selectedDoctor = assignments[key] || '';

                    return (
                        <div
                            key={key}
                            className={`p-4 flex items-center gap-4 transition-colors ${isDone ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                        >
                            {/* Event info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">
                                    {et.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                        {et.source}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {et.count} turnos
                                    </span>
                                </div>
                            </div>

                            {/* Current doctor */}
                            <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block min-w-[120px]">
                                {et.doctorName}
                            </div>

                            <ArrowRight size={16} className="text-gray-400 hidden sm:block flex-shrink-0" />

                            {/* Doctor selector */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {isDone ? (
                                    <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                                        <Check size={16} />
                                        {doctors.find(d => d.id === selectedDoctor)?.full_name || 'Reasignado'}
                                    </span>
                                ) : (
                                    <>
                                        <select
                                            value={selectedDoctor}
                                            onChange={(e) => setAssignments(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500 max-w-[180px]"
                                        >
                                            <option value="">Seleccionar doctor...</option>
                                            {doctors.map(doc => (
                                                <option key={doc.id} value={doc.id}>
                                                    {doc.full_name}
                                                </option>
                                            ))}
                                        </select>
                                        <Button
                                            onClick={() => handleReassign(et)}
                                            disabled={!selectedDoctor || selectedDoctor === et.doctorId || isSaving}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm px-3 py-2 rounded-lg h-auto"
                                        >
                                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
