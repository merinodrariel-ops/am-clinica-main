'use client';

import { useState } from 'react';
import {
    X,
    User,
    Phone,
    MapPin,
    Calendar,
    Loader2,
    Mail,
    ChevronLeft,
    ChevronRight,
    Check
} from 'lucide-react';
import { createPaciente, logEmail } from '@/lib/patients';
import { supabase } from '@/lib/supabase';
import { sendWelcomeEmail, generateWelcomeMessage } from '@/lib/emailjs';

interface NuevoPacienteFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const PAIS_CODES = [
    { code: '+54', label: '🇦🇷 Argentina (+54)' },
    { code: '+55', label: '🇧🇷 Brasil (+55)' },
    { code: '+56', label: '🇨🇱 Chile (+56)' },
    { code: '+598', label: '🇺🇾 Uruguay (+598)' },
    { code: '+1', label: '🇺🇸 USA (+1)' },
];

const EMAIL_DOMAINS = [
    'gmail.com',
    'hotmail.com',
    'yahoo.com',
    'outlook.com',
    'icloud.com',
    'otro',
];

const CIUDADES = [
    'Buenos Aires CABA',
    'Gran Buenos Aires Norte',
    'Gran Buenos Aires Sur',
    'Gran Buenos Aires Oeste',
    'Córdoba',
    'Rosario',
    'Mendoza',
    'Interior Argentina',
    'Exterior',
];

const ESTADOS = [
    { value: 'Activo', label: 'Activo', color: 'green' },
    { value: 'En tratamiento', label: 'En tratamiento', color: 'blue' },
    { value: 'Alta', label: 'Alta', color: 'purple' },
    { value: 'Inactivo', label: 'Inactivo', color: 'gray' },
];

const ORIGENES = [
    'Formulario',
    'Recepción',
    'Staff',
    'Importación',
];

