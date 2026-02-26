'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Paciente } from '@/lib/patients';
import CalculadoraFinanciera from '@/components/patients/CalculadoraFinanciera';

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

    return (
        <div className="space-y-6">
            <div className="glass-card rounded-2xl p-5" style={{ background: 'hsla(230, 15%, 12%, 0.6)' }}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold" style={{ color: 'hsl(210 20% 90%)' }}>
                            ContratoMaker financiero
                        </h3>
                        <p className="text-xs mt-1" style={{ color: 'hsl(230 10% 45%)' }}>
                            Selecciona paciente, calcula opciones y genera contrato legal en carpeta de Drive.
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
                <CalculadoraFinanciera patient={selectedPatient as Paciente} />
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
