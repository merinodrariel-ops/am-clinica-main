'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Search,
    RefreshCw,
    Loader2,
    Copy,
    Check
} from 'lucide-react';
import Link from 'next/link';
import PatientList from '@/components/patients/PatientList';
import { listPatientsAction, getPatientsCountAction } from '@/app/actions/patients';
import { type Paciente } from '@/lib/patients';
import CategoriaGuard from '@/components/auth/CategoriaGuard';
import { useAuth } from '@/contexts/AuthContext';

export default function PatientsPage() {
    const { canEdit } = useAuth();
    const [patients, setPatients] = useState<Paciente[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [estadoFilter, setEstadoFilter] = useState('');
    const [copied, setCopied] = useState(false);

    const handleCopyAdmissionLink = async () => {
        try {
            // Point to the internal admission route
            const admissionUrl = `${window.location.origin}/admision`;
            await navigator.clipboard.writeText(admissionUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy admission link:', err);
        }
    };

    const loadPatients = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listPatientsAction({
                search: searchTerm || undefined,
                estado: estadoFilter || undefined,
                limit: 1000,
            });

            if (res.success && res.data) {
                setPatients(res.data);
            }

            // Get accurate count
            const countRes = await getPatientsCountAction({
                search: searchTerm || undefined,
                estado: estadoFilter || undefined,
            });

            if (countRes.success) {
                setTotalCount(countRes.count);
            }
        } catch (error) {
            console.error('Error loading patients:', error);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, estadoFilter]);

    // Initial load only on mount
    useEffect(() => {
        loadPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Intentionally only on mount

    // Reload when filters change (debounced manually by user pressing Enter or button)
    function handleSearch() {
        loadPatients();
    }

    return (
        <CategoriaGuard allowedCategorias={['reception', 'admin', 'recaptacion']}>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 relative z-10">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">
                            Pacientes
                        </h1>
                        <p className="text-slate-400 mt-1">
                            {totalCount} pacientes registrados
                        </p>
                    </div>

                    {/* Registration Buttons - Protected */}
                    {canEdit('pacientes') && (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCopyAdmissionLink}
                                className={`flex items-center gap-2 px-4 py-2.5 border transition-all rounded-lg font-medium ${copied
                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                                    }`}
                                title="Copiar link del formulario de admisión para pacientes"
                            >
                                {copied ? <Check size={18} /> : <Copy size={18} />}
                                {copied ? '¡Copiado!' : 'Copiar Formulario'}
                            </button>
                            <Link
                                href="/admision"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-white rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:opacity-90 border-none"
                            >
                                <Plus size={20} />
                                Agregar Paciente
                            </Link>
                        </div>
                    )}
                </div>

                {/* Search and Filters */}
                <div className="glass-card rounded-xl p-4 mb-6 relative overflow-visible z-20">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/10 bg-navy-900/50 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500/50 transition-colors backdrop-blur-sm"
                                placeholder="Buscar por nombre, apellido, email, WhatsApp o documento..."
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={estadoFilter}
                                onChange={(e) => {
                                    setEstadoFilter(e.target.value);
                                    setTimeout(loadPatients, 100);
                                }}
                                className="px-4 py-2.5 rounded-lg border border-white/10 bg-navy-900/50 text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500/50 transition-colors backdrop-blur-sm [&>option]:bg-navy-900"
                            >
                                <option value="">Todos los estados</option>
                                <option value="Activo">Activo</option>
                                <option value="En tratamiento">En tratamiento</option>
                                <option value="Alta">Alta</option>
                                <option value="Inactivo">Inactivo</option>
                            </select>
                            <button
                                onClick={handleSearch}
                                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors border border-white/5"
                            >
                                <Search size={18} />
                            </button>
                            <button
                                onClick={loadPatients}
                                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors border border-white/5"
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
            </div>
        </CategoriaGuard>
    );
}
