'use client';

import { useState, useEffect } from 'react';
import { createAppointment, updateAppointment, deleteAppointment, searchPatients, getDoctors } from '@/app/actions/agenda';
import { X, Loader2, Search, User, Calendar, Clock, FileText, Trash2, Check, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Patient {
    id: string;
    full_name: string;
    phone: string;
}

interface Doctor {
    id: string;
    full_name: string;
    role: string;
}

interface AppointmentData {
    id?: string;
    title: string;
    patientId: string;
    doctorId: string;
    start: Date;
    end: Date;
    status: string;
    type: string;
    notes: string;
    patient?: { full_name: string };
}

interface NewAppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    initialData?: AppointmentData | null;
    initialDate?: Date;
}

export default function NewAppointmentModal({ isOpen, onClose, onSave, initialData, initialDate }: NewAppointmentModalProps) {
    const [loading, setLoading] = useState(false);
    const [doctors, setDoctors] = useState<Doctor[]>([]);

    // Form State
    const [title, setTitle] = useState('');
    const [patientId, setPatientId] = useState('');
    const [doctorId, setDoctorId] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [status, setStatus] = useState('confirmed');
    const [type, setType] = useState('consulta');
    const [notes, setNotes] = useState('');

    // Patient Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [patients, setPatients] = useState<Patient[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedPatientName, setSelectedPatientName] = useState('');
    const { user } = useAuth();

    useEffect(() => {
        if (isOpen) {
            loadDoctors();
            if (initialData) {
                // Edit Mode
                setTitle(initialData.title || '');
                setPatientId(initialData.patientId || '');
                setDoctorId(initialData.doctorId || '');
                // Ensure dates are valid Date objects
                const start = initialData.start instanceof Date ? initialData.start : new Date(initialData.start);
                const end = initialData.end instanceof Date ? initialData.end : new Date(initialData.end);

                setStartTime(toDateTimeLocal(start));
                setEndTime(toDateTimeLocal(end));
                setStatus(initialData.status || 'confirmed');
                setType(initialData.type || 'consulta');
                setNotes(initialData.notes || '');
                setSelectedPatientName(initialData.patient?.full_name || '');
            } else if (initialDate) {
                // Create Mode with specific date (from single click)
                setTitle('');
                setPatientId('');
                setDoctorId('');

                // For single click, initialDate is the start time
                const start = new Date(initialDate);
                const end = new Date(start);
                end.setMinutes(end.getMinutes() + 30);
                setStartTime(toDateTimeLocal(start));
                setEndTime(toDateTimeLocal(end));

                setStatus('confirmed');
                setType('consulta');
                setNotes('');
                setSelectedPatientName('');
                setSearchTerm('');
            }
        }
    }, [isOpen, initialData, initialDate]);

    // Search Patients Debounce
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (searchTerm.length > 2) {
                setSearching(true);
                const results = await searchPatients(searchTerm);
                setPatients(results);
                setSearching(false);
            } else {
                setPatients([]);
            }
        }, 300); // Faster debounce

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    const loadDoctors = async () => {
        const docs = await getDoctors();
        setDoctors(docs);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData();
        formData.append('title', title);
        formData.append('patientId', patientId);
        formData.append('doctorId', doctorId);
        formData.append('startTime', new Date(startTime).toISOString());
        formData.append('endTime', new Date(endTime).toISOString());
        formData.append('status', status);
        formData.append('type', type);
        formData.append('notes', notes);

        try {
            if (initialData?.id) {
                // Update
                const updates = {
                    title,
                    patient_id: patientId ? patientId : null,
                    doctor_id: doctorId ? doctorId : null,
                    start_time: new Date(startTime).toISOString(),
                    end_time: new Date(endTime).toISOString(),
                    status,
                    type,
                    notes
                };
                await updateAppointment(initialData.id, updates);
            } else {
                // Create
                await createAppointment(formData);
            }
            onSave();
            onClose();
        } catch (error) {
            console.error(error);
            alert('Error al guardar la cita');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData?.id || !confirm('¿Estás seguro de eliminar esta cita?')) return;
        setLoading(true);
        try {
            await deleteAppointment(initialData.id);
            onSave();
            onClose();
        } catch (error) {
            console.error(error);
            alert('Error al eliminar');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 border border-gray-100 dark:border-gray-800">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {initialData?.id ? 'Editar Cita' : 'Nueva Cita'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-200/50 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* Patient Search - Hero Field */}
                    <div className="relative group">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Paciente</label>
                        {selectedPatientName ? (
                            <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/30 group-hover:border-blue-200 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-300 shadow-sm">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <span className="block font-medium text-gray-900 dark:text-white leading-tight">{selectedPatientName}</span>
                                        <span className="text-xs text-blue-500 font-medium">Paciente Registrado</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setPatientId(''); setSelectedPatientName(''); setSearchTerm(''); }}
                                    className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre..."
                                    className="block w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus={!initialData?.id}
                                />
                                {searching && (
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                    </div>
                                )}

                                {/* Search Results Dropdown */}
                                {patients.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 max-h-60 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                                        {patients.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-3"
                                                onClick={() => {
                                                    setPatientId(p.id);
                                                    setSelectedPatientName(p.full_name);
                                                    setSearchTerm('');
                                                    setPatients([]);
                                                    if (!title) setTitle(`Consulta - ${p.full_name}`);
                                                }}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500">
                                                    <User size={14} />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900 dark:text-white">{p.full_name}</div>
                                                    <div className="text-xs text-gray-500">{p.phone}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Title Input */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Título</label>
                        <input
                            type="text"
                            required
                            placeholder="Ej: Limpieza Dental"
                            className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    {/* Date Time Row */}
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Inicio</label>
                            <input
                                type="datetime-local"
                                required
                                className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Fin</label>
                            <input
                                type="datetime-local"
                                required
                                className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Doctor & Type Row */}
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Doctor</label>
                            <select
                                className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm appearance-none"
                                value={doctorId}
                                onChange={(e) => setDoctorId(e.target.value)}
                            >
                                <option value="">Asignar Doctor...</option>
                                {doctors.map(d => (
                                    <option key={d.id} value={d.id}>{d.full_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Tipo</label>
                            <select
                                className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm appearance-none"
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                            >
                                <option value="consulta">Consulta</option>
                                <option value="tratamiento">Tratamiento</option>
                                <option value="control">Control</option>
                                <option value="urgencia">Urgencia</option>
                                <option value="cirugia">Cirugía</option>
                            </select>
                        </div>
                    </div>

                    {/* Status Pills */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 pl-1">Estado</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { val: 'confirmed', label: 'Confirmado', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
                                { val: 'pending', label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                                { val: 'arrived', label: 'En Sala', color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
                                { val: 'cancelled', label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
                            ].map((opt) => (
                                <button
                                    key={opt.val}
                                    type="button"
                                    onClick={() => setStatus(opt.val)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${status === opt.val
                                        ? 'ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600 ' + opt.color
                                        : 'bg-white dark:bg-gray-800 text-gray-600 border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 pl-1">Notas</label>
                        <textarea
                            rows={2}
                            placeholder="Detalles adicionales..."
                            className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm resize-none"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                        {initialData?.id ? (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={loading}
                                className="group flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
                                <span>Eliminar</span>
                            </button>
                        ) : <div></div>}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm hover:shadow dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Check size={18} />}
                                <span>Guardar Cita</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

function toDateTimeLocal(date: Date) {
    const pad = (n: number) => n < 10 ? '0' + n : n;
    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes());
}
