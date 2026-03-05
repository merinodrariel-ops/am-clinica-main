'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
    Search,
    Check,
    Shield,
    Calendar,
    MapPin,
    Home,
    Mail,
    Phone,
    ArrowRight,
    Sparkles,
    ChevronLeft,
    Fingerprint,
    User,
} from 'lucide-react';
import {
    lookupPatient,
    lookupPatientById,
    updatePatientData,
    type PatientLookupResult,
    type SearchMethod,
} from '@/app/actions/patient-update';

// ─── Search method tabs ──────────────────────────────────────────────
const SEARCH_TABS: Array<{ method: SearchMethod; label: string; icon: React.ReactNode; placeholder: string; inputMode: 'text' | 'numeric' | 'email'; hint: string }> = [
    {
        method: 'whatsapp',
        label: 'WhatsApp',
        icon: <Phone size={14} />,
        placeholder: 'Ej: 11 5632-5000',
        inputMode: 'numeric',
        hint: 'Poné tu número como lo tengas, con o sin código de área',
    },
    {
        method: 'dni',
        label: 'DNI',
        icon: <Fingerprint size={14} />,
        placeholder: 'Número de documento',
        inputMode: 'numeric',
        hint: 'Sin puntos ni espacios',
    },
    {
        method: 'email',
        label: 'Email',
        icon: <Mail size={14} />,
        placeholder: 'tu@email.com',
        inputMode: 'email',
        hint: 'El mismo email que usaste al registrarte',
    },
];

// ─── Field config ────────────────────────────────────────────────
const FIELD_CONFIG: Record<string, { label: string; placeholder: string; icon: React.ReactNode; type: string }> = {
    fecha_nacimiento: {
        label: 'Fecha de nacimiento',
        placeholder: '',
        icon: <Calendar size={18} />,
        type: 'date',
    },
    ciudad: {
        label: 'Ciudad',
        placeholder: 'Ej: Buenos Aires',
        icon: <MapPin size={18} />,
        type: 'text',
    },
    zona_barrio: {
        label: 'Barrio / Zona',
        placeholder: 'Ej: Palermo, Recoleta...',
        icon: <Home size={18} />,
        type: 'text',
    },
    email: {
        label: 'Email',
        placeholder: 'tu@email.com',
        icon: <Mail size={18} />,
        type: 'email',
    },
    whatsapp: {
        label: 'WhatsApp',
        placeholder: '+54 11 1234-5678',
        icon: <Phone size={18} />,
        type: 'tel',
    },
};

