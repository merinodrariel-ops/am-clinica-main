'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    CheckCircle,
    XCircle,
    Eye,
    FileText,
    Filter,
    User
} from 'lucide-react';
import {
    type RegistroHoras,
    type Personal,
    type MotivoObservado,
    type MetodoVerificacion,
    type ResolucionData,
    getRegistrosObservados,
    getPersonal,
    resolverRegistro,
    anularRegistro
} from '@/lib/caja-admin';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

interface Props {
    mes: string;
    onCountChange?: (count: number) => void;
}

const MOTIVOS_LABELS: Record<MotivoObservado, string> = {
    FaltaIngreso: 'Falta Ingreso',
    FaltaEgreso: 'Falta Egreso',
    HorasExcesivas: 'Horas Excesivas',
    MarcacionesImpares: 'Marcaciones Impares',
    ConflictoDuplicado: 'Conflicto/Duplicado',
    Otro: 'Otro',
};

const METODOS_LABELS: Record<MetodoVerificacion, string> = {
    Camaras: 'Cámaras de Seguridad',
    PorteroElectrico: 'Portero Eléctrico',
    Testigo: 'Testimonio de Tercero',
    Otro: 'Otro',
};

function getSlaInfo(registro: RegistroHoras): {
    text: string;
    className: string;
    level: 'ok' | 'warn' | 'critical';
} {
    const sourceDate = registro.created_at || registro.fecha;
    const parsed = new Date(sourceDate);
    const createdAt = Number.isNaN(parsed.getTime()) ? new Date(`${registro.fecha}T00:00:00`) : parsed;
    const ageHours = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)));

    if (ageHours >= 48) {
        return {
            text: `${ageHours}h sin resolver`,
            level: 'critical',
            className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
        };
    }

    if (ageHours >= 24) {
        return {
            text: `${ageHours}h sin resolver`,
            level: 'warn',
            className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
        };
    }

    return {
        text: `${ageHours}h`,
        level: 'ok',
        className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    };
}

