'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User,
    CreditCard,
    Calendar,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    ArrowRight,
    ShieldCheck,
    Mail,
    Phone,
    MapPin,
    Building2,
    Globe,
    Sparkles,
    MessageSquare,
    Search,
    Star,
    HeartPulse
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { submitAdmissionAction, upsertAdmissionLeadAction } from '@/app/actions/admission';
import { getAdmissionSettingsAction } from '@/app/actions/admission-settings';
import { toast } from 'sonner';

const PAIS_CODES = [
    { code: '+54', label: '🇦🇷 Argentina (+54)' },
    { code: '+55', label: '🇧🇷 Brasil (+55)' },
    { code: '+598', label: '🇺🇾 Uruguay (+598)' },
    { code: '+56', label: '🇨🇱 Chile (+56)' },
    { code: '+1', label: '🇺🇸 USA (+1)' },
    { code: 'otro', label: '🌍 Otro (Especificar)' },
];

const EMAIL_DOMAINS = [
    'gmail.com',
    'hotmail.com',
    'yahoo.com',
    'outlook.com',
    'icloud.com',
    'otro',
];

const BARRIOS_ARGENTINA = [
    'Palermo', 'Belgrano', 'Recoleta', 'Caballito', 'Almagro', 'Villa Urquiza',
    'Nuñez', 'Colegiales', 'San Telmo', 'Puerto Madero', 'Chacarita', 'Villa Crespo',
    'Flores', 'Floresta', 'Balvanera', 'Monserrat', 'Retiro', 'Barracas', 'La Boca',
    'Liniers', 'Mataderos', 'Villa del Parque', 'Villa Devoto', 'Villa Lugano', 'Otro'
];

const CIUDADES = [
    'CABA', 'GBA Norte', 'GBA Sur', 'GBA Oeste', 'La Plata', 'Córdoba',
    'Rosario', 'Mendoza', 'Mar del Plata', 'Interior', 'Exterior'
];

const ORIGENES = [
    'Instagram', 'Facebook', 'Google / Buscador', 'Recomendación de un Amigo',
    'Vi el local / Pasé por la puerta', 'Ya soy paciente', 'Publicidad en la calle', 'Otro'
];

const MOTIVOS = [
    'Limpieza y Salud General', 'Dolor o Urgencia', 'Estética (Blanqueamiento, Carillas)',
    'Ortodoncia / Invisalign', 'Implantes o Prótesis', 'Consulta de Diagnóstico General', 'Otro'
];

// Fallback constants used while loading or if DB fails
const DEFAULT_PRICES = [
    { id: 'merino', name: 'Consulta Dr. Ariel Merino', price: 'ARS $100.000', description: 'Atención directa del director clínico. Exclusividad y estética avanzada.', icon: '💎', badge: 'MAS ELEGIDO' },
    { id: 'staff', name: 'Consulta Staff Profesional', price: 'ARS $50.000', description: 'Diagnóstico integral con nuestro equipo de expertos en salud dental.', icon: '⭐', badge: 'ESTÁNDAR' }
];

const DEFAULT_MOTIVATIONAL_MESSAGES = [
    { step: 1, title: '¡Excelente comienzo!', message: 'Comencemos por conocerte un poco mejor para brindarte la mejor atención.' },
    { step: 2, title: '¡Vas muy bien!', message: 'Tu salud es nuestra prioridad, cuéntanos el objetivo de tu visita.' },
    { step: 3, title: '¡Casi terminamos!', message: 'Elige la experiencia AM que mejor se adapte a lo que estás buscando.' },
    { step: 4, title: '¡Último paso!', message: 'Revisa que todo esté correcto para iniciar tu proceso de transformación.' },
];

