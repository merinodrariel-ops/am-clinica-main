'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, CreditCard, Calendar, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { submitAdmissionAction } from '@/app/actions/admission';
import { toast } from 'sonner';

export default function AdmissionPage() {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        nombre: '',
        apellido: '',
        dni: '',
        email: '',
        telefono: '',
        profesional: 'Consulta con Dr. Ariel Merino',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleNext = () => setStep(prev => prev + 1);
    const handleBack = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const res = await submitAdmissionAction(formData);
            if (res.success) {
                setSuccess(true);
                toast.success('¡Registro completado con éxito!');
            } else {
                toast.error(res.error || 'Ocurrió un error al procesar tu solicitud');
            }
        } catch (err) {
            toast.error('Error de conexión. Por favor intenta de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isStep1Valid = formData.nombre && formData.apellido && formData.dni && formData.email && formData.telefono;

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
                    <Card className="p-10 text-center glass-effect border-blue-100 shadow-2xl">
                        <div className="flex justify-center mb-6">
                            <div className="bg-green-100 p-4 rounded-full">
                                <CheckCircle2 className="w-12 h-12 text-green-600" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">¡Bienvenido a AM Clinica!</h1>
                        <p className="text-slate-600 mb-8 max-w-md mx-auto">
                            Hola <span className="font-semibold text-blue-600">{formData.nombre}</span>, hemos registrado tu ficha correctamente. Para confirmar tu cita, sigue los pasos a continuación:
                        </p>

                        <div className="grid gap-4 mb-8">
                            <div className="p-6 bg-white/60 rounded-2xl border border-blue-50 text-left flex items-start gap-4">
                                <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold">1</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-900">Realizar Pago</h3>
                                    <p className="text-sm text-slate-500 mb-4">Abona la consulta para asegurar tu lugar en la agenda.</p>
                                    <Button
                                        asChild
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                                    >
                                        <a href={paymentLink} target="_blank" rel="noopener noreferrer">
                                            Pagar Consulta <ArrowRight className="w-5 h-5" />
                                        </a>
                                    </Button>
                                </div>
                            </div>

                            <div className="p-6 bg-white/60 rounded-2xl border border-blue-50 text-left flex items-start gap-4">
                                <div className="bg-slate-200 text-slate-600 w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold">2</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-900">Agendar Turno</h3>
                                    <p className="text-sm text-slate-500 mb-2">Una vez realizado el pago, elige el horario que mejor te quede.</p>
                                    <a href={agendaLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                                        Ver calendario de turnos <ChevronRight className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        </div>

                        <p className="text-xs text-slate-400 italic">
                            También te hemos enviado estos links a tu correo electrónico: <span className="font-medium">{formData.email}</span>
                        </p>
                    </Card>
                </motion.div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eef2ff_100%)] flex items-center justify-center p-6 text-slate-900">
            <div className="max-w-2xl w-full relative">
                {/* Branding */}
                <div className="text-center mb-10">
                    <p className="text-xs font-bold tracking-[0.2em] uppercase text-blue-700 mb-2">Google Gravity • AM ESTÉTICA DENTAL</p>
                    <h1 className="text-3xl font-extrabold text-slate-900">Formulario de Admisión</h1>
                </div>

                {/* Progress Bar */}
                <div className="mb-8 flex justify-between px-2">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${step === s ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110' : step > s ? 'bg-green-500 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
                                {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${step === s ? 'text-blue-600' : 'text-slate-400'}`}>
                                {s === 1 ? 'Datos' : s === 2 ? 'Profesional' : 'Confirmar'}
                            </span>
                        </div>
                    ))}
                    <div className="absolute top-[88px] left-[15%] right-[15%] h-[2px] bg-slate-200 -z-10 bg-gradient-to-r from-blue-600 to-slate-200" style={{ backgroundSize: step === 1 ? '0%' : step === 2 ? '50%' : '100%', backgroundRepeat: 'no-repeat' }} />
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <Card className="p-8 glass-effect border-blue-50 shadow-xl">
                                <div className="flex items-center gap-3 mb-6">
                                    <User className="w-6 h-6 text-blue-600" />
                                    <h2 className="text-xl font-bold">Datos Personales</h2>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Nombre</label>
                                        <Input name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Ej: Ariel" className="h-12 bg-white/50 border-slate-200 focus:border-blue-500 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Apellido</label>
                                        <Input name="apellido" value={formData.apellido} onChange={handleChange} placeholder="Ej: Merino" className="h-12 bg-white/50 border-slate-200 focus:border-blue-500 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">DNI / Documento</label>
                                        <Input name="dni" value={formData.dni} onChange={handleChange} placeholder="Sin puntos" className="h-12 bg-white/50 border-slate-200 focus:border-blue-500 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Teléfono</label>
                                        <Input name="telefono" value={formData.telefono} onChange={handleChange} placeholder="Ej: 1123456789" className="h-12 bg-white/50 border-slate-200 focus:border-blue-500 rounded-xl" />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Correo Electrónico</label>
                                        <Input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="paciente@ejemplo.com" className="h-12 bg-white/50 border-slate-200 focus:border-blue-500 rounded-xl" />
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <Button
                                        onClick={handleNext}
                                        disabled={!isStep1Valid}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-2 group shadow-lg shadow-blue-100 disabled:opacity-50 disabled:shadow-none"
                                    >
                                        Siguiente etapa <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <Card className="p-8 glass-effect border-blue-50 shadow-xl">
                                <div className="flex items-center gap-3 mb-6">
                                    <Calendar className="w-6 h-6 text-blue-600" />
                                    <h2 className="text-xl font-bold">Selección de Profesional</h2>
                                </div>

                                <div className="grid gap-4">
                                    {[
                                        { id: 'merino', name: 'Consulta con Dr. Ariel Merino', price: 'High-end', description: 'Atención personalizada por el director de la clínica.' },
                                        { id: 'staff', name: 'Consulta con Staff AM', price: 'Standard', description: 'Evaluación inicial con nuestro equipo especializado.' }
                                    ].map((p) => (
                                        <div
                                            key={p.id}
                                            onClick={() => setFormData(prev => ({ ...prev, profesional: p.name }))}
                                            className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 relative overflow-hidden group ${formData.profesional === p.name ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-white/50 hover:border-blue-200'}`}
                                        >
                                            {formData.profesional === p.name && (
                                                <div className="absolute top-2 right-2 text-blue-600">
                                                    <CheckCircle2 className="w-6 h-6" />
                                                </div>
                                            )}
                                            <h3 className={`font-bold text-lg mb-1 ${formData.profesional === p.name ? 'text-blue-700' : 'text-slate-900'}`}>{p.name}</h3>
                                            <p className="text-sm text-slate-500">{p.description}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 flex gap-3">
                                    <Button onClick={handleBack} variant="outline" className="h-12 px-6 rounded-xl border-slate-200 hover:bg-slate-50 flex items-center gap-2 font-semibold">
                                        <ChevronLeft className="w-5 h-5" /> Volver
                                    </Button>
                                    <Button
                                        onClick={handleNext}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-2 group shadow-lg shadow-blue-100"
                                    >
                                        Continuar <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <Card className="p-8 glass-effect border-blue-50 shadow-xl">
                                <div className="flex items-center gap-3 mb-6">
                                    <CreditCard className="w-6 h-6 text-blue-600" />
                                    <h2 className="text-xl font-bold">Resumen y Pago</h2>
                                </div>

                                <div className="bg-slate-50/80 p-6 rounded-2xl border border-slate-100 space-y-4 mb-8">
                                    <div className="flex justify-between border-b border-slate-200 pb-3">
                                        <span className="text-sm text-slate-500 font-medium tracking-tight">PACIENTE</span>
                                        <span className="text-sm font-bold text-slate-900">{formData.apellido.toUpperCase()}, {formData.nombre}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-3">
                                        <span className="text-sm text-slate-500 font-medium tracking-tight">PROFESIONAL</span>
                                        <span className="text-sm font-bold text-slate-900">{formData.profesional}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-3">
                                        <span className="text-sm text-slate-500 font-medium tracking-tight">CONTACTO</span>
                                        <span className="text-sm font-medium text-slate-700">{formData.email} • {formData.telefono}</span>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-xl text-blue-700 text-xs leading-relaxed mb-8">
                                    <ShieldCheck className="w-5 h-5 shrink-0" />
                                    <p>Al hacer clic en "Confirmar e Ir al Pago", tus datos serán registrados de forma segura y se creará tu ficha clínica oficial en AM Estética Dental.</p>
                                </div>

                                <div className="flex gap-3">
                                    <Button onClick={handleBack} variant="outline" className="h-12 px-6 rounded-xl border-slate-200 hover:bg-slate-50 flex items-center gap-2 font-semibold">
                                        <ChevronLeft className="w-5 h-5" /> Volver
                                    </Button>
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        {isSubmitting ? 'Procesando...' : 'Confirmar e Ir al Pago'}
                                        {!isSubmitting && <ArrowRight className="w-5 h-5" />}
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                <footer className="mt-12 text-center text-slate-400 text-xs">
                    © {new Date().getFullYear()} AM Estética Dental. Sistema impulsado por Google Gravity.
                </footer>
            </div>

            <style jsx global>{`
        .glass-effect {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
      `}</style>
        </main>
    );
}