export default function ObservadosTab({ mes, onCountChange }: Props) {
    const [registros, setRegistros] = useState<RegistroHoras[]>([]);
    const [personal, setPersonal] = useState<Personal[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRegistro, setSelectedRegistro] = useState<RegistroHoras | null>(null);

    // Filters
    const [filterPersonal, setFilterPersonal] = useState<string>('');
    const [filterMotivo, setFilterMotivo] = useState<MotivoObservado | ''>('');

    // Resolution form
    const [resolucionForm, setResolucionForm] = useState<Partial<ResolucionData>>({
        hora_ingreso: '',
        hora_egreso: '',
        nota_resolucion: '',
        metodo_verificacion: undefined,
        evidencia_url: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function loadData() {
        setLoading(true);
        const [registrosData, personalData] = await Promise.all([
            getRegistrosObservados({
                mes,
                personal_id: filterPersonal || undefined,
                motivo: filterMotivo || undefined,
            }),
            getPersonal(),
        ]);

        const sortedRegistros = [...registrosData].sort((a, b) => {
            const slaA = getSlaInfo(a);
            const slaB = getSlaInfo(b);

            const priority: Record<'ok' | 'warn' | 'critical', number> = {
                critical: 3,
                warn: 2,
                ok: 1,
            };

            const byPriority = priority[slaB.level] - priority[slaA.level];
            if (byPriority !== 0) return byPriority;

            const dateA = new Date(a.created_at || a.fecha).getTime();
            const dateB = new Date(b.created_at || b.fecha).getTime();
            return dateA - dateB; // oldest first when same SLA level
        });

        setRegistros(sortedRegistros);
        setPersonal(personalData);
        onCountChange?.(sortedRegistros.length);
        setLoading(false);
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mes, filterPersonal, filterMotivo]);

    function openResolver(registro: RegistroHoras) {
        setSelectedRegistro(registro);
        setResolucionForm({
            hora_ingreso: registro.hora_ingreso || '',
            hora_egreso: registro.hora_egreso || '',
            nota_resolucion: '',
            metodo_verificacion: undefined,
            evidencia_url: '',
        });
        setError(null);
    }

    async function handleResolver() {
        if (!selectedRegistro) return;
        if (!resolucionForm.nota_resolucion?.trim()) {
            setError('La nota de resolución es obligatoria');
            return;
        }
        if (!resolucionForm.metodo_verificacion) {
            setError('El método de verificación es obligatorio');
            return;
        }

        setSubmitting(true);
        setError(null);

        const result = await resolverRegistro(selectedRegistro.id, {
            hora_ingreso: resolucionForm.hora_ingreso || undefined,
            hora_egreso: resolucionForm.hora_egreso || undefined,
            nota_resolucion: resolucionForm.nota_resolucion,
            metodo_verificacion: resolucionForm.metodo_verificacion,
            evidencia_url: resolucionForm.evidencia_url || undefined,
            resuelto_por: 'Admin', // TODO: Get from auth context
        });

        setSubmitting(false);

        if (!result.success) {
            setError(result.error || 'Error al resolver');
            return;
        }

        setSelectedRegistro(null);
        loadData();
    }

    async function handleAnular() {
        if (!selectedRegistro) return;
        if (!resolucionForm.nota_resolucion?.trim()) {
            setError('El motivo de anulación es obligatorio');
            return;
        }

        setSubmitting(true);
        const result = await anularRegistro(
            selectedRegistro.id,
            resolucionForm.nota_resolucion,
            'Dirección' // TODO: Get from auth context
        );
        setSubmitting(false);

        if (!result.success) {
            setError(result.error || 'Error al anular');
            return;
        }

        setSelectedRegistro(null);
        loadData();
    }

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
                Cargando registros observados...
            </div>
        );
    }

    const pendingCritical = registros.filter((reg) => getSlaInfo(reg).level === 'critical').length;
    const pendingWarn = registros.filter((reg) => getSlaInfo(reg).level === 'warn').length;

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
                    <User className="w-4 h-4 text-slate-400" />
                    <select
                        value={filterPersonal}
                        onChange={(e) => setFilterPersonal(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm"
                    >
                        <option value="">Todos</option>
                        {personal.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={filterMotivo}
                        onChange={(e) => setFilterMotivo(e.target.value as MotivoObservado | '')}
                        className="bg-transparent border-none outline-none text-sm"
                    >
                        <option value="">Todos los motivos</option>
                        {Object.entries(MOTIVOS_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Observados List */}
            {registros.length === 0 ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-12 text-center">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
                        Sin registros pendientes
                    </h3>
                    <p className="text-green-600 dark:text-green-500">
                        No hay marcaciones observadas para este período
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                                <h3 className="font-semibold text-amber-800 dark:text-amber-300">
                                    {registros.length} registros requieren resolución
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    Críticos: {pendingCritical}
                                </span>
                                <span className="px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    24h+: {pendingWarn}
                                </span>
                            </div>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                            Resolvé primero los registros con SLA en rojo para evitar impacto en liquidaciones.
                        </p>
                    </div>

                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Persona</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Motivo</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Horarios</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {registros.map((reg) => {
                                const sla = getSlaInfo(reg);

                                return (
                                <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                                                <User className="w-4 h-4 text-purple-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{reg.personal?.nombre || 'N/A'}</p>
                                                <p className="text-xs text-slate-500">{reg.personal?.rol || ''}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex flex-col gap-1">
                                            <span>
                                                {new Date(reg.fecha).toLocaleDateString('es-AR', {
                                                    weekday: 'short',
                                                    day: 'numeric',
                                                    month: 'short',
                                                })}
                                            </span>
                                            <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-md text-[11px] font-medium ${sla.className}`}>
                                                SLA: {sla.text}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-medium">
                                            <AlertTriangle className="w-3 h-3" />
                                            {reg.motivo_observado ? MOTIVOS_LABELS[reg.motivo_observado] : 'Sin motivo'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm">
                                        <div className="flex items-center justify-center gap-2">
                                            <span className={reg.hora_ingreso ? 'text-green-600' : 'text-red-500'}>
                                                {reg.hora_ingreso || '--:--'}
                                            </span>
                                            <span className="text-slate-400">→</span>
                                            <span className={reg.hora_egreso ? 'text-green-600' : 'text-red-500'}>
                                                {reg.hora_egreso || '--:--'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => openResolver(reg)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 h-auto"
                                        >
                                            <Eye className="w-4 h-4" />
                                            Resolver
                                        </Button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Resolver Modal */}
            <AnimatePresence>
                {selectedRegistro && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setSelectedRegistro(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                                <h2 className="text-xl font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                    <AlertTriangle className="w-6 h-6" />
                                    Resolver Marcación Faltante
                                </h2>
                                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                    {selectedRegistro.personal?.nombre} • {new Date(selectedRegistro.fecha).toLocaleDateString('es-AR', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}
                                </p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Original Values */}
                                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                                    <h3 className="text-sm font-semibold text-slate-500 mb-3 flex items-center gap-2">
                                        <FileText className="w-4 h-4" />
                                        Valores Importados (Original)
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-xs text-slate-400">Hora Ingreso</span>
                                            <p className="font-mono text-lg">
                                                {selectedRegistro.original_hora_ingreso || selectedRegistro.hora_ingreso || '--:--'}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-400">Hora Egreso</span>
                                            <p className="font-mono text-lg">
                                                {selectedRegistro.original_hora_egreso || selectedRegistro.hora_egreso || '--:--'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                        <span className="text-xs text-slate-400">Motivo de Observación</span>
                                        <p className="font-medium text-amber-600">
                                            {selectedRegistro.motivo_observado ? MOTIVOS_LABELS[selectedRegistro.motivo_observado] : 'No especificado'}
                                        </p>
                                    </div>
                                </div>

                                {/* Resolution Form */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Hora Ingreso Corregida
                                        </label>
                                        <Input
                                            type="time"
                                            value={resolucionForm.hora_ingreso || ''}
                                            onChange={(e) => setResolucionForm({ ...resolucionForm, hora_ingreso: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Hora Egreso Corregida
                                        </label>
                                        <Input
                                            type="time"
                                            value={resolucionForm.hora_egreso || ''}
                                            onChange={(e) => setResolucionForm({ ...resolucionForm, hora_egreso: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Método de Verificación *
                                    </label>
                                    <select
                                        value={resolucionForm.metodo_verificacion || ''}
                                        onChange={(e) => setResolucionForm({ ...resolucionForm, metodo_verificacion: e.target.value as MetodoVerificacion })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    >
                                        <option value="">Seleccionar método...</option>
                                        {Object.entries(METODOS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        URL de Evidencia (opcional)
                                    </label>
                                    <Input
                                        type="url"
                                        value={resolucionForm.evidencia_url || ''}
                                        onChange={(e) => setResolucionForm({ ...resolucionForm, evidencia_url: e.target.value })}
                                        placeholder="https://drive.google.com/..."
                                        className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Nota de Resolución *
                                    </label>
                                    <Textarea
                                        value={resolucionForm.nota_resolucion || ''}
                                        onChange={(e) => setResolucionForm({ ...resolucionForm, nota_resolucion: e.target.value })}
                                        rows={3}
                                        placeholder="Describir cómo se verificó la información y justificar la corrección..."
                                        className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    />
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                                        <XCircle className="w-4 h-4" />
                                        {error}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                                <Button
                                    variant="ghost"
                                    onClick={handleAnular}
                                    disabled={submitting}
                                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl font-medium disabled:opacity-50 hover:text-red-700"
                                >
                                    <XCircle className="w-4 h-4" />
                                    Anular Registro
                                </Button>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setSelectedRegistro(null)}
                                        className="px-4 py-2 text-slate-600 hover:text-slate-800"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={handleResolver}
                                        disabled={submitting}
                                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-medium shadow-lg disabled:opacity-50 hover:shadow-xl transition-shadow"
                                    >
                                        {submitting ? 'Guardando...' : 'Guardar Resolución'}
                                        <CheckCircle className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
