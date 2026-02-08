'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    ExternalLink,
    Search,
    RefreshCw,
    Loader2
} from 'lucide-react';
import PatientList from '@/components/patients/PatientList';
import NuevoPacienteForm from '@/components/patients/NuevoPacienteForm';
import { getPacientes, Paciente } from '@/lib/patients';
import RoleGuard from '@/components/auth/RoleGuard';
import { useAuth } from '@/contexts/AuthContext';

const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSexSoCAmFdYp1k8WOIZoMAXVVSnGvI70rjr2_u3hA2LoUuKAw/viewform';

export default function PatientsPage() {
    const { canEdit } = useAuth();
    const [patients, setPatients] = useState<Paciente[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNuevoPaciente, setShowNuevoPaciente] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [estadoFilter, setEstadoFilter] = useState('');
    const [syncing, setSyncing] = useState(false);

    const loadPatients = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPacientes({
                search: searchTerm || undefined,
                estado: estadoFilter || undefined,
                limit: 1000,
            });
            setPatients(data);
        } catch (error) {
            console.error('Error loading patients:', error);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, estadoFilter]);

    const handleSyncSheets = useCallback(async (silent = false) => {
        setSyncing(true);
        try {
            const res = await fetch('/api/sync-pacientes-sheets');
            const data = await res.json();
            if (data.success || data.stats) {
                if (!silent) {
                    const message = `Sincronización finalizada:\n- Nuevos: ${data.stats.newlyImported}\n- Duplicados saltados: ${data.stats.skippedDuplicates}\n- Errores: ${data.stats.errors}`;
                    alert(message);
                }
                loadPatients();
            } else if (!silent) {
                alert(`Error en sincronización: ${data.error || 'Error desconocido'}`);
            }
        } catch (error) {
            console.error('Error syncing:', error);
            if (!silent) alert('Error de conexión al sincronizar con Google Sheets');
        } finally {
            setSyncing(false);
        }
    }, [loadPatients]);

    // Initial load only on mount
    useEffect(() => {
        loadPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Intentionally only on mount

    // Trigger silent sync only once on first mount
    useEffect(() => {
        handleSyncSheets(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Intentionally only on mount

    // Reload when filters change (debounced manually by user pressing Enter or button)
    function handleSearch() {
        loadPatients();
    }

    return (
        <RoleGuard allowedRoles={['reception', 'admin']}>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Pacientes
                        </h1>
                        <p className="text-gray-500 mt-1">
                            {patients.length} pacientes registrados
                        </p>
                    </div>

                    {/* Registration Buttons - Protected */}
                    {canEdit('pacientes') && (
                        <div className="flex items-center gap-3">
                            <a
                                href={GOOGLE_FORM_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300 font-medium transition-colors"
                            >
                                <ExternalLink size={18} />
                                Formulario Online
                            </a>
                            <button
                                onClick={() => handleSyncSheets(false)}
                                disabled={syncing}
                                className="flex items-center gap-2 px-4 py-2.5 border border-green-200 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/20 rounded-lg font-medium transition-colors disabled:opacity-50"
                                title="Sincronizar directamente con las respuestas de Google Form"
                            >
                                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                                {syncing ? 'Sincronizando...' : 'Sincronizar Google Form'}
                            </button>
                            <button
                                onClick={() => setShowNuevoPaciente(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <Plus size={20} />
                                Agregar Manualmente
                            </button>
                        </div>
                    )}
                </div>

                {/* Search and Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                placeholder="Buscar por nombre, apellido, email, teléfono o documento..."
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={estadoFilter}
                                onChange={(e) => {
                                    setEstadoFilter(e.target.value);
                                    setTimeout(loadPatients, 100);
                                }}
                                className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                            >
                                <option value="">Todos los estados</option>
                                <option value="Activo">Activo</option>
                                <option value="En tratamiento">En tratamiento</option>
                                <option value="Alta">Alta</option>
                                <option value="Inactivo">Inactivo</option>
                            </select>
                            <button
                                onClick={handleSearch}
                                className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300"
                            >
                                <Search size={18} />
                            </button>
                            <button
                                onClick={loadPatients}
                                className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300"
                            >
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Patient List */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-gray-400" size={32} />
                    </div>
                ) : (
                    <PatientList patients={patients} onRefresh={loadPatients} />
                )}

                {/* Nuevo Paciente Modal */}
                <NuevoPacienteForm
                    isOpen={showNuevoPaciente}
                    onClose={() => setShowNuevoPaciente(false)}
                    onSuccess={loadPatients}
                />
            </div>
        </RoleGuard>
    );
}
