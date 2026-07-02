'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Plus,
    Search,
    RefreshCw,
    Loader2,
    Copy,
    Check,
    ChevronDown,
    ClipboardList,
    UserCheck,
    LayoutGrid,
    List,
} from 'lucide-react';
import Link from 'next/link';
import PatientList from '@/components/patients/PatientList';
import PatientGrid from '@/components/patients/PatientGrid';
import PaginationBar from '@/components/patients/PaginationBar';
import { listPatientsAction, getPatientsCountAction } from '@/app/actions/patients';
import { type Paciente } from '@/lib/patients';
import CategoriaGuard from '@/components/auth/CategoriaGuard';
import { useAuth } from '@/contexts/AuthContext';
import { canManagePatients, canViewPatientContactData } from '@/lib/patient-access';

const PAGE_SIZE = 48;

export default function PatientsPage() {
    const { canEdit, categoria } = useAuth();
    const [patients, setPatients] = useState<Paciente[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [estadoFilter, setEstadoFilter] = useState('');
    const [onlyWithPhotosFilter, setOnlyWithPhotosFilter] = useState(true);
    const [page, setPage] = useState(1);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Restore view preference
    useEffect(() => {
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('patients_view_mode') : null;
        if (saved === 'list' || saved === 'grid') setViewMode(saved);
    }, []);

    function changeView(next: 'grid' | 'list') {
        setViewMode(next);
        if (typeof window !== 'undefined') window.localStorage.setItem('patients_view_mode', next);
    }

    // Close dropdown on outside click
    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const handleCopyLink = async (key: 'admision' | 'datos') => {
        const path = key === 'admision' ? '/admision' : '/actualizar-datos';
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        setCopiedKey(key);
        setDropdownOpen(false);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const loadPatients = useCallback(async (targetPage: number) => {
        setLoading(true);
        try {
            const filters = {
                search: searchTerm || undefined,
                estado: estadoFilter || undefined,
                onlyWithPhotos: onlyWithPhotosFilter,
            };

            const [res, countRes] = await Promise.all([
                listPatientsAction({
                    ...filters,
                    limit: PAGE_SIZE,
                    offset: (targetPage - 1) * PAGE_SIZE,
                }),
                getPatientsCountAction(filters),
            ]);

            if (res.success && res.data) {
                setPatients(res.data);
            }
            if (countRes.success) {
                setTotalCount(countRes.count ?? 0);
            }
        } catch (error) {
            console.error('Error loading patients:', error);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, estadoFilter, onlyWithPhotosFilter]);

    // Reload when filters change (search is applied on Enter/button via handleSearch)
    useEffect(() => {
        setPage(1);
        loadPatients(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estadoFilter, onlyWithPhotosFilter]);

    function handleSearch() {
        setPage(1);
        loadPatients(1);
    }

    function handlePageChange(nextPage: number) {
        setPage(nextPage);
        loadPatients(nextPage);
    }

    return (
        <CategoriaGuard allowedCategorias={['reception', 'admin', 'recaptacion', 'asistente', 'dr', 'developer', 'partner_viewer', 'laboratorio', 'odontologo', 'dentist']}>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 relative z-30">
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
                            {/* Copy dropdown */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setDropdownOpen(v => !v)}
                                    className={`flex items-center gap-2 px-4 py-2.5 border transition-all rounded-lg font-medium ${copiedKey
                                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    {copiedKey ? <Check size={18} /> : <Copy size={18} />}
                                    {copiedKey ? '¡Copiado!' : 'Copiar Link'}
                                    {!copiedKey && <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />}
                                </button>

                                {dropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-sm shadow-xl z-30 overflow-hidden">
                                        <button
                                            onClick={() => handleCopyLink('admision')}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                                        >
                                            <ClipboardList size={16} className="text-emerald-400 flex-shrink-0" />
                                            <div>
                                                <p className="font-medium">Formulario de admisión</p>
                                                <p className="text-xs text-slate-500">Para nuevos pacientes</p>
                                            </div>
                                        </button>
                                        <div className="h-px bg-white/5" />
                                        <button
                                            onClick={() => handleCopyLink('datos')}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                                        >
                                            <UserCheck size={16} className="text-amber-400 flex-shrink-0" />
                                            <div>
                                                <p className="font-medium">Actualización de datos</p>
                                                <p className="text-xs text-slate-500">Para pacientes existentes</p>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>

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
                            <div className="inline-flex items-center rounded-lg border border-white/10 bg-navy-900/50 p-0.5">
                                <button
                                    onClick={() => changeView('grid')}
                                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${viewMode === 'grid'
                                        ? 'bg-white/10 text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    title="Vista rostros"
                                >
                                    <LayoutGrid size={16} />
                                    <span className="hidden sm:inline">Rostros</span>
                                </button>
                                <button
                                    onClick={() => changeView('list')}
                                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${viewMode === 'list'
                                        ? 'bg-white/10 text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    title="Vista lista"
                                >
                                    <List size={16} />
                                    <span className="hidden sm:inline">Lista</span>
                                </button>
                            </div>
                            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-navy-900/50 text-slate-300 text-sm cursor-pointer hover:bg-white/5 transition-colors select-none">
                                <input
                                    type="checkbox"
                                    checked={onlyWithPhotosFilter}
                                    onChange={(e) => setOnlyWithPhotosFilter(e.target.checked)}
                                    className="rounded border-white/20 bg-transparent text-teal-500 focus:ring-teal-500 focus:ring-offset-navy-900 h-4 w-4"
                                />
                                <span className="hidden sm:inline">Sólo con fotos</span>
                            </label>
                            <select
                                value={estadoFilter}
                                onChange={(e) => setEstadoFilter(e.target.value)}
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
                                onClick={() => loadPatients(page)}
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
                    <div className="space-y-4">
                        {viewMode === 'grid' ? (
                            <PatientGrid patients={patients} onRefresh={() => loadPatients(page)} />
                        ) : (
                            <PatientList
                                patients={patients}
                                onRefresh={() => loadPatients(page)}
                                canShowContactActions={canViewPatientContactData(categoria)}
                                canDeletePatients={canManagePatients(categoria)}
                            />
                        )}
                        <PaginationBar
                            page={page}
                            pageSize={PAGE_SIZE}
                            totalCount={totalCount}
                            onPageChange={handlePageChange}
                        />
                    </div>
                )}
            </div>
        </CategoriaGuard>
    );
}
