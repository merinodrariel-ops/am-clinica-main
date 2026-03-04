'use client';

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';

export default function AdmissionQrPage() {
    const [runtimeBaseUrl] = useState(() =>
        typeof window !== 'undefined' ? window.location.origin : '',
    );

    const admissionUrl = 'https://am-clinica-admision.vercel.app/';

    const whatsappShareUrl = useMemo(() => {
        if (!admissionUrl) return '';
        return `https://wa.me/?text=${encodeURIComponent(`Hola, te comparto el formulario de admisión: ${admissionUrl}`)}`;
    }, [admissionUrl]);

    const copyLink = async () => {
        if (!admissionUrl) return;
        await navigator.clipboard.writeText(admissionUrl);
    };

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
                <h1 className="text-2xl font-bold text-slate-900">QR Formulario de Admisión</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Imprime esta pantalla y colócala en recepción para que el paciente escanee y complete su admisión.
                </p>

                {admissionUrl ? (
                    <>
                        <div className="mt-8 flex justify-center">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <QRCodeSVG value={admissionUrl} size={240} includeMargin />
                            </div>
                        </div>

                        <p className="mt-4 break-all rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">{admissionUrl}</p>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                            <Button onClick={copyLink} className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                                Copiar enlace
                            </Button>
                            <a
                                href={whatsappShareUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0284c7] px-4 text-sm font-semibold text-white hover:bg-[#0369a1]"
                            >
                                Compartir por WhatsApp
                            </a>
                            <Button onClick={() => window.print()} variant="outline" className="h-11 rounded-xl">
                                Imprimir QR
                            </Button>
                        </div>
                    </>
                ) : (
                    <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Configura `NEXT_PUBLIC_APP_URL` para generar un QR válido.
                    </p>
                )}
            </div>
        </main>
    );
}