export default function AdmissionPage() {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [persistedData, setPersistedData] = useState<any>(null);

    // Dynamic Settings State
    const [settings, setSettings] = useState<any>({
        prices: DEFAULT_PRICES,
        motivational_messages: DEFAULT_MOTIVATIONAL_MESSAGES,
        neighborhoods: BARRIOS_ARGENTINA,
        cities: CIUDADES,
        origins: ORIGENES,
        reasons: MOTIVOS
    });

    // Advanced Form State
    const [formData, setFormData] = useState({
        nombre: '',
        apellido: '',
        dni: '',
        cuit: '',
        // WhatsApp Phone
        whatsapp_pais_code: '+54',
        whatsapp_numero: '',
        whatsapp_custom_pais_code: '',
        // Email
        email_local: '',
        email_dominio: 'gmail.com',
        email_custom_domain: '',
        // Location
        ciudad: 'CABA',
        pais_exterior: '',
        zona_barrio: '',
        custom_barrio: '',
        // Motivation & Experience
        motivo_consulta: '',
        referencia_origen: '',
        referencia_recomendado_por: '',
        // Selection
        // Selection
        profesional: 'Consulta con Dr. Ariel Merino',
        // Lead context
        id_paciente: '',
    });

    // Load dynamic settings
    useEffect(() => {
        const loadSettings = async () => {
            const res = await getAdmissionSettingsAction();
            if (res.success && res.settings) {
                setSettings(res.settings);
            }
        };
        loadSettings();
    }, []);

    // Load persistence
    useEffect(() => {
        const saved = localStorage.getItem('am_admission_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.success) {
                setSuccess(true);
                setFormData(parsed.formData);
            } else {
                setFormData(prev => ({ ...prev, ...parsed.formData }));
                setStep(parsed.step || 1);
            }
        }
    }, []);

    // Save persistence
    useEffect(() => {
        if (formData.nombre || formData.email_local) {
            localStorage.setItem('am_admission_data', JSON.stringify({
                formData,
                step,
                success,
                lastUpdate: new Date().getTime()
            }));
        }
    }, [formData, step, success]);

    const getFullEmail = () => {
        if (!formData.email_local) return '';
        const domain = formData.email_dominio === 'otro' ? formData.email_custom_domain : formData.email_dominio;
        return `${formData.email_local.trim()}@${domain}`;
    };

    const getFullPhone = () => {
        if (!formData.whatsapp_numero) return '';
        const code = formData.whatsapp_pais_code === 'otro' ? formData.whatsapp_custom_pais_code : formData.whatsapp_pais_code;
        return `${code}${formData.whatsapp_numero.replace(/\D/g, '')}`;
    };

    const getFullBarrio = () => {
        return formData.zona_barrio === 'Otro' ? formData.custom_barrio : formData.zona_barrio;
    };

    const getReferenciaFinal = () => {
        if (formData.referencia_origen === 'Recomendación de un Amigo' && formData.referencia_recomendado_por) {
            return `Recomendado por: ${formData.referencia_recomendado_por}`;
        }
        return formData.referencia_origen;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleNext = async () => {
        // Step 1: Lead Capture
        if (step === 1 && isStep1Valid) {
            const res = await upsertAdmissionLeadAction({
                id_paciente: formData.id_paciente || undefined,
                nombre: formData.nombre,
                apellido: formData.apellido,
                dni: formData.dni,
                email: getFullEmail(),
                telefono: getFullPhone(),
                cuit: formData.cuit
            });
            if (res.success && res.patientId) {
                setFormData(prev => ({ ...prev, id_paciente: res.patientId }));
            }
        }

        // Step 2: Update motivation info
        if (step === 2 && isStep2Valid) {
            await upsertAdmissionLeadAction({
                id_paciente: formData.id_paciente,
                motivo_consulta: formData.motivo_consulta,
                referencia_origen: getReferenciaFinal()
            });
        }

        setStep(prev => prev + 1);
    };
    const handleBack = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const submissionData = {
                id_paciente: formData.id_paciente,
                nombre: formData.nombre,
                apellido: formData.apellido,
                dni: formData.dni,
                email: getFullEmail(),
                telefono: getFullPhone(),
                cuit: formData.cuit,
                profesional: formData.profesional,
                motivo_consulta: formData.motivo_consulta,
                referencia_origen: getReferenciaFinal(),
            };

            const res = await submitAdmissionAction(submissionData);
            if (res.success) {
                setSuccess(true);
                toast.success('¡Registro completado con éxito!');
                // Update storage to mark success and keep data for links
                localStorage.setItem('am_admission_data', JSON.stringify({
                    formData,
                    step,
                    success: true,
                    lastUpdate: new Date().getTime()
                }));
            } else {
                toast.error(res.error || 'Ocurrió un error al procesar tu solicitud');
            }
        } catch (err) {
            toast.error('Error de conexión. Por favor intenta de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isStep1Valid =
        formData.nombre &&
        formData.apellido &&
        formData.dni &&
        formData.email_local &&
        formData.whatsapp_numero &&
        formData.cuit;

    const isStep2Valid =
        formData.motivo_consulta &&
        formData.referencia_origen;

    if (success) {
        const isMerino = formData.profesional.includes('Merino');
        const paymentLink = isMerino ? 'https://mpago.la/2rjmF2W' : 'https://mpago.la/2MJhrW6';
        const agendaLink = isMerino ? 'https://calendar.app.google/oc4VZPzsDkhwB3r58' : 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0dDbh9UiGp7dk-OBTfyppeCwNcooGMRJdRwt4GGLrYYRuRXhhOVQV6E-yvCkZRdkjqp5xrpjO4';

        return (
            <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eef2ff_100%)] flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-2xl w-full"
                >
                    <Card className="p-10 text-center glass-effect border-blue-100 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600" />

                        <div className="flex justify-center mb-6">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', damping: 12 }}
                                className="bg-green-100 p-4 rounded-full"
                            >
                                <CheckCircle2 className="w-12 h-12 text-green-600" />
                            </motion.div>
                        </div>

                        <h1 className="text-3xl font-bold text-slate-900 mb-2">¡Bienvenido a AM Clinica!</h1>
                        <p className="text-slate-600 mb-8 max-w-md mx-auto">
                            Hola <span className="font-semibold text-blue-600">{formData.nombre}</span>, ya eres parte de nuestra comunidad. Haz dado el primer paso hacia tu nueva sonrisa.
                        </p>

                        <div className="grid gap-4 mb-8">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="p-6 bg-white/60 rounded-2xl border border-blue-50 text-left flex items-start gap-4 hover:shadow-md transition-shadow"
                            >
                                <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold">1</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-900">Pasar por Caja Virtual</h3>
                                    <p className="text-sm text-slate-500 mb-4">Abona tu consulta para confirmar definitivamente tu cupo.</p>
                                    <Button
                                        asChild
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                                    >
                                        <a href={paymentLink} target="_blank" rel="noopener noreferrer">
                                            Abonar Consulta <ArrowRight className="w-5 h-5" />
                                        </a>
                                    </Button>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="p-6 bg-white/60 rounded-2xl border border-blue-50 text-left flex items-start gap-4 hover:shadow-md transition-shadow"
                            >
                                <div className="bg-slate-200 text-slate-600 w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold">2</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-900">Elegir Horario</h3>
                                    <p className="text-sm text-slate-500 mb-2">Una vez realizado el pago, nuestra agenda se abrirá para ti.</p>
                                    <a href={agendaLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                                        Reservar en calendario oficial <ChevronRight className="w-4 h-4" />
                                    </a>
                                </div>
                            </motion.div>
                        </div>

                        <div className="mt-10 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50">
                            <p className="text-xs text-slate-500 mb-1 font-bold">ACCESO AL PORTAL</p>
                            <p className="text-sm text-slate-600">
                                Tu portal está habilitado. Accede con tu DNI <span className="font-bold text-slate-900">{formData.dni}</span> en <a href="/mi-portal" className="text-blue-600 font-bold hover:underline">mi-portal</a>.
                            </p>
                        </div>

                        <button
                            onClick={() => { localStorage.removeItem('am_admission_data'); window.location.reload(); }}
                            className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                        >
                            Resetear Ficha (Limpiar)
                        </button>
                    </Card>
                </motion.div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eef2ff_100%)] flex items-center justify-center p-6 text-slate-900 font-sans">
            <div className="max-w-2xl w-full relative">
                {/* Branding */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 mb-4">
                        <Star className="w-3 h-3 text-blue-600 fill-blue-600" />
                        <span className="text-[10px] font-bold tracking-widest uppercase text-blue-700">Experiencia Premium • AM CLINICA</span>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Comienza tu Transformación</h1>
                    <p className="text-slate-500 mt-2 font-medium">Estás a pocos pasos de una sonrisa diseñada exclusivamente para ti.</p>
                </motion.div>

                {/* Motivational Bar */}
                <div className="mb-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-white/80 backdrop-blur-md border border-blue-100 p-4 rounded-3xl shadow-lg relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-blue-400 via-blue-600 to-indigo-600" style={{ width: `${(step / 4) * 100}%`, transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                            <div className="flex items-center gap-4">
                                <div className="bg-blue-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center font-black animate-pulse shadow-lg shadow-blue-200">
                                    {Math.round((step / 4) * 100)}%
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-blue-900 leading-none mb-1 uppercase tracking-wider">
                                        {settings.motivational_messages.find((m: any) => m.step === step)?.title}
                                    </h4>
                                    <p className="text-[11px] text-slate-500 font-medium">
                                        {settings.motivational_messages.find((m: any) => m.step === step)?.message}
                                    </p>
                                </div>
                                <div className="ml-auto opacity-20 group-hover:opacity-100 transition-opacity">
                                    <Sparkles className="w-5 h-5 text-blue-600" />
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Progress Stepper */}
                <div className="mb-12 flex justify-between px-2 relative">
                    <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-200 -z-10" />
                    <motion.div
                        className="absolute top-5 left-0 h-0.5 bg-blue-600 -z-10"
                        animate={{ width: `${((step - 1) / 3) * 100}%` }}
                    />

                    {[1, 2, 3, 4].map((s) => (
                        <div key={s} className="flex flex-col items-center gap-3">
                            <motion.div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 z-10 ${step === s ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 ring-4 ring-blue-50' :
                                    step > s ? 'bg-green-500 text-white' :
                                        'bg-white text-slate-400 border-2 border-slate-200'
                                    }`}
                                animate={step === s ? { scale: 1.15 } : { scale: 1 }}
                            >
                                {step > s ? <CheckCircle2 className="w-5 h-5 animate-in zoom-in" /> : s}
                            </motion.div>
                            <span className={`text-[9px] font-black uppercase tracking-tighter ${step === s ? 'text-blue-600' : 'text-slate-400'}`}>
                                {s === 1 ? 'Personal' : s === 2 ? 'Motivo' : s === 3 ? 'Experiencia' : 'Confirmar'}
                            </span>
                        </div>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <Card className="p-8 glass-effect border-white/50 shadow-2xl rounded-[2rem] overflow-hidden">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="bg-blue-100/50 p-2 rounded-xl">
                                        <User className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Identidad Digital</h2>
                                        <p className="text-xs text-slate-500">Comencemos con lo básico para crear tu legajo.</p>
                                    </div>
                                </div>

                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nombre</label>
                                        <Input name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Tu nombre" className="h-12 bg-white/80 border-slate-200 rounded-2xl text-slate-900 shadow-sm transition-all focus:ring-4 focus:ring-blue-50" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Apellido</label>
                                        <Input name="apellido" value={formData.apellido} onChange={handleChange} placeholder="Tu apellido" className="h-12 bg-white/80 border-slate-200 rounded-2xl text-slate-900 shadow-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">DNI / Pasaporte</label>
                                        <Input name="dni" value={formData.dni} onChange={handleChange} placeholder="Número de identificación" className="h-12 bg-white/80 border-slate-200 rounded-2xl text-slate-900 shadow-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">CUIT / Pago</label>
                                        <Input name="cuit" value={formData.cuit} onChange={handleChange} placeholder="Para tu factura" className="h-12 bg-white/80 border-slate-200 rounded-2xl text-slate-900 shadow-sm" />
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                        <label className="text-xs font-bold text-blue-600 uppercase tracking-wider ml-1">WhatsApp de Contacto Directo</label>
                                        <div className="flex gap-2">
                                            <select name="whatsapp_pais_code" value={formData.whatsapp_pais_code} onChange={handleChange} className="w-36 h-12 bg-white/80 border border-slate-200 rounded-2xl text-sm font-bold px-3 shadow-sm outline-none">
                                                {PAIS_CODES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                                            </select>
                                            <div className="relative flex-1">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input name="whatsapp_numero" value={formData.whatsapp_numero} onChange={handleChange} placeholder="Número celular sin ceros" className="h-12 pl-12 bg-white/80 border-slate-200 rounded-2xl text-slate-900 shadow-sm" />
                                            </div>
                                        </div>
                                        {formData.whatsapp_pais_code === 'otro' && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2">
                                                <Input name="whatsapp_custom_pais_code" value={formData.whatsapp_custom_pais_code} onChange={handleChange} placeholder="+ código país" className="h-12 bg-white/80 border-slate-200 rounded-2xl font-bold" />
                                            </motion.div>
                                        )}
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Correo Electrónico (Para recibir tu turno)</label>
                                        <div className="flex gap-2 items-center">
                                            <div className="relative flex-1">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input name="email_local" value={formData.email_local} onChange={handleChange} placeholder="ejemplo" className="h-12 pl-12 bg-white/80 border-slate-200 rounded-2xl" />
                                            </div>
                                            <span className="text-slate-400 font-medium">@</span>
                                            <select name="email_dominio" value={formData.email_dominio} onChange={handleChange} className="w-36 h-12 bg-white/80 border border-slate-200 rounded-2xl text-sm px-3 shadow-sm outline-none">
                                                {EMAIL_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-10">
                                    <Button onClick={handleNext} disabled={!isStep1Valid} className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-blue-200 transition-all disabled:opacity-50">
                                        Continuar <ChevronRight className="w-6 h-6" />
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <Card className="p-8 glass-effect border-white/50 shadow-2xl rounded-[2rem]">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="bg-indigo-100/50 p-2 rounded-xl">
                                        <HeartPulse className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Motivo de Consulta</h2>
                                        <p className="text-xs text-slate-500">Ayúdanos a prepararnos mejor para tu llegada.</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">¿Qué objetivo tienes para hoy?</label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {settings.reasons.map((m: string) => (
                                                <div
                                                    key={m}
                                                    onClick={() => setFormData(prev => ({ ...prev, motivo_consulta: m }))}
                                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.motivo_consulta === m ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-slate-100 bg-white/50 hover:border-slate-200 text-slate-600 font-medium'}`}
                                                >
                                                    {m}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">¿Cómo nos conociste?</label>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <select name="referencia_origen" value={formData.referencia_origen} onChange={handleChange} className="w-full h-12 pl-12 bg-white/80 border border-slate-200 rounded-2xl text-sm font-medium shadow-sm outline-none">
                                                <option value="">Selección...</option>
                                                {settings.origins.map((o: string) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {formData.referencia_origen === 'Recomendación de un Amigo' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">¿Quién te recomendó? (Nos encantaría agradecerle)</label>
                                            <Input name="referencia_recomendado_por" value={formData.referencia_recomendado_por} onChange={handleChange} placeholder="Nombre completo de quien te recomendó" className="h-12 bg-white/80 border-slate-200 rounded-2xl" />
                                        </motion.div>
                                    )}
                                </div>

                                <div className="mt-10 flex gap-4">
                                    <Button onClick={handleBack} variant="outline" className="h-14 px-8 rounded-2xl border-2 border-slate-200 font-black text-slate-600 uppercase">
                                        Volver
                                    </Button>
                                    <Button onClick={handleNext} disabled={!isStep2Valid} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-2xl font-black text-lg flex items-center justify-center gap-3">
                                        Siguiente Paso <ChevronRight className="w-6 h-6" />
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <Card className="p-8 glass-effect border-white/50 shadow-2xl rounded-[2rem]">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="bg-indigo-100/50 p-2 rounded-xl">
                                        <Building2 className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Elegir Experiencia</h2>
                                        <p className="text-xs text-slate-500">Selecciona el nivel de atención que prefieres.</p>
                                    </div>
                                </div>

                                <div className="grid gap-4">
                                    {settings.prices.map((p: any) => (
                                        <motion.div
                                            key={p.id}
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => setFormData(prev => ({ ...prev, profesional: p.name }))}
                                            className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all duration-300 relative overflow-hidden group ${formData.profesional === p.name ? 'border-blue-500 bg-blue-50/70 ring-4 ring-blue-50' : 'border-slate-100 bg-white/50 hover:border-blue-200'}`}
                                        >
                                            <div className="absolute top-4 right-4 text-[9px] font-black tracking-widest bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">{p.badge}</div>
                                            <div className="flex items-start gap-4 pr-12">
                                                <div className="text-3xl bg-white p-3 rounded-2xl shadow-sm">{p.icon}</div>
                                                <div className="flex-1">
                                                    <h3 className={`font-black text-lg leading-tight ${formData.profesional === p.name ? 'text-blue-900' : 'text-slate-900'}`}>{p.name}</h3>
                                                    <p className="text-sm text-slate-500 font-medium leading-relaxed my-2">{p.description}</p>
                                                    <div className="inline-block px-3 py-1 bg-white/50 rounded-lg text-blue-600 font-black text-sm">{p.price}</div>
                                                </div>
                                                {formData.profesional === p.name && (
                                                    <motion.div layoutId="check" className="text-blue-600 bg-white rounded-full p-1 shadow-md">
                                                        <CheckCircle2 className="w-6 h-6" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="mt-10 flex gap-4">
                                    <Button onClick={handleBack} variant="outline" className="h-14 px-8 rounded-2xl border-2 border-slate-200 font-black text-slate-600 uppercase">
                                        Volver
                                    </Button>
                                    <Button onClick={handleNext} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-2xl font-black text-lg shadow-xl shadow-blue-200">
                                        Confirmar Ficha <ChevronRight className="w-6 h-6" />
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <Card className="p-8 glass-effect border-white/50 shadow-2xl rounded-[2rem]">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="bg-blue-100/50 p-2 rounded-xl">
                                        <Sparkles className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Todo Listo</h2>
                                        <p className="text-xs text-slate-500">¿Estás listo para iniciar tu camino con nosotros?</p>
                                    </div>
                                </div>

                                <div className="bg-white/80 p-8 rounded-[2rem] border border-blue-50 space-y-6 mb-8 shadow-sm">
                                    <div className="grid grid-cols-2 gap-y-6">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paciente</p>
                                            <p className="font-black text-slate-900">{formData.apellido.toUpperCase()}, {formData.nombre}</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</p>
                                            <p className="font-bold text-blue-600">{getFullPhone()}</p>
                                        </div>
                                        <div className="space-y-1 col-span-2 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/30">
                                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Tu Elección</p>
                                            <div className="flex items-center justify-between">
                                                <p className="font-black text-blue-900">{formData.profesional}</p>
                                                <p className="font-black text-blue-600">{formData.profesional.includes('Merino') ? 'ARS $100.000' : 'ARS $50.000'}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1 col-span-2 border-t border-slate-100 pt-4">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivo</p>
                                            <p className="text-sm font-medium text-slate-700 italic">"{formData.motivo_consulta}"</p>
                                        </div>
                                    </div>
                                </div>

                                <motion.div className="flex items-start gap-4 p-5 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl text-blue-900 text-[11px] font-medium leading-relaxed mb-10 border border-blue-100">
                                    <div className="bg-white p-2 rounded-xl shadow-sm"><ShieldCheck className="w-4 h-4 text-blue-600" /></div>
                                    <p>Tu información está protegida. Al confirmar, iniciaremos la creación de tu legajo clínico exclusivo y prepararemos todo para tu primera consulta.</p>
                                </motion.div>

                                <div className="flex gap-4">
                                    <Button onClick={handleBack} variant="outline" className="h-14 px-8 rounded-2xl border-2 border-slate-200 font-black text-slate-600 uppercase">
                                        Corregir
                                    </Button>
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-blue-200 transition-all hover:scale-[1.03] active:scale-[0.98]"
                                    >
                                        {isSubmitting ? (
                                            <span className="flex items-center gap-2 tracking-widest animate-pulse"><Globe className="w-5 h-5 animate-spin" /> PROCESANDO...</span>
                                        ) : (
                                            <>INICIAR TRASFORMACIÓN <ArrowRight className="w-6 h-6" /></>
                                        )}
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                <footer className="mt-16 text-center">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">
                        Advanced Clinical Experience • v2.0
                    </p>
                    <div className="h-1 w-12 bg-blue-600 mx-auto mt-4 rounded-full opacity-50" />
                </footer>
            </div>

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');
                
                :root {
                    font-family: 'Inter', sans-serif;
                }

                .glass-effect {
                    background: rgba(255, 255, 255, 0.7);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid rgba(255, 255, 255, 0.4);
                }

                input::placeholder {
                    color: #94a3b8 !important;
                    font-weight: 500;
                }
            `}</style>
        </main >
    );
}
