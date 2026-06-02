'use client';

import { useMemo, useState } from 'react';
import { Briefcase, CheckCircle2, FileText, Loader2, Send, ShieldCheck } from 'lucide-react';
import { submitJobApplication } from '@/app/actions/job-applications';

const AREAS = [
    'Odontólogo General',
    'Asistente Dental',
    'Recepción - Secretaría',
    'Administración & Logística',
    'Laboratorio Dental - Fresado - Diseño - Maquillaje',
    'Inversor & Capital',
    'Cirugía Implantes',
    'Ortodoncia',
    'Especialista en Prótesis Fija - Rehabilitación',
    'Otros',
];

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-white/30 placeholder:text-white/25';
const textareaClass = `${inputClass} min-h-28 resize-y`;
const labelClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-white/45';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="grid gap-2">
            <span className={labelClass}>{label}</span>
            {children}
        </label>
    );
}

export default function JobApplicationForm() {
    const [area, setArea] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const startedAt = useMemo(() => Date.now(), []);

    async function handleSubmit(formData: FormData) {
        setIsSubmitting(true);
        setError('');

        try {
            const result = await submitJobApplication(formData);
            if (result.success) {
                setSuccess(true);
                return;
            }
            setError(result.error || 'No pudimos recibir la postulación.');
        } catch {
            setError('No pudimos recibir la postulación. Intentá de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (success) {
        return (
            <section className="min-h-screen bg-[#050505] px-5 py-16 text-white">
                <div className="mx-auto flex min-h-[72vh] max-w-2xl flex-col items-center justify-center text-center">
                    <CheckCircle2 className="mb-6 h-14 w-14 text-emerald-300" />
                    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-emerald-200/80">Postulación recibida</p>
                    <h1 className="text-4xl font-light tracking-tight md:text-5xl">Gracias por querer sumarte a Team AM.</h1>
                    <p className="mt-6 text-base leading-relaxed text-white/62">
                        Recibimos tus datos y tu CV. Si tu perfil coincide con una búsqueda activa, el equipo AM te va a contactar.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="min-h-screen bg-[#050505] px-5 py-10 text-white md:py-16">
            <div className="mx-auto max-w-5xl">
                <header className="mb-10 grid gap-8 border-b border-white/10 pb-10 md:grid-cols-[1fr_0.72fr] md:items-end">
                    <div>
                        <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-white/45">
                            <Briefcase size={14} /> Team AM
                        </p>
                        <h1 className="max-w-3xl text-4xl font-light leading-tight tracking-tight md:text-6xl">
                            Trabajá con nosotros.
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/62 md:text-lg">
                            Completá tus datos, contanos por qué querés sumarte y adjuntá tu CV. Revisamos las postulaciones cuando abrimos búsquedas o detectamos un perfil compatible.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                        <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                            <p className="text-sm leading-relaxed text-white/58">
                                Tu CV queda guardado en un espacio privado. Solo el equipo interno puede revisarlo para procesos de selección.
                            </p>
                        </div>
                    </div>
                </header>

                <form action={handleSubmit} className="grid gap-8">
                    <input type="hidden" name="form_started_at" value={startedAt} />
                    <input className="hidden" tabIndex={-1} autoComplete="off" name="company" />

                    <div className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:grid-cols-2 md:p-7">
                        <Field label="Nombre y apellido *">
                            <input required name="full_name" className={inputClass} placeholder="Ej. Laura Pérez" />
                        </Field>
                        <Field label="Email *">
                            <input required type="email" name="email" className={inputClass} placeholder="tu@email.com" />
                        </Field>
                        <Field label="Área de postulación *">
                            <select required name="area" value={area} onChange={(event) => setArea(event.target.value)} className={inputClass}>
                                <option value="" className="bg-zinc-950">Seleccioná un área</option>
                                {AREAS.map((item) => (
                                    <option key={item} value={item} className="bg-zinc-950">{item}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Ciudad y barrio *">
                            <input required name="location" className={inputClass} placeholder="Ej. CABA, Palermo" />
                        </Field>
                        {area === 'Otros' && (
                            <Field label="Otra área *">
                                <input required name="other_area" className={inputClass} placeholder="Contanos en qué área" />
                            </Field>
                        )}
                        <Field label="Instagram *">
                            <input required name="instagram_url" className={inputClass} placeholder="@usuario o URL" />
                        </Field>
                    </div>

                    <div className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-7">
                        <Field label="¿Cuál es tu experiencia previa en esta área? *">
                            <textarea required name="experience" className={textareaClass} />
                        </Field>
                        <Field label="¿Cuáles son las principales funciones y responsabilidades en esta área según tu criterio? *">
                            <textarea required name="area_responsibilities" className={textareaClass} />
                        </Field>
                        <Field label="¿Cómo trabajás en equipo? *">
                            <textarea required name="teamwork_answer" className={textareaClass} />
                        </Field>
                        <Field label="¿Estás interesada/o en seguir aprendiendo y mejorando tus habilidades? *">
                            <textarea required name="learning_interest" className={textareaClass} />
                        </Field>
                        <Field label="¿Cuáles son tus metas y aspiraciones a largo plazo? *">
                            <textarea required name="long_term_goals" className={textareaClass} />
                        </Field>
                        <Field label="¿Qué aportarías al equipo? *">
                            <textarea required name="team_contribution" className={textareaClass} />
                        </Field>
                        <Field label="¿Por qué deberíamos elegirte? *">
                            <textarea required name="why_choose_you" className={textareaClass} />
                        </Field>
                    </div>

                    <div className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-7">
                        <Field label="Adjuntá tu CV *">
                            <span className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-white/55">
                                <FileText size={18} className="text-white/40" />
                                <input required type="file" name="cv" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black hover:file:bg-white/85" />
                            </span>
                        </Field>

                        <label className="flex items-start gap-3 text-sm leading-relaxed text-white/58">
                            <input required type="checkbox" name="consent" className="mt-1 h-4 w-4 rounded border-white/20 bg-black" />
                            <span>
                                Acepto que AM Estética Dental use los datos enviados exclusivamente para evaluar mi postulación y contactarme por procesos de selección.
                            </span>
                        </label>

                        {error && (
                            <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60 md:w-fit"
                        >
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            Enviar postulación
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
}
