'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
    AlertTriangle,
    BadgeCheck,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    CloudOff,
    HeartPulse,
    Mail,
    Phone,
    RefreshCcw,
    Search,
    Shield,
    Sparkles,
    User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
    checkAdmissionIdentityAction,
    searchAdmissionPatientsAction,
    submitAdmissionAction,
    upsertAdmissionLeadAction,
} from '@/app/actions/admission';
import { getAdmissionSettingsAction } from '@/app/actions/admission-settings';
import {
    admissionDefaultValues,
    admissionSubmissionSchema,
    type AdmissionDraft,
    type AdmissionMode,
} from '@/lib/admission-schema';
import { useAdmissionTriggers } from '@/hooks/useAdmissionTriggers';

const PAIS_CODES = [
    { code: '+54', label: 'Argentina (+54)' },
    { code: '+55', label: 'Brasil (+55)' },
    { code: '+598', label: 'Uruguay (+598)' },
    { code: '+56', label: 'Chile (+56)' },
    { code: '+1', label: 'USA (+1)' },
    { code: 'otro', label: 'Otro código' },
];

const EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'otro'];

const DEFAULT_SETTINGS = {
    prices: [
        {
            id: 'merino',
            name: 'Consulta con Dr. Ariel Merino',
            price: 'ARS $100.000',
            description: 'Dirección clínica y plan de diagnóstico premium.',
            badge: 'Director clínico',
        },
        {
            id: 'staff',
            name: 'Consulta Staff Profesional',
            price: 'ARS $50.000',
            description: 'Equipo clínico AM con evaluación integral.',
            badge: 'Staff AM',
        },
    ],
    neighborhoods: [
        'Palermo',
        'Belgrano',
        'Recoleta',
        'Caballito',
        'Villa Crespo',
        'Nuñez',
        'San Telmo',
        'Otro',
    ],
    cities: ['CABA', 'GBA Norte', 'GBA Sur', 'GBA Oeste', 'La Plata', 'Interior', 'Exterior'],
    origins: [
        'Instagram',
        'Facebook',
        'Google / Buscador',
        'Recomendación de un Amigo',
        'Vi el local / Pasé por la puerta',
        'Ya soy paciente',
        'Otro',
    ],
    reasons: [
        'Diagnóstico general',
        'Dolor o urgencia',
        'Estética dental',
        'Ortodoncia / Invisalign',
        'Implantes o prótesis',
        'Limpieza y salud general',
    ],
};

type AdmissionSettings = typeof DEFAULT_SETTINGS;
type IdentityCandidate = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    documento: string | null;
    email: string | null;
    telefono: string | null;
    cuit: string | null;
    ciudad: string | null;
    zona_barrio: string | null;
};

type StepId = 1 | 2 | 3 | 4 | 5;

const STEP_FIELDS: Record<StepId, (keyof AdmissionDraft)[]> = {
    1: ['nombre', 'apellido', 'dni', 'cuit'],
    2: [
        'whatsapp_pais_code',
        'whatsapp_numero',
        'whatsapp_custom_pais_code',
        'email_local',
        'email_dominio',
        'email_custom_domain',
        'ciudad',
        'zona_barrio',
        'custom_barrio',
    ],
    3: [
        'salud_alergias',
        'salud_alergias_detalle',
        'salud_condiciones',
        'salud_condiciones_detalle',
        'salud_medicacion',
        'salud_medicacion_detalle',
    ],
    4: ['motivo_consulta', 'referencia_origen', 'referencia_recomendado_por', 'profesional'],
    5: ['consentimiento_privacidad', 'consentimiento_tratamiento', 'firma_data_url'],
};

const STORAGE_KEY = 'am_admission_data_v3';

type PersistedAdmissionState = {
    formData: AdmissionDraft;
    step: StepId;
    mode: AdmissionMode;
    success: boolean;
};

function readPersistedAdmissionState(): PersistedAdmissionState | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedAdmissionState;
        if (!parsed?.formData) return null;
        return parsed;
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

function readModeFromUrl(): AdmissionMode | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || params.get('modo');
    if (mode === 'online' || mode === 'manual') return mode;
    return null;
}

