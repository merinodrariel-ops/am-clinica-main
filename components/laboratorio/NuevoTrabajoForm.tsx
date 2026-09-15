'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, User, Loader2, Calendar, FlaskConical, Stethoscope, Landmark, Plus, Mic, MicOff } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { createLaboratoryOrderAction, getLaboratoryRecipientDirectory } from '@/app/actions/laboratorio';

const supabase = createClient();
import MoneyInput from '@/components/ui/MoneyInput';


interface Paciente {
    id_paciente: string;
    nombre: string;
    apellido: string;
}

interface Profesional {
    id: string;
    nombre: string;
}

interface NuevoTrabajoFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialPatient?: { id: string; name: string };
}

export default function NuevoTrabajoForm({ isOpen, onClose, onSuccess, initialPatient }: NuevoTrabajoFormProps) {
    const [saving, setSaving] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const finalTranscriptRef = useRef('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);

    // Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [patients, setPatients] = useState<Paciente[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [profesionales, setProfesionales] = useState<Profesional[]>([]);
    const [recipients, setRecipients] = useState<{ name: string; email: string }[]>([]);
    const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

    // Form data
    const [formData, setFormData] = useState({
        paciente_id: '',
        paciente_nombre: '',
        profesional_id: '',
        tipo_trabajo: '',
        laboratorio_nombre: '',
        fecha_envio: new Date().toISOString().split('T')[0],
        fecha_entrega_estimada: '',
        costo_usd: 0,
        observaciones: '',
        cantidad: 1,
        piezas: '',
        color: '',
        material: '',
        escaneado: 'Sí'
    });

    function toggleDictation() {
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Tu navegador no soporta dictado por voz. Usá Chrome o Edge.');
            return;
        }

        finalTranscriptRef.current = formData.observaciones;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new SpeechRecognition() as any;
        recognition.lang = 'es-AR';
        recognition.continuous = true;
        recognition.interimResults = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            let interim = '';
            let finals = '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const result of Array.from(event.results) as any[]) {
                if (result.isFinal) finals += result[0].transcript;
                else interim += result[0].transcript;
            }
            if (finals) finalTranscriptRef.current = `${finalTranscriptRef.current} ${finals}`.trim();
            setFormData(prev => ({ ...prev, observaciones: `${finalTranscriptRef.current} ${interim}`.trim() }));
        };
        recognition.onend = () => {
            setFormData(prev => ({ ...prev, observaciones: finalTranscriptRef.current }));
            setIsRecording(false);
        };
        recognition.onerror = () => setIsRecording(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
    }

    useEffect(() => {
        if (isOpen) {
            loadProfesionales();
            getLaboratoryRecipientDirectory().then(({ contacts, defaultEmails }) => {
                setRecipients(contacts);
                setSelectedRecipients(defaultEmails);
            }).catch(() => setRecipients([]));
            if (initialPatient) {
                setFormData(prev => ({ ...prev, paciente_id: initialPatient.id, paciente_nombre: initialPatient.name }));
            }
        }
    }, [isOpen, initialPatient]);

    async function loadProfesionales() {
        const { data } = await supabase.from('profesionales').select('id, nombre').eq('activo', true);
        setProfesionales(data || []);
    }

    // Patient search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.length >= 2) {
                searchPatients(searchQuery);
            } else {
                setPatients([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    async function searchPatients(query: string) {
        setSearchLoading(true);
        const { data } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido')
            .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
            .limit(5);
        setPatients(data || []);
        setSearchLoading(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.paciente_id || !formData.tipo_trabajo) {
            alert('Por favor completá Paciente y Tipo de Trabajo');
            return;
        }

        setSaving(true);
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
        }
        try {
            const result = await createLaboratoryOrderAction({
                patientId: formData.paciente_id,
                type: formData.tipo_trabajo,
                professionalId: formData.profesional_id,
                laboratoryName: formData.laboratorio_nombre,
                sendDate: formData.fecha_envio,
                estimatedDelivery: formData.fecha_entrega_estimada,
                costUsd: formData.costo_usd,
                quantity: formData.cantidad,
                pieces: formData.piezas,
                color: formData.color,
                material: formData.material,
                scanned: formData.escaneado,
                notes: formData.observaciones,
                recipientEmails: selectedRecipients,
            });
            if (!result.ok) throw new Error(result.error || 'No se pudo guardar la orden');
            onSuccess();
            onClose();
            // Reset form
            setFormData({
                paciente_id: '',
                paciente_nombre: '',
                profesional_id: '',
                tipo_trabajo: '',
                laboratorio_nombre: '',
                fecha_envio: new Date().toISOString().split('T')[0],
                fecha_entrega_estimada: '',
                costo_usd: 0,
                observaciones: '',
                cantidad: 1,
                piezas: '',
                color: '',
                material: '',
                escaneado: 'Sí'
            });
            setSearchQuery('');
            setSelectedRecipients([]);
        } catch (error) {
            console.error('Error saving lab work:', error);
            alert('Error al guardar el trabajo');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="modal-viewport z-[60] bg-black/60 backdrop-blur-sm">
            <div className="modal-panel max-w-2xl rounded-3xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200 dark:bg-gray-800">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-900/10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center">
                            <FlaskConical size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Nuevo Trabajo de Laboratorio</h3>
                            <p className="text-xs text-gray-500">Registrar envío de orden</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Patient Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Paciente *</label>
                            {formData.paciente_id ? (
                                <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                                    <div className="flex items-center gap-2">
                                        <User size={18} className="text-indigo-600" />
                                        <span className="font-semibold text-gray-900 dark:text-white">{formData.paciente_nombre}</span>
                                    </div>
                                    {!initialPatient && <button
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, paciente_id: '', paciente_nombre: '' }));
                                            setSearchQuery('');
                                        }}
                                        className="text-gray-400 hover:text-red-500"
                                    >
                                        <X size={16} />
                                    </button>}
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o apellido..."
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-600" size={18} />}

                                    {patients.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-10 overflow-hidden">
                                            {patients.map(p => (
                                                <button
                                                    key={p.id_paciente}
                                                    type="button"
                                                    className="w-full px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-between transition-colors"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            paciente_id: p.id_paciente,
                                                            paciente_nombre: `${p.nombre} ${p.apellido}`
                                                        }));
                                                        setPatients([]);
                                                    }}
                                                >
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{p.nombre} {p.apellido}</span>
                                                    <Plus size={16} className="text-indigo-600" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Professional Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Profesional Solicitante</label>
                            <div className="relative">
                                <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <select
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
                                    value={formData.profesional_id}
                                    onChange={(e) => setFormData(prev => ({ ...prev, profesional_id: e.target.value }))}
                                >
                                    <option value="">Seleccionar profesional...</option>
                                    {profesionales.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Work Type */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Tipo de Trabajo *</label>
                            <input
                                type="text"
                                placeholder="Ej: Corona Zirconio, Perno, etc."
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                value={formData.tipo_trabajo}
                                onChange={(e) => setFormData(prev => ({ ...prev, tipo_trabajo: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Cantidad *</label>
                            <input type="number" min={1} max={99} required value={formData.cantidad} onChange={e => setFormData(prev => ({ ...prev, cantidad: Math.max(1, Number(e.target.value) || 1) }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Piezas / números dentarios</label>
                            <input type="text" placeholder="Ej: 11, 12, 21 y 22" value={formData.piezas} onChange={e => setFormData(prev => ({ ...prev, piezas: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Color</label>
                            <input type="text" placeholder="Ej: A1, BL2, bleach" value={formData.color} onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Material</label>
                            <input type="text" placeholder="Ej: disilicato, zirconia, resina" value={formData.material} onChange={e => setFormData(prev => ({ ...prev, material: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">¿Escaneado digital?</label>
                            <select value={formData.escaneado} onChange={e => setFormData(prev => ({ ...prev, escaneado: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                                <option>Sí</option><option>No</option><option>Pendiente</option>
                            </select>
                        </div>

                        {/* Lab Name */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Laboratorio</label>
                            <div className="relative">
                                <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Nombre del laboratorio..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={formData.laboratorio_nombre}
                                    onChange={(e) => setFormData(prev => ({ ...prev, laboratorio_nombre: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Notificar a</label>
                            <p className="text-xs text-gray-500">Elegí una o varias personas. Sus emails están configurados en el directorio del equipo.</p>
                            <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 max-h-32 overflow-y-auto">
                                {recipients.length === 0 ? <span className="text-xs text-gray-400">No hay contactos activos con email.</span> : recipients.map(recipient => {
                                    const selected = selectedRecipients.includes(recipient.email);
                                    return <button key={recipient.email} type="button" onClick={() => setSelectedRecipients(prev => selected ? prev.filter(email => email !== recipient.email) : [...prev, recipient.email])} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-indigo-300'}`}>{recipient.name || recipient.email}</button>;
                                })}
                            </div>
                            {selectedRecipients.length > 0 && <p className="text-xs text-indigo-600">Se notificará a {selectedRecipients.length} destinatario{selectedRecipients.length === 1 ? '' : 's'} por email.</p>}
                        </div>

                        {/* Dates */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-amber-600">Fecha de Entrega Estimada</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={formData.fecha_entrega_estimada}
                                    onChange={(e) => setFormData(prev => ({ ...prev, fecha_entrega_estimada: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Cost */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Costo Estimado (USD)</label>
                            <MoneyInput
                                value={formData.costo_usd}
                                onChange={(val) => setFormData(prev => ({ ...prev, costo_usd: val }))}
                                placeholder="0.00"
                                currency="USD"
                                className="font-bold"
                            />
                        </div>
                    </div>

                    {/* Observations */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Indicaciones al laboratorio</label>
                            <button
                                type="button"
                                onClick={toggleDictation}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isRecording ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                            >
                                {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                                {isRecording ? 'Detener dictado' : 'Dictar'}
                            </button>
                        </div>
                        <textarea
                            placeholder="Podés escribir o dictar color, materiales, forma y especificaciones..."
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
                            value={formData.observaciones}
                            onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-3 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
                        >
                            {saving ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <FlaskConical size={20} />
                            )}
                            Registrar Envío
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