export default function NuevoPacienteForm({ isOpen, onClose, onSuccess }: NuevoPacienteFormProps) {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    // Form data
    const [form, setForm] = useState({
        apellido: '',
        nombre: '',
        documento: '',
        fecha_nacimiento: '',
        whatsapp_pais_code: '+54',
        whatsapp_numero: '',
        email_local: '',
        email_dominio: 'gmail.com',
        email_custom_domain: '',
        ciudad: '',
        zona_barrio: '',
        direccion: '',
        observaciones_generales: '',
        estado_paciente: 'Activo',
        origen_registro: 'Recepción',
        consentimiento_comunicacion: true,
    });

    function handleClose() {
        setForm({
            apellido: '',
            nombre: '',
            documento: '',
            fecha_nacimiento: '',
            whatsapp_pais_code: '+54',
            whatsapp_numero: '',
            email_local: '',
            email_dominio: 'gmail.com',
            email_custom_domain: '',
            ciudad: '',
            zona_barrio: '',
            direccion: '',
            observaciones_generales: '',
            estado_paciente: 'Activo',
            origen_registro: 'Recepción',
            consentimiento_comunicacion: true,
        });
        setStep(1);
        onClose();
    }

    function getFullEmail(): string {
        if (!form.email_local) return '';
        const domain = form.email_dominio === 'otro' ? form.email_custom_domain : form.email_dominio;
        return `${form.email_local}@${domain}`;
    }

    function getWhatsAppE164(): string {
        if (!form.whatsapp_numero) return '';
        return `${form.whatsapp_pais_code}${form.whatsapp_numero.replace(/\D/g, '')}`;
    }

    async function handleSubmit() {
        if (!form.apellido || !form.nombre) {
            alert('Nombre y Apellido son obligatorios');
            return;
        }

        setSaving(true);

        // Check for duplicates
        try {
            const emailCompleto = getFullEmail();
            let query = supabase.from('pacientes').select('id_paciente, nombre, apellido, documento, email').eq('is_deleted', false);

            const conditions: string[] = [];
            if (form.documento) conditions.push(`documento.eq.${form.documento}`);
            if (emailCompleto) conditions.push(`email.eq.${emailCompleto}`);

            if (conditions.length > 0) {
                const { data: existing } = await query.or(conditions.join(','));

                if (existing && existing.length > 0) {
                    const confirmMsg = `El paciente ya existe:\n\n${existing.map((p: any) => `- ${p.nombre} ${p.apellido} (DNI: ${p.documento || '-'})`).join('\n')}\n\nNo se puede crear un duplicado.`;
                    alert(confirmMsg);
                    setSaving(false);
                    return;
                }
            }
        } catch (checkError) {
            console.error('Error checking duplicates:', checkError);
        }

        try {
            const emailCompleto = getFullEmail();

            const { data, error } = await createPaciente({
                apellido: form.apellido,
                nombre: form.nombre,
                documento: form.documento || undefined,
                fecha_nacimiento: form.fecha_nacimiento || undefined,
                whatsapp_pais_code: form.whatsapp_pais_code,
                whatsapp_numero: form.whatsapp_numero || undefined,
                email_local: form.email_local || undefined,
                email_dominio: form.email_dominio === 'otro' ? form.email_custom_domain : form.email_dominio,
                email: emailCompleto || undefined,
                ciudad: form.ciudad || undefined,
                zona_barrio: form.zona_barrio || undefined,
                direccion: form.direccion || undefined,
                observaciones_generales: form.observaciones_generales || undefined,
                estado_paciente: form.estado_paciente,
                origen_registro: form.origen_registro,
                consentimiento_comunicacion: form.consentimiento_comunicacion,
            });

            if (error) throw error;

            // Send welcome email if consent and valid email
            if (form.consentimiento_comunicacion && emailCompleto && data) {
                const emailResult = await sendWelcomeEmail({
                    to_email: emailCompleto,
                    to_name: `${form.nombre} ${form.apellido}`,
                    message: generateWelcomeMessage(form.nombre),
                });

                await logEmail(
                    data.id_paciente,
                    'Bienvenida',
                    emailResult.success ? 'Enviado' : 'Fallido',
                    emailResult.error
                );
            }

            onSuccess();
            handleClose();
        } catch (err) {
            console.error('Error creating patient:', err);
            alert('Error al crear paciente');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <User size={20} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Nuevo Paciente
                            </h2>
                            <p className="text-xs text-gray-500">Paso {step} de 3</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-gray-100 dark:bg-gray-700 shrink-0">
                    <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* Step 1: Datos Personales */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                                Datos Personales
                            </h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Apellido *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.apellido}
                                        onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="Pérez"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Nombre *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.nombre}
                                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="Juan"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        DNI / Pasaporte
                                    </label>
                                    <input
                                        type="text"
                                        value={form.documento}
                                        onChange={(e) => setForm({ ...form, documento: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="12345678"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Fecha de Nacimiento
                                    </label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="date"
                                            value={form.fecha_nacimiento}
                                            onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Estado
                                    </label>
                                    <select
                                        value={form.estado_paciente}
                                        onChange={(e) => setForm({ ...form, estado_paciente: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    >
                                        {ESTADOS.map((e) => (
                                            <option key={e.value} value={e.value}>{e.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Origen del Registro
                                    </label>
                                    <select
                                        value={form.origen_registro}
                                        onChange={(e) => setForm({ ...form, origen_registro: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    >
                                        {ORIGENES.map((o) => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Contacto */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                                Datos de Contacto
                            </h3>

                            {/* WhatsApp */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    WhatsApp
                                </label>
                                <div className="flex gap-2">
                                    <select
                                        value={form.whatsapp_pais_code}
                                        onChange={(e) => setForm({ ...form, whatsapp_pais_code: e.target.value })}
                                        className="w-40 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    >
                                        {PAIS_CODES.map((p) => (
                                            <option key={p.code} value={p.code}>{p.label}</option>
                                        ))}
                                    </select>
                                    <div className="relative flex-1">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="tel"
                                            value={form.whatsapp_numero}
                                            onChange={(e) => setForm({ ...form, whatsapp_numero: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                            placeholder="1123456789"
                                        />
                                    </div>
                                </div>
                                {form.whatsapp_numero && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Formato E164: {getWhatsAppE164()}
                                    </p>
                                )}
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Email
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            value={form.email_local}
                                            onChange={(e) => setForm({ ...form, email_local: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                            placeholder="juanperez"
                                        />
                                    </div>
                                    <span className="self-center text-gray-400">@</span>
                                    <select
                                        value={form.email_dominio}
                                        onChange={(e) => setForm({ ...form, email_dominio: e.target.value })}
                                        className="w-40 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    >
                                        {EMAIL_DOMAINS.map((d) => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                                {form.email_dominio === 'otro' && (
                                    <input
                                        type="text"
                                        value={form.email_custom_domain}
                                        onChange={(e) => setForm({ ...form, email_custom_domain: e.target.value })}
                                        className="w-full mt-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="Ingrese dominio personalizado"
                                    />
                                )}
                                {form.email_local && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Email completo: {getFullEmail()}
                                    </p>
                                )}
                            </div>

                            {/* Ubicación */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Ciudad
                                    </label>
                                    <select
                                        value={form.ciudad}
                                        onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {CIUDADES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Zona / Barrio
                                    </label>
                                    <input
                                        type="text"
                                        value={form.zona_barrio}
                                        onChange={(e) => setForm({ ...form, zona_barrio: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="Palermo, Recoleta..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Dirección completa
                                </label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={form.direccion}
                                        onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="Av. Corrientes 1234, Piso 5"
                                    />
                                </div>
                            </div>

                            {/* Consentimiento */}
                            <label className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.consentimiento_comunicacion}
                                    onChange={(e) => setForm({ ...form, consentimiento_comunicacion: e.target.checked })}
                                    className="w-5 h-5 rounded border-gray-300"
                                />
                                <div>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        Acepta comunicaciones
                                    </span>
                                    <p className="text-xs text-gray-500">
                                        Enviar email de bienvenida y recordatorios
                                    </p>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Step 3: Confirmación */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                                Confirmar Datos
                            </h3>

                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Nombre completo:</span>
                                    <span className="font-medium">{form.apellido}, {form.nombre}</span>
                                </div>
                                {form.documento && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Documento:</span>
                                        <span className="font-medium">{form.documento}</span>
                                    </div>
                                )}
                                {form.fecha_nacimiento && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Fecha nacimiento:</span>
                                        <span className="font-medium">{new Date(form.fecha_nacimiento).toLocaleDateString('es-AR')}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Estado:</span>
                                    <span className="font-medium">{form.estado_paciente}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Origen:</span>
                                    <span className="font-medium">{form.origen_registro}</span>
                                </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                                {form.whatsapp_numero && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">WhatsApp:</span>
                                        <span className="font-medium">{getWhatsAppE164()}</span>
                                    </div>
                                )}
                                {form.email_local && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Email:</span>
                                        <span className="font-medium">{getFullEmail()}</span>
                                    </div>
                                )}
                                {form.ciudad && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Ciudad:</span>
                                        <span className="font-medium">{form.ciudad}</span>
                                    </div>
                                )}
                                {form.zona_barrio && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Zona:</span>
                                        <span className="font-medium">{form.zona_barrio}</span>
                                    </div>
                                )}
                            </div>

                            {form.consentimiento_comunicacion && form.email_local && (
                                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                        <Mail size={18} />
                                        <span className="font-medium">Se enviará email de bienvenida</span>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Observaciones generales
                                </label>
                                <textarea
                                    value={form.observaciones_generales}
                                    onChange={(e) => setForm({ ...form, observaciones_generales: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 resize-none"
                                    rows={3}
                                    placeholder="Notas adicionales sobre el paciente..."
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex justify-between shrink-0">
                    <button
                        onClick={() => step > 1 ? setStep(step - 1) : handleClose()}
                        className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                        <ChevronLeft size={18} />
                        {step === 1 ? 'Cancelar' : 'Anterior'}
                    </button>

                    {step < 3 ? (
                        <button
                            onClick={() => setStep(step + 1)}
                            disabled={step === 1 && (!form.apellido || !form.nombre)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium"
                        >
                            Siguiente
                            <ChevronRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium"
                        >
                            {saving ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Check size={18} />
                            )}
                            Guardar Paciente
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
