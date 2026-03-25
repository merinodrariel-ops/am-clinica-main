'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowRight, ArrowLeft, User, Mail, Phone, MapPin, Briefcase, Building2, CreditCard, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { registerPrestadorPublico } from '@/app/actions/prestador-registro';
import { type PrestadorAutoRegistroInput } from '@/app/actions/prestador-registro';

// --- Animation variants ---
const fadeInBlur = {
    initial: { opacity: 0, y: 20, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -20, filter: 'blur(10px)' },
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
};

// --- Types ---
type FormData = {
    nombre: string;
    apellido: string;
    documento: string;
    fecha_nacimiento: string;
    email: string;
    whatsapp: string;
    direccion: string;
    barrio_localidad: string;
    tipo_trabajo: string;
    condicion_afip: '' | 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    cbu: string;
    cbu_alias: string;
    cuit: string;
};

const INITIAL_FORM: FormData = {
    nombre: '',
    apellido: '',
    documento: '',
    fecha_nacimiento: '',
    email: '',
    whatsapp: '',
    direccion: '',
    barrio_localidad: '',
    tipo_trabajo: '',
    condicion_afip: '',
    cbu: '',
    cbu_alias: '',
    cuit: '',
};

const TIPO_TRABAJO_OPTIONS = [
    'Odontología',
    'Laboratorio Dental',
    'Asistente Dental',
    'Limpieza',
    'Recepción / Administración',
    'Kinesiología / Fisioterapia',
    'Otro',
];

const CONDICION_AFIP_OPTIONS: { id: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro'; label: string }[] = [
    { id: 'monotributista', label: 'Monotributista' },
    { id: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { id: 'relacion_dependencia', label: 'Relación de Dependencia' },
    { id: 'otro', label: 'Otro' },
];

const STEP_NAMES = ['Datos personales', 'Contacto', 'Perfil profesional', 'Datos bancarios'];

// --- Sub-components ---

const InputWrapper = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-xs text-white/50 uppercase tracking-wide">{label}</label>
        {children}
    </div>
);

const inputClass =
    'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors w-full';

// --- Main Component ---

