'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    User,
    Phone,
    Mail,
    Edit2,
    Copy,
    MessageCircle,
    CheckCircle,
    MapPin,
    Trash2,
    AlertTriangle,
    Loader2,
    Presentation,
    Send,
} from 'lucide-react';
import Link from 'next/link';
import { Paciente, formatWhatsAppLink, formatMailtoLink } from '@/lib/patients';
import { softDeletePatientAction as softDeletePaciente } from '@/app/actions/patients';

import { generatePatientUpdateToken } from '@/app/actions/patient-update';

const ENRICHMENT_FIELDS: (keyof Paciente)[] = ['documento', 'fecha_nacimiento', 'email', 'whatsapp', 'como_nos_conocio'];

function getMissingCount(patient: Paciente): number {
    return ENRICHMENT_FIELDS.filter((f) => {
        if (f === 'como_nos_conocio') {
            const referral = patient.como_nos_conocio || patient.referencia_origen;
            return !referral || referral.trim() === '';
        }

        const v = patient[f];
        return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    }).length;
}

interface PatientListProps {
    patients: Paciente[];
    onRefresh?: () => void;
}

interface DeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDelete: () => void;
    patient: Paciente | null;
    isDeleting: boolean;
}

function DeleteModal({ isOpen, onClose, onDelete, patient, isDeleting }: DeleteModalProps) {
    const [confirmText, setConfirmText] = useState('');

    if (!isOpen || !patient) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl border border-red-500/30 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center gap-3 text-red-500 mb-4">
                        <div className="p-3 bg-red-500/10 rounded-full">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-lg font-bold">Eliminar Paciente</h3>
                    </div>

                    <p className="text-slate-300 mb-4">
                        Estás a punto de eliminar a <span className="font-bold text-white">{patient.nombre} {patient.apellido}</span>.
                    </p>

                    <div className="bg-red-500/10 p-4 rounded-xl mb-4 border border-red-500/20">
                        <ul className="text-sm text-red-400 space-y-1 list-disc list-inside">
                            <li>El paciente se marcará como eliminado.</li>
                            <li>No aparecerá en las listas activas.</li>
                            <li>Podrás volver a registrar este DNI/Email.</li>
                        </ul>
                    </div>

                    <p className="text-sm text-slate-400 mb-2">
                        Escribí <strong className="text-white relative px-1 before:absolute before:inset-0 before:bg-white/10 before:rounded">ELIMINAR</strong> para confirmar:
                    </p>
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="w-full px-4 py-2 border border-white/10 rounded-lg mb-6 bg-navy-900/50 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500/50 transition-colors"
                        placeholder="ELIMINAR"
                    />

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={isDeleting}
                            className="px-4 py-2 text-slate-300 hover:bg-white/5 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={onDelete}
                            disabled={confirmText !== 'ELIMINAR' || isDeleting}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all"
                        >
                            {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PatientList({ patients, onRefresh }: PatientListProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [patientToDelete, setPatientToDelete] = useState<Paciente | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [sendingEnrichId, setSendingEnrichId] = useState<string | null>(null);

    async function handleSendEnrichmentLink(patient: Paciente) {
        setSendingEnrichId(patient.id_paciente);
        try {
            const result = await generatePatientUpdateToken(patient.id_paciente);
            if (!result.success || !result.url) {
                alert('Error al generar el link: ' + (result.error || 'desconocido'));
                return;
            }
            const phone = (patient.whatsapp || '').replace(/\D/g, '');
            const msg = encodeURIComponent(
                `Hola ${patient.nombre}! Te enviamos este link personalizado para completar tus datos en AM Estética Dental 😊\n\n${result.url}\n\n¡Muchas gracias!`
            );
            const waUrl = phone
                ? `https://wa.me/${phone}?text=${msg}`
                : `https://wa.me/?text=${msg}`;
            window.open(waUrl, '_blank', 'noopener,noreferrer');
        } finally {
            setSendingEnrichId(null);
        }
    }

    async function handleConfirmDelete() {
        if (!patientToDelete) return;

        setIsDeleting(true);
        try {
            const result = await softDeletePaciente(
                patientToDelete.id_paciente,
                'Solicitado por usuario (Test)',
                'Admin'
            );

            if (result.success) {
                setPatientToDelete(null);
                if (onRefresh) onRefresh();
            } else {
                alert('Error al eliminar: ' + result.error);
            }
        } catch (error) {
            console.error('Error deleting patient:', error);
            alert('Error inesperado al eliminar paciente');
        } finally {
            setIsDeleting(false);
        }
    }

    function copyToClipboard(id: string, text: string) {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    function getWhatsAppNumber(patient: Paciente): string | null {
        // Try whatsapp_numero first, then whatsapp
        if (patient.whatsapp_numero) {
            return `${patient.whatsapp_pais_code || '+54'}${patient.whatsapp_numero.replace(/\D/g, '')}`;
        }
        if (patient.whatsapp) {
            return patient.whatsapp;
        }
        return null;
    }

    function getStatusColor(status: string | undefined): string {
        switch (status) {
            case 'Activo': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20';
            case 'En tratamiento': return 'bg-teal-500/20 text-teal-400 border border-teal-500/20';
            case 'Alta': return 'bg-purple-500/20 text-purple-400 border border-purple-500/20';
            case 'Inactivo': return 'bg-white/5 text-slate-400 border border-white/10';
            default: return 'bg-white/5 text-slate-400 border border-white/10';
        }
    }

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    if (patients.length === 0) {
        return (
            <div className="text-center py-20 text-slate-500">
                <User size={48} className="mx-auto mb-4 text-slate-600/50" />
                <p>No se encontraron pacientes.</p>
            </div>
        );
    }

    const totalPages = Math.ceil(patients.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentPatients = patients.slice(startIndex, startIndex + itemsPerPage);

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    }

    return (
        <div className="space-y-4">
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full">
                    <thead className="text-xs text-slate-400 uppercase bg-navy-900/50 border-b border-white/10">
                        <tr>
                            <th className="px-4 py-3 text-left">Paciente</th>
                            <th className="px-4 py-3 text-left">Estado</th>
                            <th className="px-4 py-3 text-left">Ciudad</th>
                            <th className="px-4 py-3 text-center">Acciones Rápidas</th>
                            <th className="px-4 py-3 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {currentPatients.map((patient, index) => {
                            const whatsapp = getWhatsAppNumber(patient);
                            const email = patient.email;
                            const missingCount = getMissingCount(patient);

                            return (
                                <motion.tr
                                    key={patient.id_paciente}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.02 }}
                                    className="hover:bg-white/5 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/patients/${patient.id_paciente}`}
                                            className="flex items-center gap-3 group"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
                                                <User size={20} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-white group-hover:text-teal-400 transition-colors drop-shadow-sm">
                                                        {patient.apellido}, {patient.nombre}
                                                    </p>
                                                    {!patient.primera_consulta_fecha && patient.fecha_alta && (new Date().getTime() - new Date(patient.fecha_alta).getTime()) < 60 * 24 * 60 * 60 * 1000 && (
                                                        <span
                                                            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase tracking-wider"
                                                            title="Paciente registrado hace menos de 60 días — aún sin primera consulta confirmada"
                                                        >
                                                            nuevo
                                                        </span>
                                                    )}
                                                    {missingCount > 0 && (
                                                        <span
                                                            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                                            title={`${missingCount} dato${missingCount > 1 ? 's' : ''} faltante${missingCount > 1 ? 's' : ''}`}
                                                        >
                                                            {missingCount}
                                                        </span>
                                                    )}
                                                </div>
                                                {patient.documento && (
                                                    <p className="text-xs text-slate-500">
                                                        DNI: {patient.documento}
                                                    </p>
                                                )}
                                            </div>
                                        </Link>
                                    </td>

                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 flex w-max items-center justify-center rounded-full text-xs font-medium ${getStatusColor(patient.estado_paciente)}`}>
                                            {patient.estado_paciente || 'Sin estado'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 text-sm text-slate-400">
                                            <MapPin size={14} className="text-slate-500/50" />
                                            {patient.ciudad || patient.zona_barrio || '-'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            {/* WhatsApp */}
                                            {whatsapp ? (
                                                <>
                                                    <a
                                                        href={formatWhatsAppLink(whatsapp)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                                        title="Abrir WhatsApp"
                                                    >
                                                        <MessageCircle size={18} />
                                                    </a>
                                                    <button
                                                        onClick={() => copyToClipboard(`wa-${patient.id_paciente}`, whatsapp)}
                                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                        title="Copiar WhatsApp"
                                                    >
                                                        {copiedId === `wa-${patient.id_paciente}` ? (
                                                            <CheckCircle size={16} className="text-green-500" />
                                                        ) : (
                                                            <Phone size={16} />
                                                        )}
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="p-2 text-gray-300">
                                                    <Phone size={16} />
                                                </span>
                                            )}

                                            {/* Google Slides Link */}
                                            {patient.link_google_slides && (
                                                <a
                                                    href={patient.link_google_slides}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg"
                                                    title="Ver Ficha Clínica (Google Slides)"
                                                >
                                                    <Presentation size={18} />
                                                </a>
                                            )}

                                            {/* Email */}
                                            {email ? (
                                                <>
                                                    <a
                                                        href={formatMailtoLink(email)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                                        title="Enviar Email"
                                                    >
                                                        <Mail size={18} />
                                                    </a>
                                                    <button
                                                        onClick={() => copyToClipboard(`em-${patient.id_paciente}`, email)}
                                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                        title="Copiar Email"
                                                    >
                                                        {copiedId === `em-${patient.id_paciente}` ? (
                                                            <CheckCircle size={16} className="text-green-500" />
                                                        ) : (
                                                            <Copy size={16} />
                                                        )}
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="p-2 text-white/10">
                                                    <Mail size={16} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {missingCount > 0 && (
                                                <button
                                                    onClick={() => handleSendEnrichmentLink(patient)}
                                                    disabled={sendingEnrichId === patient.id_paciente}
                                                    className="p-2 text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg inline-flex transition-colors disabled:opacity-50"
                                                    title="Enviar link de actualización de datos por WhatsApp"
                                                >
                                                    {sendingEnrichId === patient.id_paciente ? (
                                                        <Loader2 size={18} className="animate-spin" />
                                                    ) : (
                                                        <Send size={18} />
                                                    )}
                                                </button>
                                            )}
                                            <Link
                                                href={`/patients/${patient.id_paciente}`}
                                                className="p-2 text-slate-500 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg inline-flex transition-colors"
                                                title="Ver ficha"
                                            >
                                                <Edit2 size={18} />
                                            </Link>
                                            <button
                                                onClick={() => setPatientToDelete(patient)}
                                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg inline-flex transition-colors"
                                                title="Eliminar paciente"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center glass-card px-4 py-3 rounded-xl border border-white/10">
                    <p className="text-sm text-slate-400">
                        Mostrando <span className="font-medium text-white">{startIndex + 1}</span> a <span className="font-medium text-white">{Math.min(startIndex + itemsPerPage, patients.length)}</span> de <span className="font-medium text-white">{patients.length}</span> resultados
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-sm border border-white/10 rounded-lg disabled:opacity-50 text-slate-300 hover:bg-white/5 transition-colors"
                        >
                            Anterior
                        </button>
                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                            let p = i + 1;
                            if (totalPages > 5) {
                                if (currentPage > 3) p = currentPage - 2 + i;
                                if (p > totalPages) p = totalPages - (4 - i);
                            }
                            if (p < 1) p = 1;

                            return (
                                <button
                                    key={i}
                                    onClick={() => goToPage(p)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${currentPage === p
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/10'
                                        }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-sm border border-white/10 rounded-lg disabled:opacity-50 text-slate-300 hover:bg-white/5 transition-colors"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}

            <DeleteModal
                isOpen={!!patientToDelete}
                onClose={() => setPatientToDelete(null)}
                onDelete={handleConfirmDelete}
                patient={patientToDelete}
                isDeleting={isDeleting}
            />
        </div>
    );
}
