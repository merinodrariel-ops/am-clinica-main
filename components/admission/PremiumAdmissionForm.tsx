'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'next/navigation';
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
    Navigation,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdmissionTriggers } from '@/hooks/useAdmissionTriggers';
import { submitAdmissionAction, upsertAdmissionLeadAction, checkAdmissionIdentityAction } from '@/app/actions/admission';
import { ADMISSION_BOOKING_PATHS } from '@/lib/admission-booking-links';


// --- Types ---
type FormData = {
    // Identification
    id_paciente: string;
    firstName: string;
    lastName: string;
    dni: string;
    cuit: string;
    dob: string;

    // Location
    city: string;
    neighborhood: string;

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
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
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
        transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
    },
    exit: (direction: number) => ({
        opacity: 0,
        x: direction > 0 ? -50 : 50,
        filter: 'blur(10px)',
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }
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
    submitAttempted,
    ...props
}: any) => {
    // Only show errors when:
    // 1. User clicked "Next" (submitAttempted) — shows all errors including 'required'
    // 2. Field was blurred AND has content — shows format/length errors only
    const isEmpty = !value || (typeof value === 'string' && !value.trim());
    const isRequiredError = error && isEmpty;
    const showError = submitAttempted ? !!error : (touched && !isEmpty && !!error && !isRequiredError);
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
                    className={`w-full bg-transparent border-b-2 py-4 pl-10 text-lg font-light text-white placeholder:text-zinc-600 focus:outline-none transition-colors font-sans ${showError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-white'} ${type === 'date' ? '[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100' : ''}`}
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
    const searchParams = useSearchParams();
    const [step, setStep] = useState(0);
    const [formData, setFormData] = useState<FormData>({
        id_paciente: '',
        firstName: '',
        lastName: '',
        dni: '',
        cuit: '',
        dob: '',
        city: '',
        neighborhood: '',
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
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [direction, setDirection] = useState(1);
    const [isValidating, setIsValidating] = useState(false);
    const [identityState, setIdentityState] = useState<{
        status: 'idle' | 'checking' | 'ok' | 'exists' | 'error';
        message?: string;
        patientName?: string;
    }>({ status: 'idle' });
    const lastIdentitySignatureRef = useRef('');
    const lastIdentityExistsRef = useRef(false);

    const allowDuplicateForTesting =
        process.env.NODE_ENV !== 'production'
        && (searchParams.get('allowDuplicates') === '1' || process.env.NEXT_PUBLIC_ADMISSION_ALLOW_DUPLICATES === 'true');

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
        if (Object.prototype.hasOwnProperty.call(fields, 'dni') || Object.prototype.hasOwnProperty.call(fields, 'email')) {
            setIdentityState((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }));
        }
        setFormData((prev) => ({ ...prev, ...fields }));
    };

    const handleBlur = (field: keyof FormData) => {
        setTouched((prev) => ({ ...prev, [field]: true }));
    };

    const identitySignature = useMemo(() => {
        const dni = formData.dni.replace(/\D/g, '');
        const email = formData.email.trim().toLowerCase();
        return `${dni}|${email}`;
    }, [formData.dni, formData.email]);

    const canCheckIdentity = useMemo(() => {
        const dni = formData.dni.replace(/\D/g, '');
        const email = formData.email.trim();
        const hasValidDni = dni.length >= 7 && dni.length <= 14;
        const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        return hasValidDni || hasValidEmail;
    }, [formData.dni, formData.email]);

    const runIdentityCheck = useCallback(async (force = false) => {
        if (!canCheckIdentity) {
            setIdentityState((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }));
            return true;
        }

        if (!force && identitySignature === lastIdentitySignatureRef.current) {
            return !lastIdentityExistsRef.current;
        }

        lastIdentitySignatureRef.current = identitySignature;
        setIdentityState({ status: 'checking' });

        try {
            const res = await checkAdmissionIdentityAction({ dni: formData.dni, email: formData.email });

            if (!res.success) {
                lastIdentityExistsRef.current = false;
                setIdentityState({
                    status: 'error',
                    message: res.error || 'No se pudo validar identidad en este momento.',
                });
                return false;
            }

            if (res.exists) {
                lastIdentityExistsRef.current = true;
                const patientName = [res.patient?.nombre, res.patient?.apellido].filter(Boolean).join(' ').trim();
                setIdentityState({
                    status: 'exists',
                    patientName,
                    message: patientName
                        ? `Ya existe un paciente registrado: ${patientName}.`
                        : 'Este DNI o correo ya se encuentra registrado.',
                });
                return allowDuplicateForTesting;
            }

            lastIdentityExistsRef.current = false;
            setIdentityState({ status: 'ok', message: 'DNI y correo disponibles.' });
            return true;
        } catch (error) {
            lastIdentityExistsRef.current = false;
            setIdentityState({
                status: 'error',
                message: error instanceof Error ? error.message : 'Error inesperado de validación',
            });
            return false;
        }
    }, [allowDuplicateForTesting, canCheckIdentity, formData.dni, formData.email, identitySignature]);

    useEffect(() => {
        if (step !== 1 || !canCheckIdentity) return;

        const timeout = window.setTimeout(() => {
            void runIdentityCheck(false);
        }, 450);

        return () => window.clearTimeout(timeout);
    }, [step, canCheckIdentity, identitySignature, runIdentityCheck]);

    const persistLead = async () => {
        const payload = {
            id_paciente: formData.id_paciente || undefined,
            nombre: formData.firstName,
            apellido: formData.lastName,
            dni: formData.dni,
            email: formData.email,
            whatsapp: `${formData.countryCode}${formData.phone.replace(/\D/g, '')}`,
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
        setSubmitAttempted(false);
        setStep((s) => Math.min(s + 1, totalSteps - 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const prevStep = () => {
        setDirection(-1);
        setSubmitAttempted(false);
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
            cuit: formData.cuit.replace(/\D/g, '') || undefined,
            email: formData.email,
            whatsapp: `${formData.countryCode}${formData.phone.replace(/\D/g, '')}`,
            motivo_consulta: REASONS.find(r => r.id === formData.dentalReason)?.label || formData.dentalReason,
            referencia_origen: DISCOVERY_SOURCES.find(s => s.id === formData.discoverySource)?.label || formData.discoverySource,
            referencia_recomendado_por: undefined,
            fecha_nacimiento: formData.dob || undefined,
            health_alerts: healthAlerts,
            health_notes: healthAlerts.join('\n'),
            mode: 'online' as const,
            ciudad: formData.city || 'No especificado',
            zona_barrio: formData.neighborhood || 'No especificado',
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

        if (!formData.firstName.trim()) errors.firstName = 'Ingresa tu nombre';
        else if (formData.firstName.length < 2) errors.firstName = 'Ingresa al menos 2 letras';

        if (!formData.lastName.trim()) errors.lastName = 'Ingresa tu apellido';
        else if (formData.lastName.length < 2) errors.lastName = 'Ingresa al menos 2 letras';

        const dniTrimmed = formData.dni.trim();
        const dniDigits = formData.dni.replace(/\D/g, '');
        if (!dniTrimmed) errors.dni = 'Ingresa tu DNI o Pasaporte';
        else if (dniDigits.length < 7 || dniDigits.length > 14) errors.dni = 'DNI inválido (7 a 14 dígitos)';

        const cuitDigits = (formData.cuit || '').replace(/\D/g, '');
        if (!cuitDigits) errors.cuit = 'Ingresa tu CUIT/CUIL';
        else if (cuitDigits.length !== 11) errors.cuit = 'CUIT/CUIL debe tener 11 dígitos';

        if (!formData.dob) errors.dob = 'Selecciona tu fecha de nacimiento';

        if (!formData.city?.trim()) errors.city = 'Ingresa tu ciudad';
        if (!formData.neighborhood?.trim()) errors.neighborhood = 'Ingresa tu barrio o zona';

        if (!formData.email.trim()) errors.email = 'Ingresa tu correo electrónico';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Ingresa un correo válido (ej: nombre@gmail.com)';

        if (!formData.phone.trim()) errors.phone = 'Ingresa tu número de WhatsApp';
        else if (!/^[\d\s\-\(\)]{6,}$/.test(formData.phone)) errors.phone = 'Ingresa un número válido (mínimo 6 dígitos)';

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
        const isStepValid = !errors.firstName && !errors.lastName && !errors.dni && !errors.cuit && !errors.dob && !errors.city && !errors.neighborhood && !errors.email && !errors.phone;

        return (
            <motion.div
                key="personal"
                variants={slideInBlur}
                custom={direction}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col max-w-2xl mx-auto px-6 py-12 w-full"
            >
                <div className="mb-12">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4 font-semibold font-sans">Paso 01</p>
                    <h2 className="font-serif text-4xl md:text-5xl font-light mb-4 text-white italic">Datos Personales</h2>
                    <p className="text-zinc-400 font-light">Información básica para tu expediente clínico.</p>
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
                            submitAttempted={submitAttempted}
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
                            submitAttempted={submitAttempted}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <InputField
                            icon={IdCard}
                            type="text"
                            placeholder="DNI / Pasaporte"
                            value={formData.dni}
                            onChange={(e: any) => updateData({ dni: e.target.value })}
                            onBlur={async () => {
                                handleBlur('dni');
                                await runIdentityCheck(true);
                            }}
                            error={errors.dni}
                            touched={touched.dni}
                            submitAttempted={submitAttempted}
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
                            submitAttempted={submitAttempted}
                        />
                    </div>

                    <InputField
                        icon={IdCard}
                        type="text"
                        placeholder="CUIT / CUIL (ej: 20-12345678-9)"
                        value={formData.cuit}
                        onChange={(e: any) => {
                            // Auto-format: strip non-digits then insert dashes at positions 2 and 10
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
                            const formatted = raw.length <= 2 ? raw
                                : raw.length <= 10 ? `${raw.slice(0,2)}-${raw.slice(2)}`
                                : `${raw.slice(0,2)}-${raw.slice(2,10)}-${raw.slice(10)}`;
                            updateData({ cuit: formatted });
                        }}
                        onBlur={() => handleBlur('cuit')}
                        error={errors.cuit}
                        touched={touched.cuit}
                        submitAttempted={submitAttempted}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <InputField
                            icon={MapPin}
                            type="text"
                            placeholder="Ciudad"
                            value={formData.city}
                            onChange={(e: any) => updateData({ city: e.target.value })}
                            onBlur={() => handleBlur('city')}
                            error={errors.city}
                            touched={touched.city}
                            submitAttempted={submitAttempted}
                        />
                        <InputField
                            icon={MapPin}
                            type="text"
                            placeholder="Barrio / Zona"
                            value={formData.neighborhood}
                            onChange={(e: any) => updateData({ neighborhood: e.target.value })}
                            onBlur={() => handleBlur('neighborhood')}
                            error={errors.neighborhood}
                            touched={touched.neighborhood}
                            submitAttempted={submitAttempted}
                        />
                    </div>

                    <div className="relative">
                        <InputField
                            icon={Mail}
                            type="email"
                            placeholder="Correo Electrónico"
                            value={formData.email}
                            onChange={(e: any) => updateData({ email: e.target.value })}
                            onBlur={async () => {
                                handleBlur('email');
                                await runIdentityCheck(true);
                            }}
                            error={errors.email}
                            touched={touched.email}
                            submitAttempted={submitAttempted}
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
                            <MessageCircle className={`absolute left-0 w-5 h-5 transition-colors ${submitAttempted && errors.phone ? 'text-red-500' : 'text-zinc-600 group-focus-within:text-white'}`} />
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
                                className={`w-full bg-transparent border-b-2 py-4 pl-4 text-lg font-light text-white placeholder:text-zinc-600 focus:outline-none transition-colors ${submitAttempted && errors.phone ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-white'}`}
                            />
                        </div>
                        <AnimatePresence>
                            {submitAttempted && errors.phone && (
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

                    <AnimatePresence>
                        {identityState.status !== 'idle' && identityState.status !== 'ok' && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                className={`rounded-xl border px-4 py-3 text-sm ${identityState.status === 'exists'
                                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                                    : identityState.status === 'checking'
                                        ? 'border-white/20 bg-white/5 text-zinc-300'
                                        : 'border-red-500/40 bg-red-500/10 text-red-200'
                                    }`}
                            >
                                {identityState.status === 'checking'
                                    ? 'Validando si ya existe un paciente con ese DNI/email...'
                                    : identityState.message}
                                {identityState.status === 'exists' && (
                                    <div className="mt-2 text-xs text-amber-100/80">
                                        Si ya sos paciente, usá el formulario de actualización de datos.
                                        {allowDuplicateForTesting && ' (Modo prueba activo: podés continuar igualmente).'}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="mt-16 flex items-center justify-between">
                    <button onClick={prevStep} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <button
                        disabled={isValidating}
                        onClick={async () => {
                            setSubmitAttempted(true);
                            setTouched({ firstName: true, lastName: true, dni: true, dob: true, city: true, neighborhood: true, email: true, phone: true });
                            if (isStepValid) {
                                setIsValidating(true);
                                try {
                                    const canContinue = await runIdentityCheck(true);
                                    if (!canContinue) {
                                        toast.error('Este DNI o correo ya se encuentra registrado.', {
                                            description: 'Si ya sos paciente, por favor contactanos por WhatsApp para agendar tu cita.'
                                        });
                                        setIsValidating(false);
                                        return;
                                    }

                                    if (identityState.status === 'exists' && allowDuplicateForTesting) {
                                        toast.warning('Modo prueba activo: continuando con identidad duplicada.');
                                    }

                                    nextStep();
                                } catch (error) {
                                    toast.error('Error al validar los datos. Por favor intentá nuevamente.');
                                    console.error(error);
                                } finally {
                                    setIsValidating(false);
                                }
                            }
                        }}
                        className={`px-8 py-3 rounded-full text-sm uppercase tracking-wider transition-all duration-500 flex items-center gap-2 ${isStepValid && !isValidating
                            ? 'bg-white text-black hover:scale-105'
                            : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                            }`}
                    >
                        {isValidating ? (
                            <>Validando...</>
                        ) : (
                            <>Siguiente <ArrowRight className="w-4 h-4" /></>
                        )}
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
                                        submitAttempted={submitAttempted}
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
                        submitAttempted={submitAttempted}
                    />
                </div>

                <div className="mt-16 flex items-center justify-between">
                    <button onClick={prevStep} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <button
                        onClick={() => {
                            setSubmitAttempted(true);
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

                    <a href="https://mpago.la/2rjmF2W" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><User className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-zinc-300 transition-colors">Consulta Dr. Merino</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Abonar mediante MercadoPago</p>
                            </div>
                        </div>
                    </a>

                    <a href="https://mpago.la/2MJhrW6" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-zinc-300 transition-colors">Consulta Staff Médico</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Abonar mediante MercadoPago</p>
                            </div>
                        </div>
                    </a>
                </div>

                <div className="space-y-3 pt-4">
                    <p className="text-sm font-medium text-zinc-400 uppercase tracking-wider ml-1">2. Reserva tu horario</p>
                    <a href={ADMISSION_BOOKING_PATHS.merino} className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><Calendar className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-zinc-300 transition-colors">Agendar con Dr. Merino</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Primera consulta en agenda AM</p>
                            </div>
                        </div>
                    </a>

                    <a href={ADMISSION_BOOKING_PATHS.staff} className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-zinc-300 transition-colors">Agendar con Staff</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Selecciona profesional del staff</p>
                            </div>
                        </div>
                    </a>

                    <a href="https://wa.link/zolb52" target="_blank" className="block w-full p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><MessageCircle className="w-5 h-5" /></div>
                            <div>
                                <h4 className="text-base font-medium text-white group-hover:text-zinc-300 transition-colors">Agendar por WhatsApp</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">Habla con una ejecutiva</p>
                            </div>
                        </div>
                    </a>
                </div>

                <div className="space-y-3 pt-4">
                    <p className="text-sm font-medium text-zinc-400 uppercase tracking-wider ml-1">3. Cómo llegar</p>
                    <div className="grid grid-cols-2 gap-3">
                        <a href="https://maps.app.goo.gl/5kWar9VL6qjhdEGM7" target="_blank" className="block p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group text-center">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><MapPin className="w-5 h-5" /></div>
                                <h4 className="text-sm font-medium text-white group-hover:text-zinc-300 transition-colors">Google Maps</h4>
                            </div>
                        </a>
                        <a href="https://waze.com/ul/h69y7pcqyu" target="_blank" className="block p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all group text-center">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-10 h-10 bg-white/5 border border-white/10 text-white rounded-full flex items-center justify-center shrink-0"><Navigation className="w-5 h-5" /></div>
                                <h4 className="text-sm font-medium text-white group-hover:text-zinc-300 transition-colors">Waze</h4>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen bg-[#000000] text-white selection:bg-white/30 font-sans relative overflow-hidden flex flex-col">
            {/* Background Effects */}
            <div className="fixed inset-0 bg-noise pointer-events-none z-0" />
            <div className="fixed inset-0 bg-grid-white opacity-[0.03] pointer-events-none z-0" />

            <div className="fixed top-[0%] left-[20%] w-[60%] h-[60%] rounded-full bg-white/5 blur-[120px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '10s' }} />


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
