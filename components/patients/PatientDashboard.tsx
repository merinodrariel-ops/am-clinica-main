'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
    FileText,
    Bell,
    CreditCard,
    ArrowLeft,
    Calendar,
    Phone,
    DollarSign,
    User,
    Mail,
    MapPin,
    MessageCircle,
    Edit2,
    Save,
    Plus,
    FileIcon,
    ExternalLink,
    TrendingUp,
    Check,
    Sparkles,
    Send,
    Loader2,
    FolderOpen,
} from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import PatientPortalPanel from './PatientPortalPanel';
import dynamic from 'next/dynamic';
const SmileDesign = dynamic(() => import('@/components/smile-studio/SmileDesign'), { ssr: false });
const PatientDriveTab = dynamic(() => import('@/components/patients/drive/PatientDriveTab'), { ssr: false });
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { createClient } from '@/utils/supabase/client';
import { Paciente, HistoriaClinica, PlanTratamiento, calculateAge, formatWhatsAppLink, formatMailtoLink } from '@/lib/patients';
import { PrestacionConProfesional } from '@/app/actions/prestaciones';
import PatientCommandCenter from './PatientCommandCenter';
import PatientCadence from '@/components/recalls/PatientCadence';
import PatientPaymentHistory from '@/components/caja/PatientPaymentHistory';

interface Movement {
    id: string;
    fecha_hora: string;
    fecha_movimiento?: string | null;
    concepto_nombre: string;
    monto: number;
    moneda: string;
    metodo_pago: string | null;
    estado: string;
    usd_equivalente: number | null;
    observaciones?: string | null;
    cuota_nro?: number | null;
    cuotas_total?: number | null;
    comprobante_url?: string | null;
}

interface FinanceSheetSnapshot {
    cuotasAbonadas: number | null;
    saldoFaltante: number | null;
    totalPlan: number | null;
    cuotasTotal: number | null;
    matchedBy: 'dni' | 'nombre';
    fetchedAt: string;
}

interface AppointmentSignal {
    id: string;
    patient_id?: string;
    doctor_id?: string;
    start_time: string;
    status?: string;
    type?: string;
}

interface PatientDashboardProps {
    patient: Paciente;
    historiaClinica: HistoriaClinica[];
    planes: PlanTratamiento[];
    payments: Movement[];
    appointments: AppointmentSignal[];
    prestaciones?: PrestacionConProfesional[];
}

const TABS = [
    { id: 'datos', label: 'Datos Personales', icon: User },
    { id: 'historia', label: 'Historia Clínica', icon: FileText },
    { id: 'finanzas', label: 'Finanzas', icon: TrendingUp },
    { id: 'recalls', label: 'Recalls (Seguimiento)', icon: Bell },
    { id: 'archivos', label: 'Archivos', icon: FolderOpen },
    { id: 'smile_design', label: 'Smile Design ✨', icon: Sparkles },
    { id: 'portal', label: 'Portal 360', icon: Sparkles },
];

// Payment-related tabs hidden from restricted clinical/ops roles
const PAYMENT_TABS = new Set(['finanzas']);

