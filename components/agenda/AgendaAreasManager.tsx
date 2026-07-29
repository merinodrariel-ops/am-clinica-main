'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers3, Loader2, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import NewWorkerModal from '@/components/admin/NewWorkerModal';
import {
    createAgendaClinicalArea,
    getAgendaClinicalAreas,
    setAgendaClinicalAreaActive,
    type AgendaClinicalArea,
} from '@/app/actions/agenda';

export default function AgendaAreasManager() {
    const [areas, setAreas] = useState<AgendaClinicalArea[]>([]);
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [workerOpen, setWorkerOpen] = useState(false);

    const load = useCallback(async () => {
        setAreas(await getAgendaClinicalAreas(true));
        setLoading(false);
    }, []);

    useEffect(() => {
        let active = true;
        getAgendaClinicalAreas(true).then(data => {
            if (!active) return;
            setAreas(data);
            setLoading(false);
        });
        return () => { active = false; };
    }, []);

    async function createArea() {
        if (!name.trim() || saving) return;
        setSaving(true);
        const result = await createAgendaClinicalArea({ nombre: name });
        setSaving(false);
        if (!result.success) {
            toast.error(result.error || 'No se pudo crear el área');
            return;
        }
        setName('');
        await load();
        toast.success('Área disponible en la agenda');
    }

    async function toggle(area: AgendaClinicalArea) {
        const result = await setAgendaClinicalAreaActive(area.id, !area.activo);
        if (!result.success) {
            toast.error(result.error || 'No se pudo actualizar el área');
            return;
        }
        setAreas(current => current.map(item => item.id === area.id ? { ...item, activo: !item.activo } : item));
    }

    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                        <Layers3 size={18} className="text-violet-600" />
                        Áreas y profesionales
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">Creá especialidades para clasificar turnos y asignales profesionales.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setWorkerOpen(true)}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                    <UserPlus size={16} />
                    Agregar profesional
                </button>
            </div>

            <div className="mb-4 flex gap-2">
                <input
                    value={name}
                    onChange={event => setName(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') void createArea(); }}
                    placeholder="Ej: Endodoncia"
                    maxLength={80}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <button
                    type="button"
                    onClick={() => void createArea()}
                    disabled={saving || name.trim().length < 2}
                    className="flex items-center gap-2 rounded-xl border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-700 dark:text-violet-300"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Crear área
                </button>
            </div>

            {loading ? (
                <div className="py-4 text-sm text-gray-400">Cargando áreas…</div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {areas.map(area => (
                        <button
                            type="button"
                            key={area.id}
                            onClick={() => void toggle(area)}
                            title={area.activo ? 'Desactivar área' : 'Reactivar área'}
                            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${area.activo
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-gray-700 dark:bg-gray-800'
                            }`}
                        >
                            {area.nombre}
                        </button>
                    ))}
                </div>
            )}

            {workerOpen && (
                <NewWorkerModal
                    onClose={() => setWorkerOpen(false)}
                    onCreated={() => toast.success('Profesional agregado a la agenda')}
                    initialType="odontologo"
                />
            )}
        </section>
    );
}