export function AdmissionForm() {
    const [mode, setMode] = useState<AdmissionMode>(() => {
        const queryMode = readModeFromUrl();
        if (queryMode) return queryMode;
        return readPersistedAdmissionState()?.mode || 'online';
    });
    const [step, setStep] = useState<StepId>(() => readPersistedAdmissionState()?.step || 1);
    const [formData, setFormData] = useState<AdmissionDraft>(() => ({
        ...admissionDefaultValues,
        ...(readPersistedAdmissionState()?.formData || {}),
    }));
    const [settings, setSettings] = useState<AdmissionSettings>(DEFAULT_SETTINGS);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [success, setSuccess] = useState<boolean>(() => readPersistedAdmissionState()?.success || false);
    const [manualSearch, setManualSearch] = useState('');
    const [manualMatches, setManualMatches] = useState<IdentityCandidate[]>([]);
    const [manualLoading, setManualLoading] = useState(false);
    const [identityCheck, setIdentityCheck] = useState<{
        loading: boolean;
        exists: boolean;
        patient: IdentityCandidate | null;
        error?: string;
    }>({ loading: false, exists: false, patient: null });

    const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const signatureDrawingRef = useRef(false);

    const {
        isOnline,
        queueCount,
        submitting,
        lastResult,
        flushQueue,
        submitWithTriggers,
    } = useAdmissionTriggers();

    const fullEmail = useMemo(() => {
        const domain = formData.email_dominio === 'otro' ? formData.email_custom_domain : formData.email_dominio;
        if (!formData.email_local || !domain) return '';
        return `${formData.email_local.trim()}@${domain.trim()}`;
    }, [formData.email_custom_domain, formData.email_dominio, formData.email_local]);

    const fullPhone = useMemo(() => {
        const code = formData.whatsapp_pais_code === 'otro' ? formData.whatsapp_custom_pais_code : formData.whatsapp_pais_code;
        if (!code || !formData.whatsapp_numero) return '';
        return `${code}${formData.whatsapp_numero.replace(/\D/g, '')}`;
    }, [formData.whatsapp_custom_pais_code, formData.whatsapp_numero, formData.whatsapp_pais_code]);

    const healthAlerts = useMemo(() => {
        const alerts: string[] = [];
        if (formData.salud_alergias) alerts.push(`Alergias: ${formData.salud_alergias_detalle || 'Sin detalle'}`);
        if (formData.salud_condiciones) alerts.push(`Condiciones médicas: ${formData.salud_condiciones_detalle || 'Sin detalle'}`);
        if (formData.salud_medicacion) alerts.push(`Medicación activa: ${formData.salud_medicacion_detalle || 'Sin detalle'}`);
        return alerts;
    }, [
        formData.salud_alergias,
        formData.salud_alergias_detalle,
        formData.salud_condiciones,
        formData.salud_condiciones_detalle,
        formData.salud_medicacion,
        formData.salud_medicacion_detalle,
    ]);

    const progressValue = useMemo(() => Math.round((step / 5) * 100), [step]);
    const publicAdmissionBase = process.env.NEXT_PUBLIC_APP_URL || '';
    const publicAdmissionUrl = publicAdmissionBase
        ? `${publicAdmissionBase.replace(/\/$/, '')}/admision?mode=online`
        : '';

    useEffect(() => {
        const loadSettings = async () => {
            const res = await getAdmissionSettingsAction();
            if (res.success && res.settings) {
                setSettings((prev) => ({ ...prev, ...res.settings }));
            }
        };

        void loadSettings();
    }, []);

    useEffect(() => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                formData,
                step,
                mode,
                success,
                savedAt: Date.now(),
            }),
        );
    }, [formData, mode, step, success]);

    useEffect(() => {
        if (!isOnline || queueCount === 0) return;
        void flushQueue({ submitAction: submitAdmissionAction });
    }, [flushQueue, isOnline, queueCount]);

    useEffect(() => {
        const dni = formData.dni.replace(/\D/g, '');
        const email = fullEmail.trim().toLowerCase();

        if (dni.length < 7 && email.length < 5) {
            const timeout = window.setTimeout(() => {
                setIdentityCheck({ loading: false, exists: false, patient: null });
            }, 0);
            return () => window.clearTimeout(timeout);
        }

        const timeout = window.setTimeout(async () => {
            setIdentityCheck((prev) => ({ ...prev, loading: true }));
            const res = await checkAdmissionIdentityAction({
                dni,
                email,
                excludePatientId: formData.id_paciente || undefined,
            });

            if (!res.success) {
                setIdentityCheck({ loading: false, exists: false, patient: null, error: res.error || 'Error validando identidad' });
                return;
            }

            setIdentityCheck({ loading: false, exists: res.exists, patient: res.patient });
        }, 450);

        return () => window.clearTimeout(timeout);
    }, [formData.dni, formData.id_paciente, fullEmail]);

    useEffect(() => {
        if (mode !== 'manual') {
            const timeout = window.setTimeout(() => {
                setManualMatches([]);
            }, 0);
            return () => window.clearTimeout(timeout);
        }

        if (manualSearch.trim().length < 2) {
            const timeout = window.setTimeout(() => {
                setManualMatches([]);
            }, 0);
            return () => window.clearTimeout(timeout);
        }

        const timeout = window.setTimeout(async () => {
            setManualLoading(true);
            const res = await searchAdmissionPatientsAction(manualSearch);
            setManualLoading(false);
            if (res.success) {
                setManualMatches(res.patients || []);
            }
        }, 350);

        return () => window.clearTimeout(timeout);
    }, [manualSearch, mode]);

    useEffect(() => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const bounds = canvas.getBoundingClientRect();
        canvas.width = Math.floor(bounds.width * ratio);
        canvas.height = Math.floor(bounds.height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#0f172a';
    }, [step]);

    const updateField = useCallback(<K extends keyof AdmissionDraft>(key: K, value: AdmissionDraft[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => {
            if (!prev[key as string]) return prev;
            const next = { ...prev };
            delete next[key as string];
            return next;
        });
    }, []);

    const applyCandidate = useCallback((candidate: IdentityCandidate) => {
        const [emailLocal, emailDomain] = (candidate.email || '').split('@');
        setFormData((prev) => ({
            ...prev,
            id_paciente: candidate.id_paciente,
            nombre: candidate.nombre || prev.nombre,
            apellido: candidate.apellido || prev.apellido,
            dni: candidate.documento || prev.dni,
            cuit: candidate.cuit || prev.cuit,
            email_local: emailLocal || prev.email_local,
            email_dominio: emailDomain || prev.email_dominio,
            whatsapp_numero: (candidate.telefono || '').replace(/^\+\d+/, '') || prev.whatsapp_numero,
            ciudad: candidate.ciudad || prev.ciudad,
            zona_barrio: candidate.zona_barrio || prev.zona_barrio,
        }));
        toast.success('Datos del paciente pre-cargados');
    }, []);

    const validateStep = useCallback(
        (targetStep: StepId) => {
            const parsed = admissionSubmissionSchema.safeParse({
                id_paciente: formData.id_paciente || undefined,
                nombre: formData.nombre,
                apellido: formData.apellido,
                dni: formData.dni,
                cuit: formData.cuit,
                email: fullEmail,
                telefono: fullPhone,
                ciudad: formData.ciudad,
                zona_barrio: formData.zona_barrio === 'Otro' ? formData.custom_barrio : formData.zona_barrio,
                profesional: formData.profesional,
                motivo_consulta: formData.motivo_consulta,
                referencia_origen: formData.referencia_origen,
                referencia_recomendado_por: formData.referencia_recomendado_por,
                health_alerts: healthAlerts,
                health_notes: healthAlerts.join('\n'),
                consentimiento_privacidad: formData.consentimiento_privacidad,
                consentimiento_tratamiento: formData.consentimiento_tratamiento,
                firma_data_url: formData.firma_data_url || '',
                mode,
            });

            if (parsed.success) {
                setErrors({});
                return true;
            }

            const allowed = new Set(STEP_FIELDS[targetStep]);
            const nextErrors: Record<string, string> = {};

            parsed.error.issues.forEach((issue) => {
                const key = issue.path[0];
                if (typeof key !== 'string') return;
                if (allowed.has(key as keyof AdmissionDraft)) {
                    nextErrors[key] = issue.message;
                }

                if (key === 'email' && targetStep === 2) nextErrors.email_local = issue.message;
                if (key === 'telefono' && targetStep === 2) nextErrors.whatsapp_numero = issue.message;
                if (key === 'health_alerts' && targetStep === 3) nextErrors.salud_alergias_detalle = issue.message;
            });

            if (Object.keys(nextErrors).length > 0) {
                setErrors((prev) => ({ ...prev, ...nextErrors }));
                return false;
            }

            setErrors({});
            return true;
        },
        [formData, fullEmail, fullPhone, healthAlerts, mode],
    );

    const persistLead = useCallback(async () => {
        const response = await upsertAdmissionLeadAction({
            id_paciente: formData.id_paciente || undefined,
            nombre: formData.nombre,
            apellido: formData.apellido,
            dni: formData.dni,
            cuit: formData.cuit,
            email: fullEmail,
            telefono: fullPhone,
            motivo_consulta: formData.motivo_consulta,
            referencia_origen: formData.referencia_origen,
        });

        if (response.success && response.patientId) {
            updateField('id_paciente', response.patientId);
        }
    }, [
        formData.apellido,
        formData.cuit,
        formData.dni,
        formData.id_paciente,
        formData.motivo_consulta,
        formData.nombre,
        formData.referencia_origen,
        fullEmail,
        fullPhone,
        updateField,
    ]);

    const nextStep = useCallback(async () => {
        if (!validateStep(step)) {
            toast.error('Revisa los campos marcados antes de continuar');
            return;
        }

        if (step === 1 || step === 2 || step === 4) {
            await persistLead();
        }

        setStep((prev) => (Math.min(prev + 1, 5) as StepId));
    }, [persistLead, step, validateStep]);

    const previousStep = useCallback(() => {
        setStep((prev) => (Math.max(prev - 1, 1) as StepId));
    }, []);

    const resetForm = useCallback(() => {
        setFormData(admissionDefaultValues);
        setErrors({});
        setStep(1);
        setSuccess(false);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const beginSignature = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        signatureDrawingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
        ctx.beginPath();
        ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    }, []);

    const drawSignature = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!signatureDrawingRef.current) return;
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
        ctx.stroke();
    }, []);

    const endSignature = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        signatureDrawingRef.current = false;
        canvas.releasePointerCapture(event.pointerId);
        updateField('firma_data_url', canvas.toDataURL('image/png'));
    }, [updateField]);

    const clearSignature = useCallback(() => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateField('firma_data_url', '');
    }, [updateField]);

    const submitAdmission = useCallback(async () => {
        if (!validateStep(5)) {
            toast.error('Debes aceptar y firmar para finalizar');
            return;
        }

        const payloadParse = admissionSubmissionSchema.safeParse({
            id_paciente: formData.id_paciente || undefined,
            nombre: formData.nombre,
            apellido: formData.apellido,
            dni: formData.dni,
            cuit: formData.cuit,
            email: fullEmail,
            telefono: fullPhone,
            ciudad: formData.ciudad,
            zona_barrio: formData.zona_barrio === 'Otro' ? formData.custom_barrio : formData.zona_barrio,
            profesional: formData.profesional,
            motivo_consulta: formData.motivo_consulta,
            referencia_origen:
                formData.referencia_origen === 'Recomendación de un Amigo'
                    ? `Recomendado por: ${formData.referencia_recomendado_por}`
                    : formData.referencia_origen,
            referencia_recomendado_por: formData.referencia_recomendado_por,
            health_alerts: healthAlerts,
            health_notes: healthAlerts.join('\n'),
            consentimiento_privacidad: formData.consentimiento_privacidad,
            consentimiento_tratamiento: formData.consentimiento_tratamiento,
            firma_data_url: formData.firma_data_url || '',
            mode,
        });

        if (!payloadParse.success) {
            toast.error(payloadParse.error.issues[0]?.message || 'Formulario inválido');
            return;
        }

        const response = await submitWithTriggers(payloadParse.data, {
            submitAction: submitAdmissionAction,
        });

        if (response.queued) {
            toast.warning('Sin conexión: admisión en cola. Se enviará automáticamente al reconectar.');
            return;
        }

        if (response.result?.success) {
            setSuccess(true);
            toast.success('Admisión finalizada y automatizaciones activadas');
            return;
        }

        toast.error(response.result?.error || 'No pudimos finalizar la admisión');
    }, [
        formData,
        fullEmail,
        fullPhone,
        healthAlerts,
        mode,
        submitWithTriggers,
        validateStep,
    ]);

    if (success) {
        const patientName = `${formData.nombre} ${formData.apellido}`.trim();
        const waMessage = `Hola ${patientName}, gracias por confiar en AM Clinica Dental. Tu carpeta ya fue creada y el Dr. Ariel Merino te espera para tu diagnóstico.`;

        return (
            <main className="min-h-screen bg-gradient-to-br from-[#f4f8fb] via-white to-[#eaf7fb] px-4 py-8 sm:px-6">
                <div className="mx-auto max-w-3xl">
                    <Card className="rounded-3xl border border-[#c9e5ef] bg-white p-6 shadow-xl sm:p-10">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="rounded-2xl bg-[#0ea5c6]/10 p-3 text-[#0b6c83]">
                                <BadgeCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b6c83]">Admisión completada</p>
                                <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Checklist de automatización ejecutado</h1>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {Object.entries(lastResult?.triggers || {}).map(([key, status]) => (
                                <div
                                    key={key}
                                    className={`rounded-2xl border p-4 ${status.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
                                >
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{key}</p>
                                    <p className="mt-1 text-sm font-medium text-slate-900">{status.detail}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4">
                            <p className="text-sm text-slate-700">
                                Recomendado para recepción: comparte esta URL por WhatsApp o genera QR sobre `/admision?mode=online` para auto registro.
                            </p>
                            {publicAdmissionUrl ? (
                                <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-[#7dd3fc] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">QR Recepción</p>
                                        <p className="text-sm text-slate-700">{publicAdmissionUrl}</p>
                                    </div>
                                    <QRCodeCanvas value={publicAdmissionUrl} size={96} includeMargin />
                                </div>
                            ) : (
                                <p className="mt-3 text-xs text-slate-500">
                                    Define `NEXT_PUBLIC_APP_URL` para habilitar QR absoluto (ideal para cartel en recepción).
                                </p>
                            )}
                            <a
                                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0891b2] px-4 py-2 text-sm font-semibold text-white"
                                href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Enviar WhatsApp de bienvenida
                            </a>
                        </div>

                        <Button
                            onClick={resetForm}
                            className="mt-8 h-12 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
                        >
                            Cargar nueva admisión
                        </Button>
                    </Card>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-[#f4f8fb] via-white to-[#eaf7fb] px-4 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto max-w-4xl">
                {!isOnline && (
                    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <CloudOff className="h-4 w-4" />
                        Estás offline. El formulario guarda progreso y encola la admisión al finalizar.
                    </div>
                )}

                {queueCount > 0 && (
                    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                        <RefreshCcw className="h-4 w-4" />
                        {queueCount} admisión(es) en cola esperando conexión.
                    </div>
                )}

                <Card className="rounded-3xl border border-[#c9e5ef] bg-white p-4 shadow-xl sm:p-8">
                    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b6c83]">AM Clinica Dental</p>
                            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Formulario de Admisión</h1>
                            <p className="mt-1 text-sm text-slate-600">Flujo guiado, mobile-first y preparado para recepción.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1 text-sm">
                            <button
                                type="button"
                                onClick={() => setMode('online')}
                                className={`rounded-xl px-3 py-2 font-semibold ${mode === 'online' ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`}
                            >
                                Modo online
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('manual')}
                                className={`rounded-xl px-3 py-2 font-semibold ${mode === 'manual' ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`}
                            >
                                Modo recepción
                            </button>
                        </div>
                    </div>

                    {mode === 'manual' && (
                        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Autocompletar paciente</label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={manualSearch}
                                    onChange={(event) => setManualSearch(event.target.value)}
                                    placeholder="Buscar por nombre, DNI o email"
                                    className="h-11 rounded-xl border-slate-300 bg-white pl-10"
                                />
                            </div>

                            <AnimatePresence>
                                {manualLoading ? (
                                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-slate-500">
                                        Buscando coincidencias...
                                    </motion.p>
                                ) : manualMatches.length > 0 ? (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid gap-2">
                                        {manualMatches.map((candidate) => (
                                            <button
                                                key={candidate.id_paciente}
                                                type="button"
                                                onClick={() => applyCandidate(candidate)}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-sky-300"
                                            >
                                                <p className="font-semibold text-slate-900">
                                                    {(candidate.apellido || '').toUpperCase()}, {candidate.nombre || 'Sin nombre'}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    DNI {candidate.documento || '-'} · {candidate.email || 'sin email'}
                                                </p>
                                            </button>
                                        ))}
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    )}

                    <div className="mb-6">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Paso {step} de 5</span>
                            <span>{progressValue}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                            <div
                                className="h-2 rounded-full bg-gradient-to-r from-[#0ea5c6] to-[#0284c7] transition-all duration-300"
                                style={{ width: `${progressValue}%` }}
                            />
                        </div>
                    </div>

                    {identityCheck.exists && identityCheck.patient && (
                        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-amber-900">Posible paciente duplicado detectado</p>
                                    <p className="text-xs text-amber-700">
                                        {(identityCheck.patient.apellido || '').toUpperCase()}, {identityCheck.patient.nombre || ''} · DNI {identityCheck.patient.documento || '-'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        if (identityCheck.patient) {
                                            applyCandidate(identityCheck.patient);
                                        }
                                    }}
                                    className="h-9 rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
                                >
                                    Usar registro existente
                                </Button>
                            </div>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {step === 1 && (
                                <section className="space-y-4">
                                    <SectionHeader icon={<User className="h-5 w-5" />} title="Identidad" subtitle="Validamos datos para evitar duplicados" />
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Nombre" error={errors.nombre}>
                                            <Input
                                                value={formData.nombre}
                                                onChange={(event) => updateField('nombre', event.target.value)}
                                                placeholder="Ej: Martina"
                                                className="h-12 rounded-xl"
                                            />
                                        </Field>
                                        <Field label="Apellido" error={errors.apellido}>
                                            <Input
                                                value={formData.apellido}
                                                onChange={(event) => updateField('apellido', event.target.value)}
                                                placeholder="Ej: Perez"
                                                className="h-12 rounded-xl"
                                            />
                                        </Field>
                                        <Field label="DNI (opcional)" error={errors.dni}>
                                            <Input
                                                value={formData.dni}
                                                onChange={(event) => updateField('dni', event.target.value)}
                                                placeholder="Solo si lo deseas cargar"
                                                className="h-12 rounded-xl"
                                            />
                                        </Field>
                                        <Field label="CUIT (opcional)" error={errors.cuit}>
                                            <Input
                                                value={formData.cuit || ''}
                                                onChange={(event) => updateField('cuit', event.target.value)}
                                                placeholder="Para facturación"
                                                className="h-12 rounded-xl"
                                            />
                                        </Field>
                                    </div>
                                </section>
                            )}

                            {step === 2 && (
                                <section className="space-y-4">
                                    <SectionHeader icon={<Phone className="h-5 w-5" />} title="Contacto" subtitle="Canal principal para agenda y recordatorios" />
                                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                                        <Field label="Código país" error={errors.whatsapp_pais_code}>
                                            <select
                                                value={formData.whatsapp_pais_code}
                                                onChange={(event) => updateField('whatsapp_pais_code', event.target.value)}
                                                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                                            >
                                                {PAIS_CODES.map((item) => (
                                                    <option key={item.code} value={item.code}>
                                                        {item.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="WhatsApp" error={errors.whatsapp_numero}>
                                            <Input
                                                value={formData.whatsapp_numero}
                                                onChange={(event) => updateField('whatsapp_numero', event.target.value)}
                                                className="h-12 rounded-xl"
                                                placeholder="Ej: 1122334455"
                                            />
                                        </Field>
                                    </div>

                                    {formData.whatsapp_pais_code === 'otro' && (
                                        <Field label="Código internacional" error={errors.whatsapp_custom_pais_code}>
                                            <Input
                                                value={formData.whatsapp_custom_pais_code || ''}
                                                onChange={(event) => updateField('whatsapp_custom_pais_code', event.target.value)}
                                                className="h-12 rounded-xl"
                                                placeholder="Ej: +34"
                                            />
                                        </Field>
                                    )}

                                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_180px] sm:items-end">
                                        <Field label="Email" error={errors.email_local}>
                                            <div className="relative">
                                                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                <Input
                                                    value={formData.email_local}
                                                    onChange={(event) => updateField('email_local', event.target.value)}
                                                    className="h-12 rounded-xl pl-10"
                                                    placeholder="usuario"
                                                />
                                            </div>
                                        </Field>
                                        <span className="pb-3 text-center text-slate-500">@</span>
                                        <Field label="Dominio" error={errors.email_dominio}>
                                            <select
                                                value={formData.email_dominio}
                                                onChange={(event) => updateField('email_dominio', event.target.value)}
                                                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                                            >
                                                {EMAIL_DOMAINS.map((domain) => (
                                                    <option key={domain} value={domain}>
                                                        {domain}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                    </div>

                                    {formData.email_dominio === 'otro' && (
                                        <Field label="Dominio personalizado" error={errors.email_custom_domain}>
                                            <Input
                                                value={formData.email_custom_domain || ''}
                                                onChange={(event) => updateField('email_custom_domain', event.target.value)}
                                                className="h-12 rounded-xl"
                                                placeholder="empresa.com"
                                            />
                                        </Field>
                                    )}

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Ciudad" error={errors.ciudad}>
                                            <select
                                                value={formData.ciudad}
                                                onChange={(event) => updateField('ciudad', event.target.value)}
                                                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                                            >
                                                {settings.cities.map((city) => (
                                                    <option key={city} value={city}>
                                                        {city}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="Barrio / zona" error={errors.zona_barrio || errors.custom_barrio}>
                                            <select
                                                value={formData.zona_barrio}
                                                onChange={(event) => updateField('zona_barrio', event.target.value)}
                                                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                                            >
                                                <option value="">Seleccionar</option>
                                                {settings.neighborhoods.map((item) => (
                                                    <option key={item} value={item}>
                                                        {item}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                    </div>

                                    {formData.zona_barrio === 'Otro' && (
                                        <Field label="Barrio personalizado" error={errors.custom_barrio}>
                                            <Input
                                                value={formData.custom_barrio || ''}
                                                onChange={(event) => updateField('custom_barrio', event.target.value)}
                                                className="h-12 rounded-xl"
                                                placeholder="Ej: Barrio Norte"
                                            />
                                        </Field>
                                    )}
                                </section>
                            )}

                            {step === 3 && (
                                <section className="space-y-4">
                                    <SectionHeader icon={<HeartPulse className="h-5 w-5" />} title="Salud clínica" subtitle="Alertas clínicas inmediatas para el equipo" />

                                    <HealthToggle
                                        checked={formData.salud_alergias}
                                        title="Alergias"
                                        description="Medicamentos, anestesia, látex u otras alergias"
                                        onChange={(value) => updateField('salud_alergias', value)}
                                    />
                                    {formData.salud_alergias && (
                                        <Field label="Detalle de alergias" error={errors.salud_alergias_detalle}>
                                            <Textarea
                                                value={formData.salud_alergias_detalle || ''}
                                                onChange={(event) => updateField('salud_alergias_detalle', event.target.value)}
                                                className="rounded-xl"
                                                placeholder="Describe alergias, reacción y gravedad"
                                            />
                                        </Field>
                                    )}

                                    <HealthToggle
                                        checked={formData.salud_condiciones}
                                        title="Condiciones médicas"
                                        description="Diabetes, hipertensión, cardiopatías u otras condiciones"
                                        onChange={(value) => updateField('salud_condiciones', value)}
                                    />
                                    {formData.salud_condiciones && (
                                        <Field label="Detalle de condiciones" error={errors.salud_condiciones_detalle}>
                                            <Textarea
                                                value={formData.salud_condiciones_detalle || ''}
                                                onChange={(event) => updateField('salud_condiciones_detalle', event.target.value)}
                                                className="rounded-xl"
                                                placeholder="Ej: Hipertensión controlada, medicación diaria"
                                            />
                                        </Field>
                                    )}

                                    <HealthToggle
                                        checked={formData.salud_medicacion}
                                        title="Medicación activa"
                                        description="Medicamentos actuales que puedan afectar procedimientos"
                                        onChange={(value) => updateField('salud_medicacion', value)}
                                    />
                                    {formData.salud_medicacion && (
                                        <Field label="Detalle de medicación" error={errors.salud_medicacion_detalle}>
                                            <Textarea
                                                value={formData.salud_medicacion_detalle || ''}
                                                onChange={(event) => updateField('salud_medicacion_detalle', event.target.value)}
                                                className="rounded-xl"
                                                placeholder="Ej: Anticoagulantes, dosis diaria"
                                            />
                                        </Field>
                                    )}

                                    {healthAlerts.length > 0 && (
                                        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                            <p className="font-semibold">⚠ Alertas clínicas activas</p>
                                            <ul className="mt-1 list-disc pl-5">
                                                {healthAlerts.map((alert) => (
                                                    <li key={alert}>{alert}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </section>
                            )}

                            {step === 4 && (
                                <section className="space-y-4">
                                    <SectionHeader icon={<Sparkles className="h-5 w-5" />} title="Objetivo de consulta" subtitle="Personalizamos diagnóstico antes de la primera visita" />

                                    <Field label="Motivo principal" error={errors.motivo_consulta}>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {settings.reasons.map((reason) => (
                                                <button
                                                    key={reason}
                                                    type="button"
                                                    onClick={() => updateField('motivo_consulta', reason)}
                                                    className={`rounded-xl border px-3 py-3 text-left text-sm ${
                                                        formData.motivo_consulta === reason
                                                            ? 'border-sky-400 bg-sky-50 text-sky-900'
                                                            : 'border-slate-200 bg-white text-slate-700'
                                                    }`}
                                                >
                                                    {reason}
                                                </button>
                                            ))}
                                        </div>
                                    </Field>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="¿Cómo nos conociste?" error={errors.referencia_origen}>
                                            <select
                                                value={formData.referencia_origen}
                                                onChange={(event) => updateField('referencia_origen', event.target.value)}
                                                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                                            >
                                                <option value="">Seleccionar</option>
                                                {settings.origins.map((origin) => (
                                                    <option key={origin} value={origin}>
                                                        {origin}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>

                                        {formData.referencia_origen === 'Recomendación de un Amigo' ? (
                                            <Field label="¿Quién te recomendó?" error={errors.referencia_recomendado_por}>
                                                <Input
                                                    value={formData.referencia_recomendado_por || ''}
                                                    onChange={(event) => updateField('referencia_recomendado_por', event.target.value)}
                                                    className="h-12 rounded-xl"
                                                    placeholder="Nombre y apellido"
                                                />
                                            </Field>
                                        ) : (
                                            <div />
                                        )}
                                    </div>

                                    <Field label="Experiencia de consulta" error={errors.profesional}>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {settings.prices.map((price) => (
                                                <button
                                                    key={price.id}
                                                    type="button"
                                                    onClick={() => updateField('profesional', price.name)}
                                                    className={`rounded-2xl border p-4 text-left ${
                                                        formData.profesional === price.name
                                                            ? 'border-sky-400 bg-sky-50'
                                                            : 'border-slate-200 bg-white'
                                                    }`}
                                                >
                                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{price.badge}</p>
                                                    <p className="mt-1 font-semibold text-slate-900">{price.name}</p>
                                                    <p className="text-sm text-slate-600">{price.description}</p>
                                                    <p className="mt-2 text-sm font-bold text-sky-800">{price.price}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                </section>
                            )}

                            {step === 5 && (
                                <section className="space-y-4">
                                    <SectionHeader
                                        icon={<ClipboardCheck className="h-5 w-5" />}
                                        title="Consentimiento y firma"
                                        subtitle="Último paso para activar automatizaciones"
                                    />

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                        <p className="font-semibold text-slate-900">Resumen rápido</p>
                                        <p>{formData.apellido.toUpperCase()}, {formData.nombre}</p>
                                        <p>{fullPhone} · {fullEmail}</p>
                                        <p className="mt-1">Motivo: {formData.motivo_consulta}</p>
                                        <p>Profesional: {formData.profesional}</p>
                                    </div>

                                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.consentimiento_privacidad}
                                            onChange={(event) => updateField('consentimiento_privacidad', event.target.checked)}
                                            className="mt-0.5 h-4 w-4"
                                        />
                                        <span>Acepto política de privacidad y tratamiento inicial de datos clínicos.</span>
                                    </label>
                                    {errors.consentimiento_privacidad && <p className="text-xs text-red-600">{errors.consentimiento_privacidad}</p>}

                                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.consentimiento_tratamiento}
                                            onChange={(event) => updateField('consentimiento_tratamiento', event.target.checked)}
                                            className="mt-0.5 h-4 w-4"
                                        />
                                        <span>Acepto consentimiento informado inicial para evaluación diagnóstica.</span>
                                    </label>
                                    {errors.consentimiento_tratamiento && <p className="text-xs text-red-600">{errors.consentimiento_tratamiento}</p>}

                                    <div className="rounded-2xl border border-slate-300 bg-white p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Firma digital</p>
                                            <button type="button" onClick={clearSignature} className="text-xs font-semibold text-slate-600 underline">
                                                Limpiar
                                            </button>
                                        </div>
                                        <canvas
                                            ref={signatureCanvasRef}
                                            className="h-44 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
                                            onPointerDown={beginSignature}
                                            onPointerMove={drawSignature}
                                            onPointerUp={endSignature}
                                            onPointerLeave={endSignature}
                                        />
                                        {errors.firma_data_url && <p className="mt-2 text-xs text-red-600">{errors.firma_data_url}</p>}
                                    </div>
                                </section>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={previousStep}
                            disabled={step === 1 || submitting}
                            className="h-12 rounded-xl border-slate-300"
                        >
                            <ChevronLeft className="mr-2 h-4 w-4" /> Volver
                        </Button>

                        {step < 5 ? (
                            <Button type="button" onClick={nextStep} className="h-12 rounded-xl bg-[#0284c7] text-white hover:bg-[#0369a1]">
                                Continuar <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={submitAdmission}
                                disabled={submitting}
                                className="h-12 rounded-xl bg-[#0284c7] text-white hover:bg-[#0369a1]"
                            >
                                {submitting ? 'Finalizando...' : 'Finalizar admisión'}
                            </Button>
                        )}
                    </div>
                </Card>
            </div>
        </main>
    );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#0ea5c6]/10 p-2 text-[#0b6c83]">{icon}</div>
            <div>
                <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                <p className="text-sm text-slate-600">{subtitle}</p>
            </div>
        </div>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
            {children}
            {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </label>
    );
}

function HealthToggle({
    checked,
    title,
    description,
    onChange,
}: {
    checked: boolean;
    title: string;
    description: string;
    onChange: (value: boolean) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-full rounded-2xl border px-4 py-3 text-left ${
                checked ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="text-sm text-slate-600">{description}</p>
                </div>
                {checked ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <Shield className="h-5 w-5 text-slate-300" />}
            </div>
        </button>
    );
}
