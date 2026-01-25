'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText,
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
    ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { Paciente, HistoriaClinica, PlanTratamiento, calculateAge, formatWhatsAppLink, formatMailtoLink } from '@/lib/patients';

interface Movement {
    id: string;
    fecha_hora: string;
    concepto_nombre: string;
    monto: number;
    moneda: string;
    metodo_pago: string;
    estado: string;
    usd_equivalente: number;
    observaciones?: string;
}

interface PatientDashboardProps {
    patient: Paciente;
    historiaClinica: HistoriaClinica[];
    planes: PlanTratamiento[];
    payments: Movement[];
}

const TABS = [
    { id: 'datos', label: 'Datos Personales', icon: User },
    { id: 'historia', label: 'Historia Clínica', icon: FileText },
    { id: 'pagos', label: 'Historial de Pagos', icon: CreditCard },
    { id: 'planes', label: 'Presupuesto/Plan', icon: DollarSign },
];

export default function PatientDashboard({ patient, historiaClinica, planes, payments }: PatientDashboardProps) {
    const [activeTab, setActiveTab] = useState('datos');
    const [isEditing, setIsEditing] = useState(false);

    const age = calculateAge(patient.fecha_nacimiento);
    const whatsappNumber = patient.whatsapp_numero
        ? `${patient.whatsapp_pais_code || '+54'}${patient.whatsapp_numero.replace(/\D/g, '')}`
        : patient.telefono;

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
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex mt-4 -mb-px">
                        {TABS.map((tab) => {
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
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200"
                                    >
                                        {isEditing ? <Save size={16} /> : <Edit2 size={16} />}
                                        {isEditing ? 'Guardar' : 'Editar'}
                                    </button>
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
                                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm">
                                        <Plus size={16} />
                                        Nueva Entrada
                                    </button>
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

                        {/* Tab 3: Historial de Pagos (Read Only) */}
                        {activeTab === 'pagos' && (
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

                                {payments.length === 0 ? (
                                    <div className="p-10 text-center text-gray-500">
                                        <CreditCard size={48} className="mx-auto mb-4 text-gray-300" />
                                        <p>No hay pagos registrados.</p>
                                        <Link
                                            href="/caja-recepcion"
                                            className="inline-flex items-center gap-2 mt-4 text-blue-500 hover:underline"
                                        >
                                            <ExternalLink size={16} />
                                            Ir a Caja Recepción
                                        </Link>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800">
                                            <tr>
                                                <th className="px-6 py-3 text-left">Fecha</th>
                                                <th className="px-6 py-3 text-left">Concepto</th>
                                                <th className="px-6 py-3 text-left">Método</th>
                                                <th className="px-6 py-3 text-left">Estado</th>
                                                <th className="px-6 py-3 text-right">Monto</th>
                                                <th className="px-6 py-3 text-right">USD Equiv.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {payments.map((payment) => (
                                                <tr key={payment.id} className={clsx(
                                                    "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                                                    payment.estado === 'Anulado' && 'opacity-50 line-through'
                                                )}>
                                                    <td className="px-6 py-4">
                                                        {new Date(payment.fecha_hora).toLocaleDateString('es-AR')}
                                                    </td>
                                                    <td className="px-6 py-4 font-medium">{payment.concepto_nombre}</td>
                                                    <td className="px-6 py-4 text-gray-500">{payment.metodo_pago}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={clsx(
                                                            "px-2 py-1 rounded-full text-xs font-medium",
                                                            payment.estado === 'Confirmado' ? 'bg-green-100 text-green-700' :
                                                                payment.estado === 'Anulado' ? 'bg-red-100 text-red-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                        )}>
                                                            {payment.estado}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {payment.moneda} {payment.monto.toLocaleString('es-AR')}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-medium">
                                                        ${payment.usd_equivalente?.toFixed(2) || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {/* Tab 4: Planes de Tratamiento */}
                        {activeTab === 'planes' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                    <h2 className="text-lg font-semibold">Planes de Tratamiento</h2>
                                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm">
                                        <Plus size={16} />
                                        Nuevo Plan
                                    </button>
                                </div>

                                {planes.length === 0 ? (
                                    <div className="p-10 text-center text-gray-500">
                                        <DollarSign size={48} className="mx-auto mb-4 text-gray-300" />
                                        <p>No hay planes de tratamiento registrados.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {planes.map((plan) => {
                                            const pagadoPlan = payments
                                                .filter(p => p.estado !== 'Anulado')
                                                .reduce((sum, p) => sum + (p.usd_equivalente || 0), 0);
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
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
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