export default function PatientDashboard({ patient, historiaClinica, planes, payments, appointments, prestaciones = [] }: PatientDashboardProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { categoria: role } = useAuth();
    const isOdontologo = role === 'odontologo';
    const isRecaptacion = role === 'recaptacion';
    const hidePaymentTabs = isOdontologo || isRecaptacion;
    const visibleTabs = hidePaymentTabs ? TABS.filter(t => !PAYMENT_TABS.has(t.id)) : TABS;
    const requestedTab = searchParams.get('tab') || 'datos';
    const defaultTabRaw = ['financiamiento', 'pagos', 'planes'].includes(requestedTab)
        ? 'finanzas'
        : requestedTab;
    const tabIds = new Set(TABS.map((tab) => tab.id));
    const defaultTab = tabIds.has(defaultTabRaw) ? defaultTabRaw : 'datos';
    const [activeTab, setActiveTab] = useState(
        hidePaymentTabs && PAYMENT_TABS.has(defaultTab) ? 'datos' : defaultTab
    );
    // Portal magic link state
    const [sendingPortalLink, setSendingPortalLink] = useState(false);
    const [portalLinkSent, setPortalLinkSent] = useState(false);

    async function handleSendPortalLink() {
        if (!patient.email || sendingPortalLink) return;
        setSendingPortalLink(true);
        try {
            const res = await fetch('/api/patient-portal/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: patient.email }),
            });
            if (res.ok) {
                setPortalLinkSent(true);
                setTimeout(() => setPortalLinkSent(false), 4000);
            }
        } finally {
            setSendingPortalLink(false);
        }
    }

    // Financing State
    const [finData, setFinData] = useState({
        estado: patient.financ_estado || 'inactivo',
        monto: patient.financ_monto_total || 0,
        cuotas: patient.financ_cuotas_total || 0
    });
    const [savingFin, setSavingFin] = useState(false);
    const [isEditingFin, setIsEditingFin] = useState(false);
    const [sheetFinance, setSheetFinance] = useState<FinanceSheetSnapshot | null>(null);
    const [sheetFinanceLoading, setSheetFinanceLoading] = useState(false);
    const [sheetFinanceError, setSheetFinanceError] = useState<string | null>(null);

    async function fetchFinanceFromSheet() {
        setSheetFinanceLoading(true);
        setSheetFinanceError(null);
        try {
            const response = await fetch(`/api/patients/${patient.id_paciente}/finance-sheet`, {
                method: 'GET',
                cache: 'no-store',
            });

            const json = await response.json();
            if (!response.ok) {
                throw new Error(json?.error || 'No se pudo actualizar Finanzas desde Google Sheets.');
            }

            setSheetFinance({
                cuotasAbonadas: typeof json.cuotasAbonadas === 'number' ? json.cuotasAbonadas : null,
                saldoFaltante: typeof json.saldoFaltante === 'number' ? json.saldoFaltante : null,
                totalPlan: typeof json.totalPlan === 'number' ? json.totalPlan : null,
                cuotasTotal: typeof json.cuotasTotal === 'number' ? json.cuotasTotal : null,
                matchedBy: json.matchedBy === 'dni' ? 'dni' : 'nombre',
                fetchedAt: json.fetchedAt || new Date().toISOString(),
            });
        } catch (error) {
            setSheetFinance(null);
            setSheetFinanceError(error instanceof Error ? error.message : 'No se pudo consultar la hoja de Finanzas.');
        } finally {
            setSheetFinanceLoading(false);
        }
    }

    useEffect(() => {
        if (activeTab === 'finanzas') {
            void fetchFinanceFromSheet();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, patient.id_paciente]);

    const totalPagadoFinanc = payments
        .filter(p => p.estado !== 'Anulado' && (p.cuota_nro && p.cuota_nro > 0))
        .reduce((sum, p) => sum + (p.usd_equivalente || 0), 0);

    const cuotasPagadasByPayments = payments.filter(p => (p.cuota_nro || 0) > 0 && p.estado !== 'Anulado').length;
    const cuotasPagadasDisplay = sheetFinance?.cuotasAbonadas ?? cuotasPagadasByPayments;
    const totalCuotasDisplay = sheetFinance?.cuotasTotal ?? finData.cuotas;
    const totalPlanDisplay = sheetFinance?.totalPlan ?? finData.monto;
    const saldoFinanc = sheetFinance?.saldoFaltante ?? Math.max(0, totalPlanDisplay - totalPagadoFinanc);

    async function handleSaveFinancing() {
        setSavingFin(true);
        try {
            const { error } = await createClient()
                .from('pacientes')
                .update({
                    financ_estado: finData.estado,
                    financ_monto_total: finData.monto,
                    financ_cuotas_total: finData.cuotas
                })
                .eq('id_paciente', patient.id_paciente);

            if (error) throw error;
            setIsEditingFin(false);
            router.refresh();
        } catch (err) {
            console.error('Error updating financing:', err);
            alert('Error al guardar configuración de financiación');
        } finally {
            setSavingFin(false);
        }
    }

    const age = calculateAge(patient.fecha_nacimiento);
    const whatsappNumber = patient.whatsapp_numero
        ? `${patient.whatsapp_pais_code || '+54'}${patient.whatsapp_numero.replace(/\D/g, '')}`
        : patient.whatsapp;

    // Calculate payment totals
    const totalPagadoUSD = payments
        .filter(p => p.estado !== 'Anulado')
        .reduce((sum, p) => sum + (p.usd_equivalente || 0), 0);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100">
            {/* Header */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/patients"
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </Link>
                        <div className="flex-1">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {patient.apellido}, {patient.nombre}
                            </h1>
                            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                    patient.estado_paciente === 'Activo' ? 'bg-green-100 text-green-700' :
                                        patient.estado_paciente === 'En tratamiento' ? 'bg-blue-100 text-blue-700' :
                                            patient.estado_paciente === 'Alta' ? 'bg-purple-100 text-purple-700' :
                                                'bg-gray-100 text-gray-700'
                                )}>
                                    {patient.estado_paciente || 'Sin estado'}
                                </span>
                                {age && <span>{age} años</span>}
                                {patient.documento && <span>DNI: {patient.documento}</span>}
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2">
                            {whatsappNumber && (
                                <a
                                    href={formatWhatsAppLink(whatsappNumber)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
                                    title="WhatsApp"
                                >
                                    <MessageCircle size={20} />
                                </a>
                            )}
                            {patient.email && (
                                <a
                                    href={formatMailtoLink(patient.email)}
                                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                                    title="Email"
                                >
                                    <Mail size={20} />
                                </a>
                            )}
                            {patient.email && (
                                <button
                                    onClick={handleSendPortalLink}
                                    disabled={sendingPortalLink || portalLinkSent}
                                    title="Enviar acceso al portal al paciente"
                                    className={clsx(
                                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                        portalLinkSent
                                            ? "bg-emerald-500 text-white"
                                            : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                                    )}
                                >
                                    {sendingPortalLink ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : portalLinkSent ? (
                                        <Check size={16} />
                                    ) : (
                                        <Send size={16} />
                                    )}
                                    <span className="hidden sm:inline">
                                        {portalLinkSent ? '¡Enviado!' : 'Portal'}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex mt-4 -mb-px">
                        {visibleTabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={clsx(
                                        "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                                        isActive
                                            ? "border-blue-500 text-blue-600"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    )}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-5xl mx-auto p-6">
                <PatientCommandCenter
                    patient={patient}
                    payments={payments}
                    appointments={appointments.map(appointment => ({
                        start_time: appointment.start_time,
                        status: appointment.status,
                    }))}
                />
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                    >
                        {/* Tab 1: Datos Personales */}
                        {activeTab === 'datos' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-lg font-semibold">Datos Personales</h2>
                                    <Link
                                        href={`/actualizar-datos?patientId=${patient.id_paciente}`}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200"
                                    >
                                        <Edit2 size={16} />
                                        Editar
                                    </Link>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InfoCard
                                        icon={<User size={18} />}
                                        label="Nombre Completo"
                                        value={`${patient.nombre} ${patient.apellido}`}
                                    />
                                    <InfoCard
                                        icon={<FileIcon size={18} />}
                                        label="Documento"
                                        value={patient.documento || 'No registrado'}
                                    />
                                    <InfoCard
                                        icon={<Calendar size={18} />}
                                        label="Fecha de Nacimiento"
                                        value={patient.fecha_nacimiento ? new Date(patient.fecha_nacimiento).toLocaleDateString('es-AR') : 'No registrada'}
                                    />
                                    <InfoCard
                                        icon={<Calendar size={18} />}
                                        label="Edad"
                                        value={age ? `${age} años` : 'No calculable'}
                                    />
                                    <InfoCard
                                        icon={<Phone size={18} />}
                                        label="WhatsApp"
                                        value={whatsappNumber || 'No registrado'}
                                    />
                                    <InfoCard
                                        icon={<Mail size={18} />}
                                        label="Email"
                                        value={patient.email || 'No registrado'}
                                    />
                                    <InfoCard
                                        icon={<MapPin size={18} />}
                                        label="Ciudad"
                                        value={patient.ciudad || 'No registrada'}
                                    />
                                    <InfoCard
                                        icon={<MapPin size={18} />}
                                        label="Zona/Barrio"
                                        value={patient.zona_barrio || 'No registrado'}
                                    />
                                </div>

                                {patient.observaciones_generales && (
                                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <label className="text-xs text-gray-500 uppercase tracking-wider">Observaciones</label>
                                        <p className="mt-1 text-gray-900 dark:text-gray-100">{patient.observaciones_generales}</p>
                                    </div>
                                )}

                                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Fecha Alta:</span>
                                        <p className="font-medium">{patient.fecha_alta ? new Date(patient.fecha_alta).toLocaleDateString('es-AR') : '-'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Origen:</span>
                                        <p className="font-medium">{patient.origen_registro || '-'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Consentimiento:</span>
                                        <p className="font-medium">{patient.consentimiento_comunicacion ? '✓ Sí' : '✗ No'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">ID:</span>
                                        <p className="font-mono text-xs">{patient.id_paciente.slice(0, 8)}...</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Historia Clínica */}
                        {activeTab === 'historia' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                    <h2 className="text-lg font-semibold">Historia Clínica</h2>
                                    <Link
                                        href={`/worker-portal?patientId=${patient.id_paciente}`}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
                                    >
                                        <Plus size={16} />
                                        Nueva Entrada
                                    </Link>
                                </div>

                                {historiaClinica.length === 0 ? (
                                    <div className="p-10 text-center text-gray-500">
                                        <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                                        <p>No hay registros en la historia clínica.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {historiaClinica.map((entry) => (
                                            <div key={entry.id} className="p-6">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="font-medium">{entry.profesional}</p>
                                                        <p className="text-sm text-gray-500">
                                                            {new Date(entry.fecha).toLocaleDateString('es-AR', {
                                                                day: 'numeric',
                                                                month: 'long',
                                                                year: 'numeric'
                                                            })}
                                                        </p>
                                                    </div>
                                                    {entry.proximo_control && (
                                                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
                                                            Próx: {new Date(entry.proximo_control).toLocaleDateString('es-AR')}
                                                        </span>
                                                    )}
                                                </div>
                                                {entry.motivo_consulta && (
                                                    <div className="mb-2">
                                                        <span className="text-xs text-gray-500">Motivo:</span>
                                                        <p className="text-sm">{entry.motivo_consulta}</p>
                                                    </div>
                                                )}
                                                {entry.diagnostico && (
                                                    <div className="mb-2">
                                                        <span className="text-xs text-gray-500">Diagnóstico:</span>
                                                        <p className="text-sm">{entry.diagnostico}</p>
                                                    </div>
                                                )}
                                                {entry.tratamiento_realizado && (
                                                    <div>
                                                        <span className="text-xs text-gray-500">Tratamiento:</span>
                                                        <p className="text-sm">{entry.tratamiento_realizado}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Prestaciones Realizadas — HC desde la app */}
                        {activeTab === 'historia' && prestaciones.length > 0 && (
                            <div className="mt-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-semibold">Prestaciones Realizadas</h2>
                                        <p className="text-xs text-gray-400 mt-0.5">{prestaciones.length} registros · cargados desde el portal</p>
                                    </div>
                                    <div className="flex gap-3 text-xs font-medium">
                                        <span className="text-blue-600 dark:text-blue-400">
                                            ARS {prestaciones.filter(p => p.moneda_cobro === 'ARS').reduce((s, p) => s + Number(p.monto_honorarios || 0), 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                                        </span>
                                        {prestaciones.some(p => p.moneda_cobro === 'USD') && (
                                            <span className="text-emerald-600 dark:text-emerald-400">
                                                USD {prestaciones.filter(p => p.moneda_cobro === 'USD').reduce((s, p) => s + Number(p.monto_honorarios || 0), 0).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                                    {prestaciones.map(p => {
                                        const profNombre = [p.profesional_nombre, p.profesional_apellido].filter(Boolean).join(' ') || '—';
                                        const fecha = new Date(p.fecha_realizacion + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
                                        const isUsd = p.moneda_cobro === 'USD';
                                        return (
                                            <div key={p.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{p.prestacion_nombre}</p>
                                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                        <span className="text-xs text-gray-400">{fecha}</span>
                                                        <span className="text-xs text-gray-400">·</span>
                                                        <span className="text-xs text-gray-500 font-medium">{profNombre}</span>
                                                        {p.notas && (
                                                            <>
                                                                <span className="text-xs text-gray-400">·</span>
                                                                <span className="text-xs text-gray-400 italic">{p.notas}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    <span className={`font-mono font-bold text-sm ${isUsd ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                                        {isUsd ? 'USD ' : '$'}{Number(p.monto_honorarios || 0).toLocaleString('es-AR')}
                                                    </span>
                                                    {p.slides_url ? (
                                                        <a
                                                            href={p.slides_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
                                                        >
                                                            <ExternalLink size={10} />
                                                            Slides
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                                                            Sin slides
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Tab: Finanzas (Historial + Plan + Presupuestos) */}
                        {activeTab === 'finanzas' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-lg font-semibold">Historial de Pagos</h2>
                                        <p className="text-sm text-gray-500">Solo lectura - Los pagos se registran desde Caja Recepción</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-500">Total Pagado</p>
                                        <p className="text-xl font-bold text-green-600">${totalPagadoUSD.toFixed(2)} USD</p>
                                    </div>
                                </div>

                                <div className="p-6">
                                    <PatientPaymentHistory payments={payments} variant="internal" />

                                    {payments.length === 0 && (
                                        <Link
                                            href="/caja-recepcion"
                                            className="inline-flex items-center gap-2 mt-4 text-blue-500 hover:underline"
                                        >
                                            <ExternalLink size={16} />
                                            Ir a Caja Recepción
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Sección: Planes de Tratamiento */}
                        {activeTab === 'finanzas' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                    <h2 className="text-lg font-semibold">Planes de Tratamiento</h2>
                                    <Link
                                        href={`/caja-recepcion?tab=contratos&patientId=${patient.id_paciente}`}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
                                    >
                                        <Plus size={16} />
                                        Nuevo Plan
                                    </Link>
                                </div>

                                {planes.length === 0 ? (
                                    <div className="p-10 text-center text-gray-500">
                                        <DollarSign size={48} className="mx-auto mb-4 text-gray-300" />
                                        <p>No hay planes de tratamiento registrados.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {planes.map((plan) => {
                                            const pagadoPlan = plan.total_usd - plan.saldo_usd;
                                            const progreso = plan.total_usd > 0 ? (pagadoPlan / plan.total_usd) * 100 : 0;

                                            return (
                                                <div key={plan.id} className="p-6">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <p className="font-medium">{plan.descripcion || 'Plan sin nombre'}</p>
                                                            <p className="text-sm text-gray-500">
                                                                {plan.profesional} • {new Date(plan.fecha_creacion).toLocaleDateString('es-AR')}
                                                            </p>
                                                        </div>
                                                        <span className={clsx(
                                                            "px-2 py-1 rounded-full text-xs font-medium",
                                                            plan.estado_plan === 'Aceptado' || plan.estado_plan === 'En curso' ? 'bg-green-100 text-green-700' :
                                                                plan.estado_plan === 'Finalizado' ? 'bg-purple-100 text-purple-700' :
                                                                    plan.estado_plan === 'Cancelado' ? 'bg-red-100 text-red-700' :
                                                                        'bg-gray-100 text-gray-700'
                                                        )}>
                                                            {plan.estado_plan}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                                                        <div>
                                                            <span className="text-gray-500">Total USD:</span>
                                                            <p className="font-bold">${plan.total_usd.toFixed(2)}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Seña:</span>
                                                            <p className="font-medium">${plan.senal_usd.toFixed(2)}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Saldo:</span>
                                                            <p className="font-medium">${plan.saldo_usd.toFixed(2)}</p>
                                                        </div>
                                                        {plan.financiado && (
                                                            <div>
                                                                <span className="text-gray-500">Cuota estimada:</span>
                                                                <p className="font-medium">${plan.cuota_estimada_usd.toFixed(2)}/mes</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Progress Bar */}
                                                    <div className="mt-4">
                                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                            <span>Progreso de pago</span>
                                                            <span>{Math.min(progreso, 100).toFixed(0)}%</span>
                                                        </div>
                                                        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-green-500 transition-all"
                                                                style={{ width: `${Math.min(progreso, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                        )}

                        {/* Sección: Financiación */}
                        {activeTab === 'finanzas' && (
                            <div className="space-y-6">
                                {/* Header / Config Card */}
                                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                Plan de Financiación
                                                {sheetFinance && (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">En curso</span>
                                                )}
                                                {finData.estado === 'activo' && (
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Activo</span>
                                                )}
                                                {finData.estado === 'finalizado' && (
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Completado</span>
                                                )}
                                                {finData.estado === 'inactivo' && (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-medium">Inactivo</span>
                                                )}
                                            </h2>
                                            <p className="text-gray-500 text-sm mt-1">Gestión de cuotas y saldos</p>
                                            {sheetFinance && (
                                                <p className="text-xs text-emerald-600 mt-1">
                                                    Actualizado · {new Date(sheetFinance.fetchedAt).toLocaleString('es-AR')}
                                                </p>
                                            )}
                                            {sheetFinanceError && (
                                                <p className="text-xs text-amber-600 mt-1">{sheetFinanceError}</p>
                                            )}
                                            <Link
                                                href={`/caja-recepcion?tab=contratos&patientId=${patient.id_paciente}`}
                                                className="inline-flex items-center gap-1 text-xs mt-2 text-blue-600 hover:underline"
                                            >
                                                Generar contrato en Caja Recepción
                                                <ExternalLink size={12} />
                                            </Link>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => { void fetchFinanceFromSheet(); }}
                                                disabled={sheetFinanceLoading}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-60 transition-colors"
                                            >
                                                {sheetFinanceLoading ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
                                                {sheetFinanceLoading ? 'Actualizando...' : 'Actualizar'}
                                            </button>

                                            <button
                                                onClick={() => {
                                                    if (isEditingFin) handleSaveFinancing();
                                                    else setIsEditingFin(true);
                                                }}
                                                disabled={savingFin || !!sheetFinance}
                                                className={clsx(
                                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                                    isEditingFin
                                                        ? "bg-green-600 hover:bg-green-700 text-white"
                                                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50"
                                                )}
                                            >
                                                {isEditingFin ? (
                                                    <>{savingFin ? 'Guardando...' : <><Save size={16} /> Guardar Cambios</>}</>
                                                ) : (
                                                    <><Edit2 size={16} /> Configurar Plan</>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {isEditingFin ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Estado del Plan</label>
                                                <select
                                                    value={finData.estado}
                                                    onChange={(e) => setFinData({ ...finData, estado: e.target.value })}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                                >
                                                    <option value="inactivo">Inactivo</option>
                                                    <option value="activo">Activo (En curso)</option>
                                                    <option value="finalizado">Finalizado</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Monto Total a Financiar (USD)</label>
                                                <div className="relative">
                                                    <MoneyInput
                                                        value={finData.monto}
                                                        onChange={(val) => setFinData({ ...finData, monto: val })}
                                                        className="w-full h-auto"
                                                        placeholder="0"
                                                        currency="USD"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad de Cuotas</label>
                                                <input
                                                    type="number"
                                                    value={finData.cuotas}
                                                    onChange={(e) => setFinData({ ...finData, cuotas: Number(e.target.value) })}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                                    placeholder="Ej: 3"
                                                />
                                            </div>
                                        </div>
                                    ) : finData.estado === 'inactivo' ? (
                                        <div className="p-6 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                            <p className="text-gray-500 text-sm">No hay plan de financiación activo para este paciente.</p>
                                            <button
                                                onClick={() => setIsEditingFin(true)}
                                                className="mt-2 text-blue-600 font-medium hover:underline text-sm"
                                            >
                                                Configurar Plan
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                                    <p className="text-sm text-gray-500 mb-1">Total Financiado</p>
                                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">${totalPlanDisplay.toLocaleString('es-AR')}</p>
                                                </div>
                                                <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30">
                                                    <p className="text-sm text-green-600 dark:text-green-400 mb-1">Cuotas Abonadas</p>
                                                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                                        {cuotasPagadasDisplay}
                                                        <span className="text-base font-medium ml-1">/ {totalCuotasDisplay || 0}</span>
                                                    </p>
                                                </div>
                                                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                                                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Saldo Restante</p>
                                                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                                        ${saldoFinanc.toLocaleString('es-AR')}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Quotas Visual Grid */}
                                            <div className="mt-8">
                                                <div className="flex justify-between items-end mb-4">
                                                    <h3 className="font-medium text-gray-900 dark:text-white">Estado de Cuotas</h3>
                                                    <span className="text-sm text-gray-500">
                                                        {cuotasPagadasDisplay} pagadas de {totalCuotasDisplay || 0}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                                    {Array.from({ length: totalCuotasDisplay || 0 }).map((_, i) => {
                                                        const quotaNum = i + 1;
                                                        const paidPayment = payments.find(p => p.cuota_nro === quotaNum && p.estado !== 'Anulado');
                                                        const isPaid = sheetFinance ? quotaNum <= cuotasPagadasDisplay : !!paidPayment;
                                                        const isNext = !isPaid && quotaNum === (cuotasPagadasDisplay + 1);

                                                        return (
                                                            <div
                                                                key={quotaNum}
                                                                className={clsx(
                                                                    "relative p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all",
                                                                    isPaid
                                                                        ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                                                                        : isNext
                                                                            ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200 dark:bg-blue-900/20 dark:border-blue-400 dark:ring-blue-900"
                                                                            : "bg-gray-50 border-gray-100 text-gray-400 dark:bg-gray-800 dark:border-gray-700"
                                                                )}
                                                            >
                                                                <span className="text-xs font-semibold mb-1">Cuota {quotaNum}</span>
                                                                {isPaid ? (
                                                                    <Check size={20} className="mb-1" />
                                                                ) : (
                                                                    <span className="text-lg font-bold text-gray-300 dark:text-gray-600">
                                                                        {i + 1}
                                                                    </span>
                                                                )}
                                                                {isPaid && (
                                                                    <span className="text-[10px] leading-tight opacity-75">
                                                                        {new Date(paidPayment.fecha_hora).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                                                    </span>
                                                                )}
                                                                {isNext && (
                                                                    <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm">
                                                                        Próxima
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Listado de Pagos de Cuotas — solo si hay plan activo */}
                                {finData.estado === 'activo' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                                    <div className="p-5 border-b border-gray-100 dark:border-gray-800">
                                        <h3 className="font-semibold text-gray-900 dark:text-white">Pagos de Cuotas Registrados</h3>
                                        <p className="text-xs text-gray-500">Solo se muestran los pagos marcados explícitamente como cuota</p>
                                    </div>
                                    {payments.filter(p => (p.cuota_nro || 0) > 0).length === 0 ? (
                                        <div className="p-10 text-center text-gray-500">
                                            <CreditCard className="mx-auto mb-3 text-gray-300" size={32} />
                                            <p>No hay pagos de cuotas registrados aún.</p>
                                            <Link href="/caja-recepcion" className="text-blue-500 hover:underline text-sm mt-2 block">
                                                Registrar nuevo pago de cuota
                                            </Link>
                                        </div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800/50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left">Fecha</th>
                                                    <th className="px-6 py-3 text-left">Cuota</th>
                                                    <th className="px-6 py-3 text-right">Monto USD</th>
                                                    <th className="px-6 py-3 text-center">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {payments.filter(p => (p.cuota_nro || 0) > 0).map((p) => (
                                                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                                        <td className="px-6 py-4">{new Date(p.fecha_hora).toLocaleDateString('es-AR')}</td>
                                                        <td className="px-6 py-4">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                                Cuota {p.cuota_nro} {p.cuotas_total ? `/ ${p.cuotas_total}` : ''}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-medium">${p.usd_equivalente?.toFixed(2)}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={clsx(
                                                                "w-2 h-2 rounded-full inline-block mr-2",
                                                                p.estado === 'pagado' ? "bg-green-500" : "bg-yellow-500"
                                                            )}></span>
                                                            {p.estado}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                </div>}
                            </div>
                        )}

                        {/* Tab: Recalls */}
                        {activeTab === 'recalls' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                                <PatientCadence patientId={patient.id_paciente} />
                            </div>
                        )}

                        {/* Tab: Smile Design ✨ */}
                        {activeTab === 'smile_design' && (
                            <div className="py-2">
                                <SmileDesign
                                    patientId={patient.id_paciente}
                                    patientName={`${patient.nombre} ${patient.apellido}`}
                                    onSaved={() => setActiveTab('portal')}
                                />
                            </div>
                        )}

                        {/* Tab: Archivos (Google Drive) */}
                        {activeTab === 'archivos' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                                <PatientDriveTab
                                    patientId={patient.id_paciente}
                                    patientName={`${patient.apellido}, ${patient.nombre}`}
                                    motherFolderUrl={patient.link_historia_clinica}
                                />
                            </div>
                        )}

                        {/* Tab: Portal 360 */}
                        {activeTab === 'portal' && (
                            <PatientPortalPanel
                                patientId={patient.id_paciente}
                                patientName={`${patient.nombre} ${patient.apellido}`}
                            />
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>
        </div >
    );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-gray-400">{icon}</div>
            <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-medium text-gray-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
}
