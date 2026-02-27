'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, Sparkles, Star } from 'lucide-react';
import { ImageComparator } from '@/components/patients/ImageComparator';

const GOOGLE_REVIEW_LINK = 'https://g.page/r/CQ3df5Xn-J6oEBM/review';

export default function SmileComparisonPage() {
    const searchParams = useSearchParams();
    const before = searchParams.get('before') || '';
    const after = searchParams.get('after') || '';
    const patient = searchParams.get('patient') || 'Paciente';

    const whatsappUrl = useMemo(() => {
        const message = `Gracias por confiar en AM Clinica Dental. Gracias por darnos la oportunidad de cambiar tu vida a traves de tu sonrisa. Si queres, podes dejarnos tu referencia aca: ${GOOGLE_REVIEW_LINK}`;
        return `https://wa.me/?text=${encodeURIComponent(message)}`;
    }, []);

    if (!before || !after) {
        return (
            <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
                <div className="max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center">
                    <h1 className="text-2xl font-bold">Comparador no disponible</h1>
                    <p className="mt-2 text-sm text-slate-400">
                        Este link no tiene las fotos necesarias. Solicítalo nuevamente en recepción.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-300">
                        <Sparkles className="h-6 w-6" />
                    </div>
                    <h1 className="text-3xl font-bold">Gracias por confiar en AM Clinica Dental</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        {patient}, gracias por darnos la oportunidad de cambiar tu vida a traves de tu sonrisa.
                    </p>
                </div>

                <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4">
                    <ImageComparator beforeImage={before} afterImage={after} orientation="horizontal" />
                </div>

                <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 text-center">
                    <p className="text-sm text-slate-300">Si tu experiencia fue positiva, tu referencia nos ayuda muchísimo.</p>
                    <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
                        <a
                            href={GOOGLE_REVIEW_LINK}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
                        >
                            <Star className="h-4 w-4" />
                            Dejar referencia en Google
                        </a>
                        <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-300 hover:bg-green-500/20"
                        >
                            <MessageCircle className="h-4 w-4" />
                            Compartir por WhatsApp
                        </a>
                    </div>
                </div>
            </div>
        </main>
    );
}
