'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    ArrowRight,
    ArrowLeft,
    Check,
    Sparkles,
    Clock,
    User,
    Users,
    Mail,
    Phone,
    Calendar,
    IdCard,
    Stethoscope,
    Activity,
    AlertCircle,
    MessageCircle,
    CreditCard,
    MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdmissionTriggers } from '@/hooks/useAdmissionTriggers';
import { submitAdmissionAction, upsertAdmissionLeadAction } from '@/app/actions/admission';


// --- Types ---
type FormData = {
    // Identification
    id_paciente: string;
    firstName: string;
    lastName: string;
    dni: string;
    dob: string;

    // Contact
    countryCode: string;
    phone: string;
    email: string;

    // Medical
    underMedicalTreatment: boolean | null;
    medications: string;
    allergies: string;

    // Reasons/Discovery
    dentalReason: string;
    discoverySource: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;
type FormTouched = Partial<Record<keyof FormData, boolean>>;

// --- Constants ---
const COUNTRY_CODES = [
    { code: '+34', country: '🇪🇸' },
    { code: '+54', country: '🇦🇷' },
    { code: '+52', country: '🇲🇽' },
    { code: '+57', country: '🇨🇴' },
    { code: '+56', country: '🇨🇱' },
    { code: '+51', country: '🇵🇪' },
    { code: '+1', country: '🇺🇸' },
];

const EMAIL_DOMAINS = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com'];

const REASONS = [
    { id: 'estetica', label: 'Diseño de Sonrisa / Estética / Carillas' },
    { id: 'ortodoncia', label: 'Ortodoncia / Alineadores Invisibles' },
    { id: 'implantes', label: 'Implantes / Prótesis' },
    { id: 'control', label: 'Control / Limpieza' },
    { id: 'facial', label: 'Estética Facial / Botox, Rellenos, bioestimuladores' },
    { id: 'dolor', label: 'Urgencia / Dolor' },
    { id: 'otro', label: 'Otro' },
];

const DISCOVERY_SOURCES = [
    { id: 'recommendation', label: 'Recomendación de un amigo/familiar' },
    { id: 'search', label: 'Búsqueda en línea (Google, etc.)' },
    { id: 'social', label: 'Redes sociales (Instagram, Facebook, Tiktok)' },
    { id: 'ads', label: 'Publicidad/Anuncio' },
    { id: 'ai', label: 'Inteligencia Artificial (Gemini, ChatGPT, etc.)' },
    { id: 'other', label: 'Otro' },
];

// --- Components ---

const fadeInBlur = {
    initial: { opacity: 0, y: 20, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -20, filter: 'blur(10px)' },
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
};

const slideInBlur = {
    initial: (direction: number) => ({
        opacity: 0,
        x: direction > 0 ? 50 : -50,
        filter: 'blur(10px)'
    }),
    animate: {
        opacity: 1,
        x: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
    },
    exit: (direction: number) => ({
        opacity: 0,
        x: direction > 0 ? -50 : 50,
        filter: 'blur(10px)',
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
    })
};

const InputField = ({
    icon: Icon,
    type,
    placeholder,
    value,
    onChange,
    onBlur,
    error,
    touched,
    ...props
}: any) => {
    const showError = (touched || (value && value.length > 0)) && error;
    const [inputType, setInputType] = useState(type === 'date' ? 'text' : type);

    return (
        <div className="flex flex-col gap-1 w-full">
            <div className="relative group">
                <Icon className={`absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${showError ? 'text-red-500' : 'text-zinc-600 group-focus-within:text-white'}`} />
                <input
                    type={inputType}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    onFocus={() => {
                        if (type === 'date') setInputType('date');
                    }}
                    onBlur={(e) => {
                        if (type === 'date' && !e.target.value) setInputType('text');
                        if (onBlur) onBlur(e);
                    }}
                    className={`w-full bg-transparent border-b-2 py-4 pl-10 text-lg font-light text-white placeholder:text-zinc-600 focus:outline-none transition-colors ${showError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-white font-sans'} ${type === 'date' ? '[&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 invert' : ''}`}
                    {...props}
                />
            </div>
            <AnimatePresence>
                {showError && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -5, height: 0 }}
                        className="text-red-500 text-sm font-medium pl-10 pt-1 font-sans"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};


const ProgressBar = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => {
    const progress = (currentStep / (totalSteps - 1)) * 100;

    return (
        <div className="fixed top-0 left-0 w-full h-1 bg-white/5 z-50">
            <motion.div
                className="h-full bg-gradient-to-r from-zinc-500 to-zinc-100"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
        </div>
    );
};

export default function PremiumAdmissionForm() {
    const [step, setStep] = useState(0);
    const [formData, setFormData] = useState<FormData>({
        id_paciente: '',
        firstName: '',
        lastName: '',
        dni: '',
        dob: '',
        countryCode: '+54',
        phone: '',
        email: '',
        underMedicalTreatment: null,
        medications: '',
        allergies: '',
        dentalReason: '',
        discoverySource: '',
    });
    const [touched, setTouched] = useState<FormTouched>({});
    const [direction, setDirection] = useState(1);

    const {
        isOnline,
        queueCount,
        submitting,
        lastResult,
        flushQueue,
        submitWithTriggers,
    } = useAdmissionTriggers();

    // 0: Welcome, 1: Personal, 2: Medical, 3: Dental, 4: Discovery, 5: Success
    const totalSteps = 6;

    const updateData = (fields: Partial<FormData>) => {
        setFormData((prev) => ({ ...prev, ...fields }));
    };

    const handleBlur = (field: keyof FormData) => {
        setTouched((prev) => ({ ...prev, [field]: true }));
    };

    const persistLead = async () => {
        const payload = {
            id_paciente: formData.id_paciente || undefined,
            nombre: formData.firstName,
            apellido: formData.lastName,
            dni: formData.dni,
            email: formData.email,
            telefono: `${formData.countryCode}${formData.phone.replace(/\D/g, '')}`,
            motivo_consulta: REASONS.find(r => r.id === formData.dentalReason)?.label || formData.dentalReason,
            referencia_origen: DISCOVERY_SOURCES.find(s => s.id === formData.discoverySource)?.label || formData.discoverySource,
        };

        const response = await upsertAdmissionLeadAction(payload);
        if (response.success && response.patientId) {
            updateData({ id_paciente: response.patientId });
        }
    };

    const nextStep = () => {
        setDirection(1);
        setStep((s) => Math.min(s + 1, totalSteps - 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const prevStep = () => {
        setDirection(-1);
        setStep((s) => Math.max(s - 1, 0));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async () => {

        const healthAlerts: string[] = [];
        if (formData.allergies) healthAlerts.push(`Alergia: ${formData.allergies}`);
        if (formData.underMedicalTreatment) healthAlerts.push(`Medicación: ${formData.medications}`);

        const payload = {
            id_paciente: formData.id_paciente || undefined,
            nombre: formData.firstName,
            apellido: formData.lastName,
            dni: formData.dni,
            email: formData.email,
            telefono: `${formData.countryCode}${formData.phone.replace(/\D/g, '')}`,
            motivo_consulta: REASONS.find(r => r.id === formData.dentalReason)?.label || formData.dentalReason,
            referencia_origen: DISCOVERY_SOURCES.find(s => s.id === formData.discoverySource)?.label || formData.discoverySource,
            health_alerts: healthAlerts,
            health_notes: healthAlerts.join('\n'),
            mode: 'online' as const,
            // Existing schema might not have all these but we send them
            ciudad: 'CABA',
            zona_barrio: 'No especificado',
            profesional: 'Consulta con Dr. Ariel Merino'
        };

        const response = await submitWithTriggers(payload, {
            submitAction: submitAdmissionAction,
        });

        if (response.queued) {
            toast.warning('Sin conexión: admisión en cola. Se enviará automáticamente.');
            nextStep();
            return;
        }

        if (response.result?.success) {
            toast.success('Admisión enviada con éxito');
            nextStep();
        } else {
            toast.error(response.result?.error || 'Error al enviar admisión');
        }
    };

    const getErrors = (): FormErrors => {
        const errors: FormErrors = {};

        if (!formData.firstName.trim()) errors.firstName = 'El nombre es obligatorio';
        else if (formData.firstName.length < 2) errors.firstName = 'Mínimo 2 caracteres';

        if (!formData.lastName.trim()) errors.lastName = 'El apellido es obligatorio';
        else if (formData.lastName.length < 2) errors.lastName = 'Mínimo 2 caracteres';

        if (!formData.dni.trim()) errors.dni = 'El DNI/Pasaporte es obligatorio';
        else if (formData.dni.length < 5) errors.dni = 'DNI inválido';

        if (!formData.dob) errors.dob = 'La fecha de nacimiento es obligatoria';

        if (!formData.email.trim()) errors.email = 'El correo es obligatorio';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Correo electrónico inválido';

        if (!formData.phone.trim()) errors.phone = 'El WhatsApp es obligatorio';
        else if (!/^[\d\s\-\(\)]{6,}$/.test(formData.phone)) errors.phone = 'Número inválido';

        if (formData.underMedicalTreatment === true && !formData.medications.trim()) {
            errors.medications = 'Por favor, especifica la medicación';
        }

        return errors;
    };

    const errors = getErrors();

    // Signature logic removed as requested for basic admission

    // --- Step Renderers ---

    const renderWelcome = () => (
        <motion.div
            key="welcome"
            custom={direction}
            variants={slideInBlur}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col items-center justify-center text-center max-w-4xl mx-auto px-6 py-12 h-full min-h-[80vh]"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 1 }}
                className="mb-8"
            >
                <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 mx-auto">
                    <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h1 className="font-serif text-5xl md:text-7xl font-light mb-6 tracking-tight text-white leading-tight">
                    Bienvenido a la <br /><span className="italic">Experiencia AM</span>
                </h1>
                <p className="text-zinc-400 text-lg md:text-xl font-light max-w-xl mx-auto leading-relaxed">
                    Comencemos con tu proceso de admisión. Te tomará menos de 2 minutos completar tu información básica.
                </p>
            </motion.div>

            <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                onClick={nextStep}
                className="group relative px-12 py-5 bg-white text-black rounded-full font-medium text-lg uppercase tracking-widest overflow-hidden transition-all hover:scale-105 active:scale-95"
            >
                <span className="relative z-10 flex items-center gap-3">
                    Empezar Registro <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
            </motion.button>
        </motion.div>
    );

    const renderPersonal = () => {
        const isStepValid = !errors.firstName && !errors.lastName && !errors.dni && !errors.dob && !errors.email && !errors.phone;

        return (
            <motion.div
                variants={slideInBlur}
                custom={direction}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col max-w-2xl mx-auto px-6 py-12 w-full"
            >
                <div className="mb-12">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4 font-semibold font-sans">Paso 01</p>
                    <h2 className="font-serif text-4xl md:text-5xl font-light mb-4 text-white italic">Información Personal</h2>
                </div>

                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <InputField
                            icon={User}
                            type="text"
                            placeholder="Nombre"
                            value={formData.firstName}
                            onChange={(e: any) => updateData({ firstName: e.target.value })}
                            onBlur={() => handleBlur('firstName')}
                            error={errors.firstName}
                            touched={touched.firstName}
                        />
                        <InputField
                            icon={User}
                            type="text"
                            placeholder="Apellido"
                            value={formData.lastName}
                            onChange={(e: any) => updateData({ lastName: e.target.value })}
                            onBlur={() => handleBlur('lastName')}
                            error={errors.lastName}
                            touched={touched.lastName}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <InputField
                            icon={IdCard}
                            type="text"
                            placeholder="DNI / Pasaporte"
                            value={formData.dni}
                            onChange={(e: any) => updateData({ dni: e.target.value })}
                            onBlur={() => handleBlur('dni')}
                            error={errors.dni}
                            touched={touched.dni}
                        />
                        <InputField
                            icon={Calendar}
                            type="date"
                            placeholder="Fecha de Nacimiento"
                            value={formData.dob}
                            onChange={(e: any) => updateData({ dob: e.target.value })}
                            onBlur={() => handleBlur('dob')}
                            error={errors.dob}
                            touched={touched.dob}
                        />
                    </div>

                    <div className="relative">
                        <InputField
                            icon={Mail}
                            type="email"
                            placeholder="Correo Electrónico"
                            value={formData.email}
                            onChange={(e: any) => updateData({ email: e.target.value })}
                            onBlur={() => handleBlur('email')}
                            error={errors.email}
                            touched={touched.email}
                        />
                        <AnimatePresence>
                            {formData.email && !formData.email.includes('@') && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide"
                                >
                                    {EMAIL_DOMAINS.map(domain => (
                                        <button
                                            key={domain}
                                            onClick={() => {
                                                updateData({ email: formData.email + domain });
                                                handleBlur('email');
                                            }}
                                            className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
                                        >
                                            {domain}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex flex-col gap-1 w-full">
                        <div className="relative flex items-center group">
                            <MessageCircle className={`absolute left-0 w-5 h-5 transition-colors ${(touched.phone || formData.phone) && errors.phone ? 'text-red-500' : 'text-zinc-600 group-focus-within:text-white'}`} />
                            <select
                                value={formData.countryCode}
                                onChange={(e) => updateData({ countryCode: e.target.value })}
                                className="bg-transparent border-b-2 border-white/10 py-4 pl-8 pr-2 text-lg font-light text-white focus:outline-none focus:border-white appearance-none cursor-pointer z-10"
                                style={{ WebkitAppearance: 'none' }}
                            >
                                {COUNTRY_CODES.map(c => <option key={c.code} value={c.code} className="bg-zinc-900 text-base">{c.country} {c.code}</option>)}
                            </select>
                            <input
                                type="tel"
                                placeholder="Número de WhatsApp"
                                value={formData.phone}
                                onChange={(e) => updateData({ phone: e.target.value })}
                                onBlur={() => handleBlur('phone')}
                                className={`w-full bg-transparent border-b-2 py-4 pl-4 text-lg font-light text-white placeholder:text-zinc-600 focus:outline-none transition-colors ${(touched.phone || formData.phone) && errors.phone ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-white'}`}
                            />
                        </div>
                        <AnimatePresence>
                            {(touched.phone || formData.phone) && errors.phone && (
                                <motion.div
                                    initial={{ opacity: 0, y: -5, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0, y: -5, height: 0 }}
                                    className="text-red-500 text-sm font-medium pl-10 pt-1"
                                >
                                    {errors.phone}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="mt-16 flex items-center justify-between">
                    <button onClick={prevStep} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <button
                        onClick={() => {
                            setTouched({ firstName: true, lastName: true, dni: true, dob: true, email: true, phone: true });
                            if (isStepValid) nextStep();
                        }}
                        className={`px-8 py-3 rounded-full text-sm uppercase tracking-wider transition-all duration-500 flex items-center gap-2 ${isStepValid
                            ? 'bg-white text-black hover:scale-105'
                            : 'bg-white/5 text-zinc-600'
                            }`}
                    >
                        Siguiente <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        );
    };

    const renderMedical = () => {
        const isStepValid = formData.underMedicalTreatment !== null && !errors.medications;

        return (
            <motion.div
                variants={slideInBlur}
                custom={direction}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col max-w-2xl mx-auto px-6 py-12 w-full"
            >
                <div className="mb-12">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4 font-semibold font-sans">Paso 02</p>
                    <h2 className="font-serif text-4xl md:text-5xl font-light mb-4 text-white italic">Historial Médico</h2>
                </div>


                <div className="space-y-10">
                    <div>
                        <label className="block text-lg font-light text-white mb-4 flex items-center gap-3">
                            <Stethoscope className="w-5 h-5 text-zinc-500" />
                            ¿Estás bajo tratamiento médico actualmente?
                        </label>
                        <div className="flex gap-4">
                            <button
                                onClick={() => updateData({ underMedicalTreatment: true })}
                                className={`flex-1 py-4 rounded-xl border transition-all duration-300 ${formData.underMedicalTreatment === true
                                    ? 'border-white bg-white text-black font-medium'
                                    : 'border-white/10 text-zinc-400 hover:border-white/30 hover:bg-white/[0.02]'
                                    }`}
                            >
                                Sí
                            </button>
                            <button
                                onClick={() => {
                                    updateData({ underMedicalTreatment: false, medications: '' });
                                    setTouched((prev) => ({ ...prev, medications: false }));
                                }}
                                className={`flex-1 py-4 rounded-xl border transition-all duration-300 ${formData.underMedicalTreatment === false
                                    ? 'border-white bg-white text-black font-medium'
                                    : 'border-white/10 text-zinc-400 hover:border-white/30 hover:bg-white/[0.02]'
                                    }`}
                            >
                                No
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {formData.underMedicalTreatment && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-2">
                                    <InputField
                                        icon={Activity}
                                        type="text"
                                        placeholder="¿Qué medicación tomas? (Obligatorio)"
                                        value={formData.medications}
                                        onChange={(e: any) => updateData({ medications: e.target.value })}
                                        onBlur={() => handleBlur('medications')}
                                        error={errors.medications}
                                        touched={touched.medications}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <InputField
                        icon={AlertCircle}
                        type="text"
                        placeholder="¿Tienes alguna alergia? (ej. Penicilina, Anestesia)"
                        value={formData.allergies}
                        onChange={(e: any) => updateData({ allergies: e.target.value })}
                        onBlur={() => handleBlur('allergies')}
                        error={errors.allergies}
                        touched={touched.allergies}
                    />
                </div>

                <div className="mt-16 flex items-center justify-between">
                    <button onClick={prevStep} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <button
                        onClick={() => {
                            if (formData.underMedicalTreatment === true) setTouched((prev) => ({ ...prev, medications: true }));
                            if (isStepValid) nextStep();
                        }}
                        className={`px-8 py-3 rounded-full text-sm uppercase tracking-wider transition-all duration-500 flex items-center gap-2 ${isStepValid
                            ? 'bg-white text-black hover:scale-105'
                            : 'bg-white/5 text-zinc-600'
                            }`}
                    >
                        Siguiente <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        );
    };

    const renderDental = () => {
        const isStepValid = formData.dentalReason !== '';

        return (
            <motion.div
                variants={slideInBlur}
                custom={direction}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col max-w-2xl mx-auto px-6 py-12 w-full"
            >
                <div className="mb-12">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4 font-semibold font-sans">Paso 03</p>
                    <h2 className="font-serif text-4xl md:text-5xl font-light mb-4 text-white italic">¿Qué te trae por aquí?</h2>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {REASONS.map((reason) => {
                        const isSelected = formData.dentalReason === reason.id;
                        return (
                            <button
                                key={reason.id}
                                onClick={() => updateData({ dentalReason: reason.id })}
                                className={`text-left p-4 rounded-xl border transition-all duration-300 flex items-center justify-between ${isSelected
                                    ? 'border-white bg-white/5'
                                    : 'border-white/10 hover:border-white/30 hover:bg-white/[0.02]'
                                    }`}
                            >
                                <span className={`text-base font-light ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                                    {reason.label}
                                </span>
                                {isSelected && <Check className="w-4 h-4 text-white" />}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-16 flex items-center justify-between">
                    <button onClick={prevStep} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <button
                        onClick={() => isStepValid && nextStep()}
                        className={`px-8 py-3 rounded-full text-sm uppercase tracking-wider transition-all duration-500 flex items-center gap-2 ${isStepValid
                            ? 'bg-white text-black hover:scale-105'
                            : 'bg-white/5 text-zinc-600'
                            }`}
                    >
                        Siguiente <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        );
    };

    const renderDiscovery = () => {
        const isStepValid = formData.discoverySource !== '';

        return (
            <motion.div
                variants={slideInBlur}
                custom={direction}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col max-w-2xl mx-auto px-6 py-12 w-full"
            >
                <div className="mb-12">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4 font-semibold font-sans">Paso 04</p>
                    <h2 className="font-serif text-4xl md:text-5xl font-light mb-4 text-white italic">¿Cómo te enteraste de nosotros?</h2>
                </div>


                <div className="grid grid-cols-1 gap-4">
                    {DISCOVERY_SOURCES.map((source) => {
                        const isSelected = formData.discoverySource === source.id;
                        return (
                            <button
                                key={source.id}
                                onClick={() => updateData({ discoverySource: source.id })}
                                className={`text-left p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${isSelected
                                    ? 'border-white bg-white/5'
                                    : 'border-white/10 hover:border-white/30 hover:bg-white/[0.02]'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'border-white bg-white text-black' : 'border-zinc-600'
                                        }`}>
                                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-black" />}
                                    </div>
                                    <h3 className={`text-lg font-medium transition-colors ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                        {source.label}
                                    </h3>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-16 flex items-center justify-between">
                    <button onClick={prevStep} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !isStepValid}
                        className={`px-8 py-3 rounded-full text-sm uppercase tracking-wider transition-all duration-500 flex items-center gap-2 ${isStepValid && !submitting
                            ? 'bg-white text-black hover:scale-105'
                            : 'bg-white/5 text-zinc-600'
                            }`}
                    >
                        {submitting ? 'Enviando...' : 'Finalizar'} <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        );
    };

    // renderConsentAndSignature removed

    const renderSuccess = () => (
        <motion.div
            variants={slideInBlur}
            custom={direction}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 h-full min-h-[70vh] py-12"
        >

            <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.8, type: 'spring' }}
                className="w-24 h-24 rounded-full border border-white/20 flex items-center justify-center mb-8 bg-white/5 backdrop-blur-sm shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
                <Check className="w-10 h-10 text-white" strokeWidth={1.5} />
            </motion.div>
            <h2 className="font-serif text-4xl md:text-5xl font-light mb-6 text-white text-center">¡Gracias, {formData.firstName || 'paciente'}!</h2>
            <p className="text-zinc-400 text-lg font-light max-w-md leading-relaxed mb-12">
                Hemos recibido tus datos correctamente. Estamos felices de recibirte en AM Estética Dental.
            </p>

            {/* Reception Links Grid */}
            <div className="w-full space-y-6 text-left max-w-md">
                <h3 className="text-xl font-medium text-white mb-6 text-center">Para confirmar tu cita, sigue estos pasos:</h3>

                <div className="space-y-3">
                    <p className="text-sm font-medium text-zinc-400 uppercase tracking-wider ml-1">1. Realiza el pago</p>

                    <a href="https://mpago.la/2rjmF2W" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center shrink-0"><User className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-blue-400 transition-colors">Consulta Dr. Merino</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Abonar mediante MercadoPago</p>
                            </div>
                        </div>
                    </a>

                    <a href="https://mpago.la/2MJhrW6" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-purple-500/50 hover:bg-purple-500/10 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-purple-400 transition-colors">Consulta Staff Médico</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Abonar mediante MercadoPago</p>
                            </div>
                        </div>
                    </a>
                </div>

                <div className="space-y-3 pt-4">
                    <p className="text-sm font-medium text-zinc-400 uppercase tracking-wider ml-1">2. Reserva tu horario</p>
                    <a href="https://calendar.app.google/oc4VZPzsDkhwB3r58" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center shrink-0"><Calendar className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-emerald-400 transition-colors">Agendar turno online</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Presencial o videollamada</p>
                            </div>
                        </div>
                    </a>

                    <a href="https://wa.link/zolb52" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-green-500/50 hover:bg-green-500/10 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center shrink-0"><MessageCircle className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-green-400 transition-colors">Agendar por WhatsApp</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Habla con una ejecutiva</p>
                            </div>
                        </div>
                    </a>
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen bg-[#000000] text-white selection:bg-white/30 font-sans relative overflow-hidden flex flex-col">
            {/* Background Effects */}
            <div className="fixed inset-0 bg-noise pointer-events-none z-0" />
            <div className="fixed inset-0 bg-grid-white opacity-[0.03] pointer-events-none z-0" />

            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '12s' }} />
            <div className="fixed top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-emerald-500/5 blur-[100px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '10s' }} />


            {step > 0 && step < totalSteps - 1 && (
                <ProgressBar currentStep={step} totalSteps={totalSteps - 1} />
            )}

            {/* Header */}
            <header className="absolute top-0 left-0 w-full p-6 md:p-10 flex justify-between items-center z-40">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center shadow-lg overflow-hidden">
                        <img src="/logo.png" alt="AM" className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                    </div>
                    <div className="font-serif text-xl tracking-widest uppercase">AM Estética</div>
                </div>
                {!isOnline && (
                    <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-xs font-medium border border-amber-500/20">
                        <Clock className="w-3 h-3" /> Offline
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative z-10 pt-24 pb-12">
                <AnimatePresence mode="wait" custom={direction}>
                    {step === 0 && renderWelcome()}
                    {step === 1 && renderPersonal()}
                    {step === 2 && renderMedical()}
                    {step === 3 && renderDental()}
                    {step === 4 && renderDiscovery()}
                    {step === 5 && renderSuccess()}
                </AnimatePresence>
            </main>
        </div>
    );
}
