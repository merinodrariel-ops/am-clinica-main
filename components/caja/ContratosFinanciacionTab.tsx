'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Paciente } from '@/lib/patients';
import CalculadoraFinanciera from '@/components/patients/CalculadoraFinanciera';
import {
    getPatientPresentationsAction,
    syncAllPatientPresentationsAction,
    syncPatientPresentationsAction,
    type SyncAllPresentacionesResult,
    type SyncedPresentation,
} from '@/app/actions/presentaciones';

interface ContratosFinanciacionTabProps {
    initialPatientId?: string;
}

type ContractPatient = Pick<
    Paciente,
    'id_paciente' | 'nombre' | 'apellido' | 'documento' | 'cuit' | 'fecha_nacimiento' | 'email' | 'direccion' | 'presupuesto_total'
>;

export default function ContratosFinanciacionTab({ initialPatientId }: ContratosFinanciacionTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [patients, setPatients] = useState<ContractPatient[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<ContractPatient | null>(null);
    const [presentations, setPresentations] = useState<SyncedPresentation[]>([]);
    const [syncingPresentations, setSyncingPresentations] = useState(false);
    const [syncingAllPresentations, setSyncingAllPresentations] = useState(false);
    const [syncAllLimit, setSyncAllLimit] = useState<number>(100);
    const [presentationsFolderUrl, setPresentationsFolderUrl] = useState<string | null>(null);
    const [manualReviewItems, setManualReviewItems] = useState<Array<{ reason: string; fileName?: string; fileId?: string }>>([]);
    const [syncAllReport, setSyncAllReport] = useState<SyncAllPresentacionesResult | null>(null);

    useEffect(() => {
        if (!initialPatientId) return;

        let isMounted = true;

        async function loadInitialPatient() {
            const { data } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, apellido, documento, cuit, fecha_nacimiento, email, direccion, presupuesto_total')
                .eq('id_paciente', initialPatientId)
                .eq('is_deleted', false)
                .single();

            if (!isMounted || !data) return;
            setSelectedPatient(data as ContractPatient);
            setSearchQuery(`${data.apellido}, ${data.nombre}`);
        }

        void loadInitialPatient();

        return () => {
            isMounted = false;
        };
    }, [initialPatientId]);

    useEffect(() => {
        const query = searchQuery.trim();

        const timer = setTimeout(async () => {
            if (query.length < 2) {
                setPatients([]);
                return;
            }

            setSearchLoading(true);
            try {
                const { data, error } = await supabase
                    .from('pacientes')
                    .select('id_paciente, nombre, apellido, documento, cuit, fecha_nacimiento, email, direccion, presupuesto_total')
                    .eq('is_deleted', false)
                    .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,documento.ilike.%${query}%`)
                    .order('apellido', { ascending: true })
                    .limit(10);

                if (error) throw error;
                setPatients((data || []) as ContractPatient[]);
            } catch (error) {
                console.error('Error searching patients for contracts:', error);
                setPatients([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const selectedName = useMemo(() => {
        if (!selectedPatient) return '';
        return `${selectedPatient.apellido}, ${selectedPatient.nombre}`;
    }, [selectedPatient]);

    const loadPresentations = useCallback(async (patientId: string) => {
        const result = await getPatientPresentationsAction(patientId);
        if (result.success) {
            setPresentations(result.data || []);
        }
    }, []);

    useEffect(() => {
        if (!selectedPatient?.id_paciente) {
            setPresentations([]);
            setPresentationsFolderUrl(null);
            setManualReviewItems([]);
            return;
        }
        void loadPresentations(selectedPatient.id_paciente);
    }, [selectedPatient?.id_paciente, loadPresentations]);

    const handleSyncPresentations = async () => {
        if (!selectedPatient?.id_paciente) return;

        try {
            setSyncingPresentations(true);
            const result = await syncPatientPresentationsAction(selectedPatient.id_paciente);

            if (!result.success) {
                toast.error(result.error || 'No se pudo sincronizar presentaciones.');
                setManualReviewItems(result.manualReview || []);
                if (result.folderUrl) setPresentationsFolderUrl(result.folderUrl);
                return;
            }

            setManualReviewItems(result.manualReview || []);
            if (result.folderUrl) setPresentationsFolderUrl(result.folderUrl);
            await loadPresentations(selectedPatient.id_paciente);

            if (result.manualReview.length > 0) {
                toast.warning(
                    `Sincronizadas ${result.syncedCount} presentaciones. ${result.manualReview.length} requieren revisión manual.`
                );
            } else {
                toast.success(`Sincronización completa: ${result.syncedCount} presentaciones.`);
            }
        } finally {
            setSyncingPresentations(false);
        }
    };

    const handleSyncAllPresentations = async () => {
        try {
            setSyncingAllPresentations(true);
            const result = await syncAllPatientPresentationsAction(syncAllLimit);
            setSyncAllReport(result);

            if (!result.success) {
                toast.error(result.error || 'No se pudo ejecutar la sincronización masiva.');
                return;
            }

            if (result.manualReviewCount > 0) {
                toast.warning(
                    `Sync masiva: ${result.syncedFiles} archivos en ${result.processedPatients} pacientes. ${result.manualReviewCount} pendientes manuales.`
                );
            } else {
                toast.success(
                    `Sync masiva completa: ${result.syncedFiles} archivos en ${result.processedPatients} pacientes.`
                );
            }

            if (selectedPatient?.id_paciente) {
                await loadPresentations(selectedPatient.id_paciente);
            }
        } finally {
            setSyncingAllPresentations(false);
        }
    };

    const handleExportManualReviewCsv = () => {
        if (!syncAllReport || syncAllReport.manualReview.length === 0) {
            toast.error('No hay pendientes manuales para exportar.');
            return;
        }

        const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
        const headers = ['paciente_id', 'paciente_nombre', 'motivo', 'archivo', 'drive_file_id'];
        const rows = syncAllReport.manualReview.map((item) => [
            item.patientId,
            item.patientName,
            item.reason,
            item.fileName || '',
            item.fileId || '',
        ]);

        const csv = [
            headers.map(escapeCell).join(','),
            ...rows.map((row) => row.map((cell) => escapeCell(String(cell))).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStamp = new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `presentaciones-pendientes-manual-${dateStamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="glass-card rounded-2xl p-5" style={{ background: 'hsla(230, 15%, 12%, 0.6)' }}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold" style={{ color: 'hsl(210 20% 90%)' }}>
                            ContratoMaker financiero
                        </h3>
                        <p className="text-xs mt-1" style={{ color: 'hsl(230 10% 45%)' }}>
                            Selecciona paciente, calcula opciones y genera contrato legal en carpeta madre de Drive.
                        </p>
                    </div>

                    {selectedPatient && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPatient(null);
                                setSearchQuery('');
                                setPatients([]);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                            style={{
                                background: 'hsla(0, 70%, 50%, 0.12)',
                                color: 'hsl(0 70% 65%)',
                                border: '1px solid hsla(0, 70%, 50%, 0.2)',
                            }}
                        >
                            <X size={12} />
                            Cambiar paciente
                        </button>
                    )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs" style={{ color: 'hsl(230 10% 50%)' }}>
                        Sincronización global:
                    </span>
                    <select
                        value={syncAllLimit}
                        onChange={(event) => setSyncAllLimit(Number(event.target.value))}
                        className="rounded-md px-2 py-1 text-xs"
                        style={{
                            background: 'hsla(230, 15%, 8%, 0.7)',
                            border: '1px solid hsla(230, 15%, 20%, 0.8)',
                            color: 'hsl(210 20% 85%)',
                        }}
                    >
                        <option value={50}>Top 50 pacientes</option>
                        <option value={100}>Top 100 pacientes</option>
                        <option value={200}>Top 200 pacientes</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => void handleSyncAllPresentations()}
                        disabled={syncingAllPresentations}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                            background: 'hsla(38, 92%, 50%, 0.14)',
                            color: 'hsl(38 92% 62%)',
                            border: '1px solid hsla(38, 92%, 50%, 0.25)',
                            opacity: syncingAllPresentations ? 0.7 : 1,
                        }}
                    >
                        <RefreshCw size={12} className={syncingAllPresentations ? 'animate-spin' : ''} />
                        {syncingAllPresentations ? 'Sync global...' : 'Sincronizar todos'}
                    </button>
                </div>

                {syncAllReport && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: 'hsla(230, 15%, 8%, 0.6)', border: '1px solid hsla(230, 15%, 20%, 0.8)' }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold" style={{ color: 'hsl(210 20% 85%)' }}>
                                Resultado sync global
                            </p>
                            {syncAllReport.manualReviewCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleExportManualReviewCsv}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
                                    style={{
                                        background: 'hsla(210, 100%, 60%, 0.14)',
                                        color: 'hsl(210 90% 72%)',
                                        border: '1px solid hsla(210, 100%, 60%, 0.25)',
                                    }}
                                >
                                    <Download size={11} />
                                    Exportar pendientes CSV
                                </button>
                            )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'hsl(230 10% 50%)' }}>
                            Pacientes procesados: {syncAllReport.processedPatients} · Archivos sincronizados: {syncAllReport.syncedFiles} · Pendientes manuales: {syncAllReport.manualReviewCount}
                        </p>
                        {syncAllReport.manualReviewCount > 0 && (
                            <div className="mt-2 max-h-28 overflow-y-auto space-y-1 pr-1">
                                {syncAllReport.manualReview.slice(0, 12).map((item, idx) => (
                                    <div key={`${item.patientId}-${idx}`} className="text-[11px]" style={{ color: 'hsl(38 92% 65%)' }}>
                                        {item.patientName}: {item.reason}{item.fileName ? ` (${item.fileName})` : ''}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {!selectedPatient && (
                    <div className="mt-4 relative">
                        <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2"
                            style={{ color: 'hsl(230 10% 45%)' }}
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Buscar paciente por nombre, apellido o documento"
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none"
                            style={{
                                background: 'hsla(230, 15%, 8%, 0.6)',
                                border: '1px solid hsla(230, 15%, 20%, 0.8)',
                                color: 'hsl(210 20% 85%)',
                            }}
                        />

                        {searchLoading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 size={14} className="animate-spin" style={{ color: 'hsl(230 10% 45%)' }} />
                            </div>
                        )}

                        {patients.length > 0 && (
                            <div
                                className="absolute z-20 mt-2 w-full rounded-xl overflow-hidden"
                                style={{
                                    background: 'hsl(230 15% 10%)',
                                    border: '1px solid hsla(230, 15%, 20%, 0.8)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
                                }}
                            >
                                {patients.map((patient) => (
                                    <button
                                        key={patient.id_paciente}
                                        type="button"
                                        onClick={() => {
                                            setSelectedPatient(patient);
                                            setSearchQuery(`${patient.apellido}, ${patient.nombre}`);
                                            setPatients([]);
                                        }}
                                        className="w-full px-4 py-3 text-left text-sm transition-colors"
                                        style={{
                                            color: 'hsl(210 20% 85%)',
                                            borderBottom: '1px solid hsla(230, 15%, 18%, 0.8)',
                                        }}
                                        onMouseEnter={(event) => {
                                            event.currentTarget.style.background = 'hsla(165, 100%, 42%, 0.08)';
                                        }}
                                        onMouseLeave={(event) => {
                                            event.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        <div className="font-medium">{patient.apellido}, {patient.nombre}</div>
                                        <div className="text-xs" style={{ color: 'hsl(230 10% 45%)' }}>
                                            DNI: {patient.documento || 'Sin documento'}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {selectedPatient && (
                    <div
                        className="mt-4 rounded-xl p-3 flex items-center gap-3"
                        style={{ background: 'hsla(165, 100%, 42%, 0.08)', border: '1px solid hsla(165, 100%, 42%, 0.2)' }}
                    >
                        <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center"
                            style={{ background: 'hsla(165, 100%, 42%, 0.16)' }}
                        >
                            <UserRound size={16} style={{ color: 'hsl(165 85% 50%)' }} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold" style={{ color: 'hsl(210 20% 90%)' }}>
                                {selectedName}
                            </p>
                            <p className="text-xs" style={{ color: 'hsl(230 10% 45%)' }}>
                                DNI: {selectedPatient.documento || 'Sin documento'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {selectedPatient ? (
                <>
                    <div className="glass-card rounded-2xl p-5" style={{ background: 'hsla(230, 15%, 12%, 0.55)' }}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-bold" style={{ color: 'hsl(210 20% 90%)' }}>
                                    Presentaciones Drive sincronizadas
                                </h4>
                                <p className="text-xs mt-1" style={{ color: 'hsl(230 10% 45%)' }}>
                                    Indexa las presentaciones del paciente en base de datos para acceso rápido.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {presentationsFolderUrl && (
                                    <a
                                        href={presentationsFolderUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                                        style={{
                                            background: 'hsla(210, 100%, 60%, 0.12)',
                                            color: 'hsl(210 90% 70%)',
                                            border: '1px solid hsla(210, 100%, 60%, 0.25)',
                                        }}
                                    >
                                        Abrir carpeta
                                        <ExternalLink size={12} />
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void handleSyncPresentations()}
                                    disabled={syncingPresentations}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                                    style={{
                                        background: 'hsla(165, 100%, 42%, 0.14)',
                                        color: 'hsl(165 85% 50%)',
                                        border: '1px solid hsla(165, 100%, 42%, 0.25)',
                                        opacity: syncingPresentations ? 0.7 : 1,
                                    }}
                                >
                                    <RefreshCw size={12} className={syncingPresentations ? 'animate-spin' : ''} />
                                    {syncingPresentations ? 'Sincronizando...' : 'Sincronizar presentaciones'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="rounded-xl p-3" style={{ background: 'hsla(230, 15%, 8%, 0.6)', border: '1px solid hsla(230, 15%, 20%, 0.8)' }}>
                                <p className="text-xs font-semibold" style={{ color: 'hsl(210 20% 85%)' }}>
                                    Archivos indexados
                                </p>
                                {presentations.length === 0 ? (
                                    <p className="text-xs mt-1" style={{ color: 'hsl(230 10% 45%)' }}>
                                        Aún no hay presentaciones sincronizadas.
                                    </p>
                                ) : (
                                    <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                        {presentations.slice(0, 8).map((item) => (
                                            <a
                                                key={item.drive_file_id}
                                                href={item.drive_web_view_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between text-xs rounded-md px-2 py-1 transition-colors hover:bg-white/5"
                                                style={{ color: 'hsl(210 20% 82%)' }}
                                            >
                                                <span className="truncate max-w-[220px]">{item.drive_name}</span>
                                                <ExternalLink size={11} />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl p-3" style={{ background: 'hsla(230, 15%, 8%, 0.6)', border: '1px solid hsla(230, 15%, 20%, 0.8)' }}>
                                <p className="text-xs font-semibold" style={{ color: 'hsl(210 20% 85%)' }}>
                                    Revisión manual
                                </p>
                                {manualReviewItems.length === 0 ? (
                                    <p className="text-xs mt-1" style={{ color: 'hsl(165 70% 50%)' }}>
                                        Sin pendientes manuales en la última sincronización.
                                    </p>
                                ) : (
                                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-1">
                                        {manualReviewItems.map((item, index) => (
                                            <div
                                                key={`${item.fileId || 'manual'}-${index}`}
                                                className="rounded-md px-2 py-1.5"
                                                style={{ background: 'hsla(38, 92%, 50%, 0.12)', border: '1px solid hsla(38, 92%, 50%, 0.2)' }}
                                            >
                                                <div className="flex items-start gap-1.5 text-xs" style={{ color: 'hsl(38 90% 65%)' }}>
                                                    <AlertTriangle size={12} className="mt-0.5" />
                                                    <div>
                                                        <p>{item.reason}</p>
                                                        {item.fileName && <p className="opacity-90">Archivo: {item.fileName}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <CalculadoraFinanciera patient={selectedPatient as Paciente} />
                </>
            ) : (
                <div className="rounded-2xl p-10 text-center" style={{ background: 'hsla(230, 15%, 12%, 0.45)', border: '1px dashed hsla(230, 15%, 24%, 0.9)' }}>
                    <p className="text-sm font-medium" style={{ color: 'hsl(230 10% 50%)' }}>
                        Selecciona un paciente para iniciar la simulacion, generar contrato y preparar la presentacion de financiacion.
                    </p>
                </div>
            )}
        </div>
    );
}
