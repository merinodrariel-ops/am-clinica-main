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
    Presentation
} from 'lucide-react';
import Link from 'next/link';
import { Paciente, formatWhatsAppLink, formatMailtoLink, softDeletePaciente } from '@/lib/patients';

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl border border-red-100 dark:border-red-900 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center gap-3 text-red-600 mb-4">
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-lg font-bold">Eliminar Paciente</h3>
                    </div>

                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                        Estás a punto de eliminar a <span className="font-bold text-gray-900 dark:text-white">{patient.nombre} {patient.apellido}</span>.
                    </p>

                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl mb-4 border border-red-100 dark:border-red-800/50">
                        <ul className="text-sm text-red-700 dark:text-red-400 space-y-1 list-disc list-inside">
                            <li>El paciente se marcará como eliminado.</li>
                            <li>No aparecerá en las listas activas.</li>
                            <li>Podrás volver a registrar este DNI/Email.</li>
                        </ul>
                    </div>

                    <p className="text-sm text-gray-500 mb-2">
                        Escribí <strong>ELIMINAR</strong> para confirmar:
                    </p>
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg mb-6 bg-gray-50 dark:bg-gray-900"
                        placeholder="ELIMINAR"
                    />

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={isDeleting}
                            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={onDelete}
                            disabled={confirmText !== 'ELIMINAR' || isDeleting}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
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
        // Try whatsapp_numero first, then telefono
        if (patient.whatsapp_numero) {
            return `${patient.whatsapp_pais_code || '+54'}${patient.whatsapp_numero.replace(/\D/g, '')}`;
        }
        if (patient.telefono) {
            return patient.telefono;
        }
        return null;
    }

    function getStatusColor(status: string | undefined): string {
        switch (status) {
            case 'Activo': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            case 'En tratamiento': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'Alta': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
            case 'Inactivo': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
            default: return 'bg-gray-100 text-gray-700';
        }
    }

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    if (patients.length === 0) {
        return (
            <div className="text-center py-20 text-gray-500">
                <User size={48} className="mx-auto mb-4 text-gray-300" />
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
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <table className="w-full">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-4 py-3 text-left">Paciente</th>
                            <th className="px-4 py-3 text-left">Estado</th>
                            <th className="px-4 py-3 text-left">Ciudad</th>
                            <th className="px-4 py-3 text-center">Acciones Rápidas</th>
                            <th className="px-4 py-3 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentPatients.map((patient, index) => {
                            const whatsapp = getWhatsAppNumber(patient);
                            const email = patient.email;

                            return (
                                <motion.tr
                                    key={patient.id_paciente}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.02 }}
                                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                                                <User size={20} />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    {patient.apellido}, {patient.nombre}
                                                </p>
                                                {patient.documento && (
                                                    <p className="text-xs text-gray-500">
                                                        DNI: {patient.documento}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(patient.estado_paciente)}`}>
                                            {patient.estado_paciente || 'Sin estado'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                            <MapPin size={14} className="text-gray-400" />
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
                                                <span className="p-2 text-gray-300">
                                                    <Mail size={16} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <Link
                                                href={`/patients/${patient.id_paciente}`}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg inline-flex"
                                                title="Ver ficha"
                                            >
                                                <Edit2 size={18} />
                                            </Link>
                                            <button
                                                onClick={() => setPatientToDelete(patient)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg inline-flex"
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
                <div className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500">
                        Mostrando <span className="font-medium">{startIndex + 1}</span> a <span className="font-medium">{Math.min(startIndex + itemsPerPage, patients.length)}</span> de <span className="font-medium">{patients.length}</span> resultados
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition ${currentPage === p
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
