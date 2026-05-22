'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ImagePlus, Loader2, Mail, MessageCircle, Sparkles, UploadCloud } from 'lucide-react';
import { capturePublicSmileLead } from '@/app/actions/public-smile-leads';
import { useSmileDesign } from '@/hooks/useSmileDesign';
import BeforeAfterSlider from '@/components/patients/drive/BeforeAfterSlider';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_MB = 12;
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_SMILE_SIMULATOR_WHATSAPP_NUMBER || '';
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_SMILE_SIMULATOR_EMAIL || 'info@amesteticadental.com';

function buildWhatsappUrl(name: string, email: string) {
    const message = [
        'Hola AM Estética Dental, acabo de probar el simulador de sonrisa con IA.',
        name ? `Mi nombre es ${name}.` : null,
        email ? `Mi email es ${email}.` : null,
        'Quiero una evaluación real para mi caso.',
    ].filter(Boolean).join('\n');

    const encoded = encodeURIComponent(message);
    return WHATSAPP_NUMBER
        ? `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`;
}

export default function PublicSmileSimulatorPage() {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const smileDesign = useSmileDesign();
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [leadSaved, setLeadSaved] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isProcessing = smileDesign.state === 'aligning' || smileDesign.state === 'enhancing' || submitting;
    const result = smileDesign.result;

    const whatsappUrl = useMemo(
        () => buildWhatsappUrl(fullName.trim(), email.trim()),
        [fullName, email]
    );

    function validateFile(nextFile: File) {
        if (!ACCEPTED_TYPES.includes(nextFile.type)) {
            return 'Subí una foto JPG, PNG o WebP.';
        }

        if (nextFile.size > MAX_FILE_MB * 1024 * 1024) {
            return `La foto no puede pesar más de ${MAX_FILE_MB} MB.`;
        }

        return null;
    }

    function pickFile(nextFile?: File | null) {
        if (!nextFile) return;
        const error = validateFile(nextFile);
        if (error) {
            setFormError(error);
            return;
        }

        setFile(nextFile);
        setLeadSaved(false);
        smileDesign.reset();
        setFormError(null);
    }

    async function handleGenerate() {
        setFormError(null);

        if (!file) {
            setFormError('Subí una foto de rostro para generar la simulación.');
            return;
        }

        if (!accepted) {
            setFormError('Aceptá que esto es una simulación orientativa antes de continuar.');
            return;
        }

        setSubmitting(true);
        const lead = await capturePublicSmileLead({
            fullName,
            email,
            whatsapp,
            photoName: file.name,
        });
        setSubmitting(false);

        if (!lead.success) {
            setFormError(lead.error || 'No pudimos guardar tus datos.');
            return;
        }

        setLeadSaved(true);
        await smileDesign.process(file);
    }

    return (
        <main className="min-h-screen bg-[#f7f4ef] text-[#1f2933]">
            <section className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-8 px-4 py-6 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:py-10">
                <div className="flex flex-col justify-between gap-6">
                    <div>
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d6c7b3] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6a3c]">
                            <Sparkles className="h-3.5 w-3.5" />
                            Simulador con IA
                        </div>

                        <h1 className="text-4xl font-black leading-tight tracking-tight text-[#111827] md:text-5xl">
                            Probá tu diseño de sonrisa en una foto
                        </h1>
                        <p className="mt-4 max-w-xl text-base leading-7 text-[#52606d]">
                            Subí una foto de frente y generamos una simulación orientativa para que veas un antes y después. No reemplaza una evaluación clínica.
                        </p>
                    </div>

                    <div className="rounded-lg border border-[#e3d7c7] bg-white p-4 shadow-sm">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase text-[#6b7280]">Nombre</span>
                                <input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full rounded-md border border-[#d9d2c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#a87832]"
                                    placeholder="Tu nombre"
                                    autoComplete="name"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase text-[#6b7280]">Email</span>
                                <input
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-md border border-[#d9d2c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#a87832]"
                                    placeholder="tu@email.com"
                                    type="email"
                                    autoComplete="email"
                                />
                            </label>
                        </div>

                        <label className="mt-3 block">
                            <span className="mb-1 block text-xs font-bold uppercase text-[#6b7280]">WhatsApp opcional</span>
                            <input
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                className="w-full rounded-md border border-[#d9d2c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#a87832]"
                                placeholder="+54 9..."
                                type="tel"
                                autoComplete="tel"
                            />
                        </label>

                        <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#52606d]">
                            <input
                                type="checkbox"
                                checked={accepted}
                                onChange={(e) => setAccepted(e.target.checked)}
                                className="mt-1 h-4 w-4 accent-[#a87832]"
                            />
                            <span>Acepto que esta imagen es una simulación estética generada por IA y que los resultados reales pueden variar.</span>
                        </label>

                        {formError && (
                            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex min-h-[620px] flex-col rounded-lg border border-[#ded6ca] bg-white p-3 shadow-sm">
                    {!result ? (
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragging(false);
                                pickFile(e.dataTransfer.files?.[0]);
                            }}
                            className={[
                                'flex flex-1 flex-col items-center justify-center rounded-md border-2 border-dashed px-5 text-center transition-colors',
                                dragging ? 'border-[#a87832] bg-[#fbf6ee]' : 'border-[#d8cbbb] bg-[#faf8f4]',
                            ].join(' ')}
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => pickFile(e.target.files?.[0])}
                            />

                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#eadcc9] text-[#8a5f22]">
                                {file ? <ImagePlus className="h-8 w-8" /> : <UploadCloud className="h-8 w-8" />}
                            </div>

                            <h2 className="text-2xl font-black text-[#111827]">
                                {file ? file.name : 'Arrastrá una foto de rostro'}
                            </h2>
                            <p className="mt-2 max-w-md text-sm leading-6 text-[#667085]">
                                Mejor si es una foto frontal, nítida, con buena luz y sonrisa visible.
                            </p>

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => inputRef.current?.click()}
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#cdbb9f] px-4 py-2.5 text-sm font-bold text-[#6f4d1f] hover:bg-[#f6efe4]"
                                >
                                    <UploadCloud className="h-4 w-4" />
                                    Elegir foto
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGenerate}
                                    disabled={isProcessing || !file}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#111827] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#263445] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    Generar simulación
                                </button>
                            </div>

                            {leadSaved && isProcessing && (
                                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#8a6a3c]">
                                    Datos recibidos. Procesando la imagen...
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-1 flex-col gap-4">
                            <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-md bg-black">
                                <BeforeAfterSlider
                                    beforeSrc={result.beforeDataUrl}
                                    afterSrc={result.afterDataUrl}
                                    className="h-full min-h-[420px]"
                                />
                            </div>

                            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                                <div className="flex items-start gap-2 text-sm text-[#52606d]">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                    <p>
                                        Simulación lista. Para una evaluación real, envianos el caso y coordinamos una consulta.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        Enviar por WhatsApp
                                    </a>
                                    <a
                                        href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Consulta por diseño de sonrisa')}`}
                                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#cdbb9f] px-4 py-2.5 text-sm font-bold text-[#6f4d1f] hover:bg-[#f6efe4]"
                                    >
                                        <Mail className="h-4 w-4" />
                                        Email
                                    </a>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setFile(null);
                                    setLeadSaved(false);
                                    smileDesign.reset();
                                }}
                                className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[#6f4d1f] hover:text-[#111827]"
                            >
                                Probar con otra foto
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