// ─── Component ────────────────────────────────────────────────────
export default function ActualizarDatosClient() {
    const searchParams = useSearchParams();
    const dniParam = searchParams.get('d');

    const [step, setStep] = useState<'search' | 'disambiguate' | 'form' | 'success'>('search');
    const [searchMethod, setSearchMethod] = useState<SearchMethod>('whatsapp');
    const [searchValue, setSearchValue] = useState(dniParam || '');
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [patient, setPatient] = useState<PatientLookupResult | null>(null);
    const [error, setError] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [multipleMatches, setMultipleMatches] = useState<NonNullable<PatientLookupResult['multipleMatches']>>([]);

    const currentTab = SEARCH_TABS.find((t) => t.method === searchMethod) || SEARCH_TABS[0];

    // If DNI param provided, switch to DNI method
    useEffect(() => {
        if (dniParam) {
            setSearchMethod('dni');
        }
    }, [dniParam]);

    const handleSearch = useCallback(async (value: string, method: SearchMethod) => {
        const trimmed = value.trim();
        if (trimmed.length < 3) {
            setError('Ingresá al menos 3 caracteres');
            return;
        }
        setSearching(true);
        setError('');
        setMultipleMatches([]);

        const result = await lookupPatient(trimmed, method);
        setSearching(false);

        if (result.multipleMatches && result.multipleMatches.length > 0) {
            setMultipleMatches(result.multipleMatches);
            setStep('disambiguate');
        } else if (result.found) {
            setPatient(result);
            if (result.missingFields && result.missingFields.length > 0) {
                setStep('form');
            } else {
                setStep('success');
            }
        } else {
            setError(result.error || 'No encontramos resultados.');
        }
    }, []);

    // Auto-search if DNI comes from URL param
    useEffect(() => {
        if (dniParam && dniParam.length >= 7) {
            handleSearch(dniParam, 'dni');
        }
    }, [dniParam, handleSearch]);

    const handleSelectPatient = async (id: string) => {
        setSearching(true);
        const result = await lookupPatientById(id);
        setSearching(false);

        if (result.found) {
            setPatient(result);
            if (result.missingFields && result.missingFields.length > 0) {
                setStep('form');
            } else {
                setStep('success');
            }
        } else {
            setError('Error al cargar datos del paciente');
            setStep('search');
        }
    };

    const handleSubmit = async () => {
        if (!patient?.id_paciente) return;
        setSaving(true);
        const result = await updatePatientData(patient.id_paciente, formValues);
        setSaving(false);
        if (result.success) {
            setStep('success');
        } else {
            setError(result.error || 'Error al guardar');
        }
    };

    const resetSearch = () => {
        setStep('search');
        setPatient(null);
        setError('');
        setMultipleMatches([]);
        setFormValues({});
        setSearchValue('');
    };

    const updateField = (field: string, value: string) => {
        setFormValues(prev => ({ ...prev, [field]: value }));
    };

    const filledCount = patient?.missingFields
        ? patient.missingFields.filter(f => formValues[f]?.trim()).length
        : 0;
    const totalMissing = patient?.missingFields?.length || 0;

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md mx-auto">

                {/* Logo */}
                <motion.div
                    className="text-center mb-10"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <p className="text-zinc-500 tracking-[0.35em] text-xs uppercase">— AM —</p>
                    <p className="text-zinc-600 tracking-[0.25em] text-[10px] uppercase mt-1">Estética Dental</p>
                </motion.div>

                <AnimatePresence mode="wait">
                    {/* ─── STEP 1: SMART SEARCH ────────────────────── */}
                    {step === 'search' && (
                        <motion.div
                            key="search"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                            className="space-y-8"
                        >
                            {/* Icon */}
                            <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
                                    <Shield className="text-[#D4AF37]" size={28} />
                                </div>
                            </div>

                            {/* Title */}
                            <div className="text-center">
                                <h1 className="text-3xl font-serif italic text-white tracking-tight">
                                    Actualizá tus datos
                                </h1>
                                <p className="text-zinc-500 mt-3 text-sm leading-relaxed">
                                    Buscá tu perfil para completar la información que nos falta
                                </p>
                            </div>

                            {/* Method Tabs */}
                            <div className="flex items-center bg-[#111] rounded-xl border border-zinc-800 p-1 gap-1">
                                {SEARCH_TABS.map((tab) => (
                                    <button
                                        key={tab.method}
                                        onClick={() => {
                                            setSearchMethod(tab.method);
                                            setSearchValue('');
                                            setError('');
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${searchMethod === tab.method
                                            ? 'bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/25'
                                            : 'text-zinc-600 hover:text-zinc-400'
                                            }`}
                                    >
                                        {tab.icon}
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Search Input */}
                            <div className="space-y-2">
                                <div className="relative">
                                    <input
                                        type="text"
                                        inputMode={currentTab.inputMode}
                                        value={searchValue}
                                        onChange={(e) => {
                                            setSearchValue(e.target.value);
                                            setError('');
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchValue, searchMethod)}
                                        placeholder={currentTab.placeholder}
                                        className="w-full bg-[#111] border border-zinc-800 rounded-xl px-4 py-4 text-white text-lg tracking-wider placeholder:text-zinc-700 focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/20 transition-all"
                                        autoFocus
                                    />
                                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600" size={20} />
                                </div>
                                <p className="text-zinc-700 text-[11px] px-1">
                                    {currentTab.hint}
                                </p>
                            </div>

                            {/* Error */}
                            {error && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-red-400/80 text-sm text-center"
                                >
                                    {error}
                                </motion.p>
                            )}

                            {/* Search Button */}
                            <button
                                onClick={() => handleSearch(searchValue, searchMethod)}
                                disabled={searching || searchValue.trim().length < 3}
                                className="w-full py-4 rounded-full font-medium text-sm tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-[#2DB698] to-[#2DB698]/80 text-white hover:shadow-[0_0_25px_rgba(45,182,152,0.3)]"
                            >
                                {searching ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>Buscar <ArrowRight size={16} /></>
                                )}
                            </button>

                            {/* Privacy note */}
                            <p className="text-zinc-700 text-[11px] text-center leading-relaxed">
                                🔒 Tus datos están protegidos y solo serán usados para tu atención médica.
                            </p>
                        </motion.div>
                    )}

                    {/* ─── STEP 1.5: DISAMBIGUATION ─────────────────── */}
                    {step === 'disambiguate' && (
                        <motion.div
                            key="disambiguate"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                            className="space-y-6"
                        >
                            {/* Back */}
                            <button
                                onClick={resetSearch}
                                className="text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1 text-xs uppercase tracking-wider"
                            >
                                <ChevronLeft size={14} /> Volver
                            </button>

                            <div className="text-center">
                                <h1 className="text-2xl font-serif italic text-white tracking-tight">
                                    Encontramos varios resultados
                                </h1>
                                <p className="text-zinc-500 mt-2 text-sm">
                                    Seleccioná tu perfil
                                </p>
                            </div>

                            <div className="space-y-3">
                                {multipleMatches.map((match, i) => (
                                    <motion.button
                                        key={match.id_paciente}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.08 }}
                                        onClick={() => handleSelectPatient(match.id_paciente)}
                                        disabled={searching}
                                        className="w-full bg-[#111] border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5 transition-all text-left group"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#D4AF37]/20 transition-colors">
                                            <User className="text-[#D4AF37]" size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium text-sm truncate">
                                                {match.nombre} {match.apellido}
                                            </p>
                                            {match.hint && (
                                                <p className="text-zinc-600 text-xs mt-0.5">{match.hint}</p>
                                            )}
                                        </div>
                                        <ArrowRight size={14} className="text-zinc-700 group-hover:text-[#D4AF37] transition-colors" />
                                    </motion.button>
                                ))}
                            </div>

                            <p className="text-zinc-700 text-[11px] text-center">
                                ¿No te ves en la lista? <button onClick={resetSearch} className="text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors underline">Probá con otro dato</button>
                            </p>
                        </motion.div>
                    )}

                    {/* ─── STEP 2: UPDATE FORM ────────────────────── */}
                    {step === 'form' && patient && (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                            className="space-y-6"
                        >
                            {/* Back button */}
                            <button
                                onClick={resetSearch}
                                className="text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1 text-xs uppercase tracking-wider"
                            >
                                <ChevronLeft size={14} /> Volver
                            </button>

                            {/* Greeting */}
                            <div className="text-center">
                                <h1 className="text-2xl font-serif italic text-white tracking-tight">
                                    Hola, {patient.nombre}
                                </h1>
                                <p className="text-zinc-500 mt-2 text-sm">
                                    Completá los datos que nos faltan para brindarte una mejor atención
                                </p>
                            </div>

                            {/* Found badge */}
                            <div className="bg-[#87A985]/10 border border-[#87A985]/25 rounded-xl p-3.5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#87A985]/20 flex items-center justify-center flex-shrink-0">
                                    <Check className="text-[#87A985]" size={16} />
                                </div>
                                <div>
                                    <p className="text-[#87A985] text-sm font-medium">
                                        ¡Te encontramos, {patient.nombre}!
                                    </p>
                                    <p className="text-zinc-600 text-xs mt-0.5">
                                        Solo completá lo que nos falta
                                    </p>
                                </div>
                            </div>

                            {/* Missing fields */}
                            {patient.missingFields && patient.missingFields.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium">
                                            Datos faltantes
                                        </p>
                                        <p className="text-[10px] text-zinc-600">
                                            {filledCount} / {totalMissing}
                                        </p>
                                    </div>

                                    {patient.missingFields.map((field, i) => {
                                        const config = FIELD_CONFIG[field];
                                        if (!config) return null;
                                        return (
                                            <motion.div
                                                key={field}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                                className="space-y-1.5"
                                            >
                                                <label className="text-zinc-400 text-xs flex items-center gap-2">
                                                    <span className="text-[#D4AF37]/60">{config.icon}</span>
                                                    {config.label}
                                                </label>
                                                <input
                                                    type={config.type}
                                                    value={formValues[field] || ''}
                                                    onChange={(e) => updateField(field, e.target.value)}
                                                    placeholder={config.placeholder}
                                                    className="w-full bg-[#111] border border-zinc-800 border-l-2 border-l-[#D4AF37]/40 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#D4AF37]/50 focus:border-l-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all text-sm"
                                                />
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <p className="text-red-400/80 text-sm text-center">{error}</p>
                            )}

                            {/* Privacy note */}
                            <p className="text-zinc-700 text-[11px] leading-relaxed flex items-start gap-2">
                                <span className="mt-0.5">🔒</span>
                                Solo te pedimos lo que nos falta — el resto de tus datos ya los tenemos guardados de forma segura.
                            </p>

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={saving || filledCount === 0}
                                className="w-full py-4 rounded-full font-medium text-sm tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-[#D4AF37] to-[#EAAE10] text-black hover:shadow-[0_0_25px_rgba(212,175,55,0.3)]"
                            >
                                {saving ? (
                                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                ) : (
                                    <>Guardar Datos <ArrowRight size={16} /></>
                                )}
                            </button>
                        </motion.div>
                    )}

                    {/* ─── STEP 3: SUCCESS ────────────────────────── */}
                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                            className="text-center space-y-8"
                        >
                            {/* Success icon */}
                            <div className="flex justify-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.2 }}
                                    className="w-20 h-20 rounded-full bg-[#87A985]/15 border border-[#87A985]/30 flex items-center justify-center"
                                >
                                    <Sparkles className="text-[#87A985]" size={32} />
                                </motion.div>
                            </div>

                            <div>
                                <h1 className="text-2xl font-serif italic text-white tracking-tight">
                                    {patient?.missingFields?.length === 0
                                        ? '¡Tus datos están completos!'
                                        : '¡Datos actualizados!'}
                                </h1>
                                <p className="text-zinc-500 mt-3 text-sm leading-relaxed max-w-xs mx-auto">
                                    {patient?.missingFields?.length === 0
                                        ? `Gracias ${patient?.nombre}, ya tenemos toda tu información al día.`
                                        : `Gracias ${patient?.nombre}, tus datos fueron guardados exitosamente.`}
                                </p>
                            </div>

                            {/* Confirmation card */}
                            <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
                                <div className="flex items-center gap-3 justify-center">
                                    <Check className="text-[#87A985]" size={18} />
                                    <p className="text-zinc-400 text-sm">
                                        Perfil actualizado correctamente
                                    </p>
                                </div>
                            </div>

                            <p className="text-zinc-700 text-[11px]">
                                Ya podés cerrar esta ventana.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer */}
                <motion.div
                    className="text-center mt-16"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                >
                    <p className="text-zinc-700 tracking-[0.2em] text-[10px] uppercase">
                        AM Estética Dental · Dr. Ariel Merino
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
