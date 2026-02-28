'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellDot, Loader2, Search, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Paciente } from '@/lib/patients';
import CalculadoraFinanciera from '@/components/patients/CalculadoraFinanciera';
import SimuladorFinanciacion from '@/components/patients/SimuladorFinanciacion';
import {
    getFinancingSimulationPresetAction,
    listRecentFinancingSelectionsAction,
    type FinancingSimulationPreset,
    type RecentFinancingSelectionRecord,
} from '@/app/actions/contracts';

interface ContratosFinanciacionTabProps {
    initialPatientId?: string;
}

type ContractPatient = Pick<
    Paciente,
    'id_paciente' | 'nombre' | 'apellido' | 'documento' | 'cuit' | 'fecha_nacimiento' | 'email' | 'telefono' | 'direccion' | 'presupuesto_total'
>;

function formatInboxDate(iso: string): string {
    return new Date(iso).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ContratosFinanciacionTab({ initialPatientId }: ContratosFinanciacionTabProps) {
    const [activeFlow, setActiveFlow] = useState<'simulador' | 'contractmaker'>('simulador');
    const [searchQuery, setSearchQuery] = useState('');
    const [patients, setPatients] = useState<ContractPatient[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<ContractPatient | null>(null);
    const [activePreset, setActivePreset] = useState<FinancingSimulationPreset | null>(null);
    const [inboxItems, setInboxItems] = useState<RecentFinancingSelectionRecord[]>([]);
    const [loadingInbox, setLoadingInbox] = useState(false);
    const [openingInboxSimulationId, setOpeningInboxSimulationId] = useState<string | null>(null);

    const wizardStep = !selectedPatient ? 1 : !activePreset ? 2 : 3;

    useEffect(() => {
        if (wizardStep < 3 && activeFlow !== 'simulador') {
            setActiveFlow('simulador');
        }
    }, [wizardStep, activeFlow]);

    useEffect(() => {
        let mounted = true;

        const loadInbox = async (silent = false) => {
            if (!silent) {
                setLoadingInbox(true);
            }

            const result = await listRecentFinancingSelectionsAction({ hours: 24, limit: 8 });

            if (!mounted) return;

            if (!result.success) {
                if (!silent) {
                    toast.error(result.error || 'No se pudo cargar el inbox de acciones.');
                }
                if (!silent) {
                    setLoadingInbox(false);
                }
                return;
            }

            setInboxItems(result.items);
            if (!silent) {
                setLoadingInbox(false);
            }
        };

        void loadInbox();
        const intervalId = window.setInterval(() => {
            void loadInbox(true);
        }, 30000);

        return () => {
            mounted = false;
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        if (!initialPatientId) return;

        let isMounted = true;

        async function loadInitialPatient() {
            const { data } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, apellido, documento, cuit, fecha_nacimiento, email, telefono, direccion, presupuesto_total')
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
                    .select('id_paciente, nombre, apellido, documento, cuit, fecha_nacimiento, email, telefono, direccion, presupuesto_total')
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

    const pendingActionCount = inboxItems.length;

    const handleOpenInboxItem = async (item: RecentFinancingSelectionRecord) => {
        setOpeningInboxSimulationId(item.simulationId);
        try {
            const patient = item.patient as ContractPatient;
            setSelectedPatient(patient);
            setSearchQuery(`${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*/, '').trim());
            setPatients([]);

            const presetResult = await getFinancingSimulationPresetAction(item.patientId, item.simulationId);
            if (!presetResult.success || !presetResult.preset) {
                setActivePreset(null);
                setActiveFlow('simulador');
                toast.error(presetResult.error || 'No se pudo abrir la seleccion reciente.');
                return;
            }

            setActivePreset(presetResult.preset);
            setActiveFlow('contractmaker');
            toast.success('Seleccion reciente abierta en ContractMaker.');
        } finally {
            setOpeningInboxSimulationId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-card rounded-2xl p-5" style={{ background: 'hsla(230, 15%, 12%, 0.6)' }}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold" style={{ color: 'hsl(210 20% 90%)' }}>
                                ContratoMaker financiero
                            </h3>
                            <span
                                className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                    borderColor: 'hsla(195, 95%, 68%, 0.35)',
                                    background: 'hsla(200, 100%, 55%, 0.14)',
                                    color: 'hsl(195, 95%, 68%)',
                                }}
                            >
                                Acciones pendientes: {pendingActionCount}
                            </span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'hsl(230 10% 45%)' }}>
                            Selecciona paciente, comparte simulaciones y luego genera contrato legal en carpeta de Drive.
                        </p>
                    </div>

                    {selectedPatient && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPatient(null);
                                setActivePreset(null);
                                setActiveFlow('simulador');
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
                                            setActivePreset(null);
                                            setActiveFlow('simulador');
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

                <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-100">
                            <BellDot size={14} /> Inbox de acciones (ultimas 24h)
                        </p>
                        <div className="flex items-center gap-2">
                            <span
                                className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                    borderColor: 'hsla(195, 95%, 68%, 0.35)',
                                    background: 'hsla(200, 100%, 55%, 0.14)',
                                    color: 'hsl(195, 95%, 68%)',
                                }}
                            >
                                {pendingActionCount}
                            </span>
                            {loadingInbox && <Loader2 size={12} className="animate-spin" style={{ color: 'hsl(195 95% 68%)' }} />}
                        </div>
                    </div>

                    {inboxItems.length === 0 ? (
                        <p className="text-xs" style={{ color: 'hsl(230 10% 50%)' }}>
                            Sin nuevas elecciones pendientes de contrato.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {inboxItems.map((item) => {
                                const fullName = `${item.patient.apellido || ''}, ${item.patient.nombre || ''}`.replace(/^,\s*/, '').trim();
                                const isCurrent = selectedPatient?.id_paciente === item.patientId;

                                return (
                                    <div
                                        key={item.simulationId}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
                                        style={isCurrent
                                            ? {
                                                borderColor: 'hsla(165, 100%, 42%, 0.35)',
                                                background: 'hsla(165, 100%, 42%, 0.08)',
                                            }
                                            : {
                                                borderColor: 'hsla(230, 15%, 25%, 0.8)',
                                                background: 'hsla(230, 15%, 10%, 0.5)',
                                            }}
                                    >
                                        <div>
                                            <p className="text-xs font-medium" style={{ color: 'hsl(210 20% 88%)' }}>
                                                {fullName || 'Paciente'} · {item.treatment}
                                            </p>
                                            <p className="text-[11px]" style={{ color: 'hsl(230 10% 48%)' }}>
                                                Eligio plan: {formatInboxDate(item.selectedAt)}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleOpenInboxItem(item)}
                                            disabled={openingInboxSimulationId === item.simulationId}
                                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition"
                                            style={{
                                                borderColor: 'hsla(165, 100%, 42%, 0.35)',
                                                background: 'hsla(165, 100%, 42%, 0.16)',
                                                color: 'hsl(165, 85%, 50%)',
                                            }}
                                        >
                                            {openingInboxSimulationId === item.simulationId ? <Loader2 size={11} className="animate-spin" /> : null}
                                            Abrir contrato
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

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

            {selectedPatient && (
                <div className="glass-card rounded-2xl p-2" style={{ background: 'hsla(230, 15%, 12%, 0.4)' }}>
                    <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                        {[
                            { id: 1, label: '1. Paciente' },
                            { id: 2, label: '2. Simulacion' },
                            { id: 3, label: '3. Contrato' },
                        ].map((step) => {
                            const isDone = wizardStep > step.id;
                            const isCurrent = wizardStep === step.id;

                            return (
                                <div
                                    key={step.id}
                                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                                    style={isCurrent
                                        ? {
                                            background: 'hsla(200, 100%, 55%, 0.14)',
                                            color: 'hsl(195, 95%, 68%)',
                                            border: '1px solid hsla(200, 100%, 55%, 0.24)',
                                        }
                                        : isDone
                                            ? {
                                                background: 'hsla(165, 100%, 42%, 0.12)',
                                                color: 'hsl(165, 85%, 50%)',
                                                border: '1px solid hsla(165, 100%, 42%, 0.22)',
                                            }
                                            : {
                                                background: 'hsla(230, 15%, 10%, 0.8)',
                                                color: 'hsl(230 10% 50%)',
                                                border: '1px solid hsla(230, 15%, 22%, 0.7)',
                                            }}
                                >
                                    {step.label}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveFlow('simulador')}
                            className="rounded-lg px-3 py-2 text-xs font-semibold transition-all"
                            style={activeFlow === 'simulador'
                                ? {
                                    background: 'hsla(200, 100%, 55%, 0.14)',
                                    color: 'hsl(195, 95%, 68%)',
                                    border: '1px solid hsla(200, 100%, 55%, 0.24)',
                                }
                                : {
                                    background: 'hsla(230, 15%, 10%, 0.8)',
                                    color: 'hsl(230 10% 50%)',
                                    border: '1px solid hsla(230, 15%, 22%, 0.7)',
                                }}
                        >
                            Simulador compartible
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveFlow('contractmaker')}
                            disabled={!activePreset}
                            className="rounded-lg px-3 py-2 text-xs font-semibold transition-all"
                            style={activeFlow === 'contractmaker'
                                ? {
                                    background: 'hsla(165, 100%, 42%, 0.12)',
                                    color: 'hsl(165, 85%, 50%)',
                                    border: '1px solid hsla(165, 100%, 42%, 0.22)',
                                }
                                : {
                                    background: 'hsla(230, 15%, 10%, 0.8)',
                                    color: 'hsl(230 10% 50%)',
                                    border: '1px solid hsla(230, 15%, 22%, 0.7)',
                                }}
                        >
                            {activePreset ? 'ContractMaker' : 'ContractMaker (esperando eleccion)'}
                        </button>
                        {activePreset && (
                            <button
                                type="button"
                                onClick={() => setActivePreset(null)}
                                className="rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{
                                    background: 'hsla(35, 95%, 55%, 0.1)',
                                    color: 'hsl(35 95% 62%)',
                                    border: '1px solid hsla(35, 95%, 55%, 0.25)',
                                }}
                            >
                                Limpiar simulacion precargada
                            </button>
                        )}
                    </div>
                </div>
            )}

            {selectedPatient ? (
                activeFlow === 'simulador' ? (
                    <SimuladorFinanciacion
                        patient={selectedPatient as Paciente}
                        onUseInContract={(preset) => {
                            setActivePreset(preset);
                            setActiveFlow('contractmaker');
                        }}
                    />
                ) : (
                    <CalculadoraFinanciera
                        patient={selectedPatient as Paciente}
                        initialPreset={activePreset}
                        singleCtaMode
                    />
                )
            ) : (
                <div className="rounded-2xl p-10 text-center" style={{ background: 'hsla(230, 15%, 12%, 0.45)', border: '1px dashed hsla(230, 15%, 24%, 0.9)' }}>
                    <p className="text-sm font-medium" style={{ color: 'hsl(230 10% 50%)' }}>
                        Selecciona un paciente para iniciar la simulacion y generar contrato.
                    </p>
                </div>
            )}
        </div>
    );
}
