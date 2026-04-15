'use client';

import { useState, useEffect, useCallback } from 'react';
import { BanIcon, Trash2, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getAgendaBlocks, deleteAgendaBlock, getBlockedAppointments } from '@/app/actions/agenda';
import type { AgendaBlock } from '@/app/actions/agenda';
import AgendaBlockModal from './AgendaBlockModal';

interface Doctor {
    id: string;
    full_name: string;
}

interface AgendaBlocksManagerProps {
    doctors: Doctor[];
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
    vacaciones: 'Vacaciones',
    feriado: 'Feriado',
    evento_externo: 'Evento externo',
    mantenimiento: 'Mantenimiento',
    otro: 'Otro',
};

function formatDateRange(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const fmt = (d: Date) =>
        d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    return `${fmt(s)} → ${fmt(e)}`;
}

export default function AgendaBlocksManager({ doctors }: AgendaBlocksManagerProps) {
    const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
    const [affectedCounts, setAffectedCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const loadBlocks = useCallback(async () => {
        setLoading(true);
        const now = new Date().toISOString();
        const future = new Date();
        future.setFullYear(future.getFullYear() + 1);
        const fetched = await getAgendaBlocks(now, future.toISOString());
        setBlocks(fetched);

        // Contar turnos afectados por cada bloque en paralelo
        const counts: Record<string, number> = {};
        await Promise.all(
            fetched.map(async b => {
                const apts = await getBlockedAppointments(b.id);
                counts[b.id] = apts.length;
            })
        );
        setAffectedCounts(counts);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadBlocks();
    }, [loadBlocks]);

    async function handleDelete(blockId: string) {
        setDeletingId(blockId);
        const result = await deleteAgendaBlock(blockId);
        setDeletingId(null);

        if (result.error) {
            toast.error(`Error: ${result.error}`);
            return;
        }
        toast.success('Bloqueo eliminado');
        loadBlocks();
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BanIcon size={18} className="text-red-500" />
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                        Bloqueos de agenda
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadBlocks}
                        disabled={loading}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
                        title="Actualizar"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                    >
                        <Plus size={14} />
                        Nuevo bloqueo
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-sm text-gray-400 py-6 text-center">Cargando bloqueos...</div>
            ) : blocks.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    No hay bloqueos programados
                </div>
            ) : (
                <div className="space-y-2">
                    {blocks.map(block => {
                        const count = affectedCounts[block.id] ?? 0;
                        const doctorName = block.doctor
                            ? (block.doctor as { full_name: string }).full_name
                            : 'Toda la clínica';

                        return (
                            <div
                                key={block.id}
                                className="flex items-start justify-between gap-3 p-4 rounded-xl border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                                            {BLOCK_TYPE_LABELS[block.block_type] ?? block.block_type}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            · {doctorName}
                                        </span>
                                        {count > 0 && (
                                            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                                                <AlertTriangle size={11} />
                                                {count} turno{count !== 1 ? 's' : ''} pendiente{count !== 1 ? 's' : ''} de notificar
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 font-medium">
                                        {formatDateRange(block.start_time, block.end_time)}
                                    </p>
                                    {block.reason && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {block.reason}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleDelete(block.id)}
                                    disabled={deletingId === block.id}
                                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors flex-shrink-0 mt-0.5"
                                    title="Eliminar bloqueo"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {showCreateModal && (
                <AgendaBlockModal
                    doctors={doctors}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={loadBlocks}
                />
            )}
        </div>
    );
}