export default function RegistroPrestadorForm() {
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<FormData>(INITIAL_FORM);
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
        setSubmitError('');
    };

    const setDirect = (field: keyof FormData, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setSubmitError('');
    };

    const validateStep = (): string => {
        if (step === 0) {
            if (!form.nombre.trim()) return 'El nombre es requerido.';
            if (!form.apellido.trim()) return 'El apellido es requerido.';
            if (!form.documento.trim()) return 'El documento es requerido.';
        }
        if (step === 1) {
            if (!form.email.trim()) return 'El email es requerido.';
            if (!form.whatsapp.trim()) return 'El WhatsApp es requerido.';
        }
        if (step === 2) {
            if (!form.tipo_trabajo) return 'Seleccioná el tipo de trabajo.';
        }
        return '';
    };

    const handleNext = () => {
        const err = validateStep();
        if (err) {
            setSubmitError(err);
            return;
        }
        setSubmitError('');
        setStep((s) => s + 1);
    };

    const handleBack = () => {
        setSubmitError('');
        setStep((s) => s - 1);
    };

    const handleSubmit = async () => {
        const err = validateStep();
        if (err) {
            setSubmitError(err);
            return;
        }
        setIsSubmitting(true);
        setSubmitError('');

        const payload: PrestadorAutoRegistroInput = {
            nombre: form.nombre,
            apellido: form.apellido,
            documento: form.documento,
            fecha_nacimiento: form.fecha_nacimiento || undefined,
            email: form.email,
            whatsapp: '+54' + form.whatsapp,
            direccion: form.direccion || undefined,
            barrio_localidad: form.barrio_localidad || undefined,
            tipo_trabajo: form.tipo_trabajo,
            condicion_afip: form.condicion_afip || undefined,
            cbu: form.cbu || undefined,
            cbu_alias: form.cbu_alias || undefined,
            cuit: form.cuit || undefined,
        };

        const result = await registerPrestadorPublico(payload);
        setIsSubmitting(false);

        if (result.error) {
            toast.error(result.error);
            setSubmitError(result.error);
            return;
        }

        setSuccess(true);
    };

    // --- Success screen ---
    if (success) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-4">
                <motion.div
                    {...fadeInBlur}
                    className="flex flex-col items-center gap-6 text-center max-w-sm"
                >
                    <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-10 h-10 text-black" strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-semibold text-white">¡Todo listo!</h1>
                        <p className="text-white/50 leading-relaxed">
                            Tus datos fueron recibidos. Te enviamos un email para que puedas crear tu contraseña y acceder al portal de AM Clínica.
                        </p>
                        <p className="text-white/30 text-sm mt-1">
                            Revisá tu bandeja de entrada (y spam, por las dudas).
                        </p>
                    </div>
                </motion.div>
                <p className="text-white/20 text-xs text-center mt-10">AM Clínica — Registro de Prestadores</p>
            </div>
        );
    }

    // --- Progress bar ---
    const ProgressBar = () => (
        <div className="flex flex-col gap-2 mb-8">
            <div className="flex gap-1.5">
                {STEP_NAMES.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                            i <= step ? 'bg-white' : 'bg-white/10'
                        }`}
                    />
                ))}
            </div>
            <p className="text-xs text-white/40">
                Paso {step + 1} de {STEP_NAMES.length} — {STEP_NAMES[step]}
            </p>
        </div>
    );

    // --- Step panels ---
    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <InputWrapper label="Nombre">
                                <input
                                    className={inputClass}
                                    placeholder="Juan"
                                    value={form.nombre}
                                    onChange={set('nombre')}
                                />
                            </InputWrapper>
                            <InputWrapper label="Apellido">
                                <input
                                    className={inputClass}
                                    placeholder="Pérez"
                                    value={form.apellido}
                                    onChange={set('apellido')}
                                />
                            </InputWrapper>
                        </div>
                        <InputWrapper label="DNI / Documento">
                            <input
                                className={inputClass}
                                placeholder="30123456"
                                inputMode="numeric"
                                value={form.documento}
                                onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, '');
                                    setDirect('documento', v);
                                }}
                            />
                        </InputWrapper>
                        <InputWrapper label="Fecha de nacimiento (opcional)">
                            <input
                                className={inputClass}
                                type="date"
                                value={form.fecha_nacimiento}
                                onChange={set('fecha_nacimiento')}
                            />
                        </InputWrapper>
                    </div>
                );

            case 1:
                return (
                    <div className="flex flex-col gap-4">
                        <InputWrapper label="Email">
                            <input
                                className={inputClass}
                                type="email"
                                placeholder="juan@ejemplo.com"
                                value={form.email}
                                onChange={set('email')}
                            />
                        </InputWrapper>
                        <InputWrapper label="WhatsApp">
                            <div className="flex items-center gap-2">
                                <span className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/60 text-sm whitespace-nowrap select-none">
                                    +54
                                </span>
                                <input
                                    className={inputClass}
                                    placeholder="1123456789"
                                    inputMode="numeric"
                                    value={form.whatsapp}
                                    onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, '');
                                        setDirect('whatsapp', v);
                                    }}
                                />
                            </div>
                        </InputWrapper>
                        <InputWrapper label="Dirección (opcional)">
                            <input
                                className={inputClass}
                                placeholder="Av. Corrientes 1234"
                                value={form.direccion}
                                onChange={set('direccion')}
                            />
                        </InputWrapper>
                        <InputWrapper label="Barrio / Localidad (opcional)">
                            <input
                                className={inputClass}
                                placeholder="Palermo"
                                value={form.barrio_localidad}
                                onChange={set('barrio_localidad')}
                            />
                        </InputWrapper>
                    </div>
                );

            case 2:
                return (
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-white/50 uppercase tracking-wide">Tipo de trabajo</label>
                            <div className="grid grid-cols-2 gap-2">
                                {TIPO_TRABAJO_OPTIONS.map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setDirect('tipo_trabajo', opt)}
                                        className={`rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
                                            form.tipo_trabajo === opt
                                                ? 'bg-white text-black font-medium'
                                                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                                        }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-white/50 uppercase tracking-wide">Condición AFIP (opcional)</label>
                            <div className="grid grid-cols-2 gap-2">
                                {CONDICION_AFIP_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() =>
                                            setDirect(
                                                'condicion_afip',
                                                form.condicion_afip === opt.id ? '' : opt.id
                                            )
                                        }
                                        className={`rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
                                            form.condicion_afip === opt.id
                                                ? 'bg-white text-black font-medium'
                                                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="flex flex-col gap-4">
                        <p className="text-white/40 text-sm -mt-1">Todos los campos son opcionales. Podés completarlos luego.</p>
                        <InputWrapper label="CBU">
                            <input
                                className={`${inputClass} font-mono`}
                                placeholder="0000000000000000000000"
                                inputMode="numeric"
                                maxLength={22}
                                value={form.cbu}
                                onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 22);
                                    setDirect('cbu', v);
                                }}
                            />
                        </InputWrapper>
                        <InputWrapper label="Alias CBU">
                            <input
                                className={inputClass}
                                placeholder="juan.perez.banco"
                                value={form.cbu_alias}
                                onChange={set('cbu_alias')}
                            />
                        </InputWrapper>
                        <InputWrapper label="CUIT / CUIL">
                            <input
                                className={inputClass}
                                placeholder="20-30123456-7"
                                inputMode="numeric"
                                value={form.cuit}
                                onChange={set('cuit')}
                            />
                        </InputWrapper>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                {/* Header */}
                <motion.div {...fadeInBlur} className="mb-8 text-center">
                    <h1 className="text-2xl font-semibold text-white mb-1">Registro de Prestadores</h1>
                    <p className="text-white/40 text-sm">AM Clínica</p>
                </motion.div>

                {/* Card */}
                <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm p-6">
                    <ProgressBar />

                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={step}
                            {...fadeInBlur}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>

                    {/* Error message */}
                    {submitError && (
                        <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 mt-4 text-red-400 text-sm"
                        >
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {submitError}
                        </motion.div>
                    )}

                    {/* Navigation */}
                    <div className="flex gap-3 mt-6">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={handleBack}
                                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white/70 text-sm hover:bg-white/10 transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Volver
                            </button>
                        )}
                        {step < 3 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                className="flex-1 flex items-center justify-center gap-2 bg-white text-black rounded-xl px-5 py-3 text-sm font-medium hover:bg-white/90 transition-colors"
                            >
                                Continuar
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex-1 flex items-center justify-center gap-2 bg-white text-black rounded-xl px-5 py-3 text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Enviando…' : 'Enviar registro'}
                                {!isSubmitting && <Check className="w-4 h-4" />}
                            </button>
                        )}
                    </div>
                </div>

                {/* Branding */}
                <p className="text-white/20 text-xs text-center mt-6">AM Clínica — Registro de Prestadores</p>
            </div>
        </div>
    );
}
