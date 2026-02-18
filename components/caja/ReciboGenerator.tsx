'use client';

import React, { useRef, useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { uploadToStorage } from '@/lib/supabase-storage';
import { sendReciboEmailAction } from '@/app/actions/email';

interface ReciboData {
    numero: string;
    fecha: Date;
    paciente: string;
    concepto: string;
    monto: number;
    moneda: string;
    metodoPago: string;
    atendidoPor?: string;
}

interface ReciboGeneratorProps {
    data: ReciboData;
    onGenerated?: (result: { imageUrl: string; storageUrl?: string }) => void;
    autoSave?: boolean;
    recipientPhone?: string | null;
    recipientEmail?: string | null;
}

export function ReciboGenerator({
    data,
    onGenerated,
    autoSave = true,
    recipientPhone,
    recipientEmail,
}: ReciboGeneratorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [storageImageUrl, setStorageImageUrl] = useState<string | null>(null);
    const [whatsappTarget, setWhatsappTarget] = useState(recipientPhone || '');
    const [emailTarget, setEmailTarget] = useState(recipientEmail || '');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailStatus, setEmailStatus] = useState<string | null>(null);

    const getCurrencyCode = () => {
        const code = (data.moneda || 'ARS').toUpperCase();
        if (code === 'USD' || code === 'ARS') return code;
        return 'ARS';
    };

    const formatAmountWithCode = (amount: number, code: string) => {
        const numberPart = new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount || 0);
        return `${code} ${numberPart}`;
    };

    const generateRecibo = async () => {
        setIsGenerating(true);

        try {
            const canvas = canvasRef.current;
            if (!canvas) throw new Error('Canvas not available');

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Context not available');

            // Set canvas size (optimized for WhatsApp)
            canvas.width = 600;
            canvas.height = 800;

            // Background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Header background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, 120);

            // Header text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('AM CLÍNICA', canvas.width / 2, 50);

            ctx.font = '16px Arial';
            ctx.fillText('Estética Dental', canvas.width / 2, 75);
            ctx.fillText('Comprobante de Pago', canvas.width / 2, 100);

            // Recibo number
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`Nº ${data.numero}`, canvas.width - 30, 160);

            // Date
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            const fechaStr = data.fecha.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
            });
            ctx.fillText(`Fecha: ${fechaStr}`, 30, 160);

            // Divider
            ctx.strokeStyle = '#e5e5e5';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(30, 180);
            ctx.lineTo(canvas.width - 30, 180);
            ctx.stroke();

            // Content
            let y = 220;
            const lineHeight = 45;

            // Helper function for labeled rows
            const drawRow = (label: string, value: string, bold = false) => {
                ctx.font = '14px Arial';
                ctx.fillStyle = '#666666';
                ctx.textAlign = 'left';
                ctx.fillText(label, 30, y);

                ctx.font = bold ? 'bold 18px Arial' : '16px Arial';
                ctx.fillStyle = '#000000';
                ctx.fillText(value, 30, y + 22);
                y += lineHeight;
            };

            drawRow('PACIENTE', data.paciente);
            drawRow('CONCEPTO', data.concepto);
            drawRow('MÉTODO DE PAGO', data.metodoPago);

            // Divider before amount
            y += 10;
            ctx.strokeStyle = '#e5e5e5';
            ctx.beginPath();
            ctx.moveTo(30, y);
            ctx.lineTo(canvas.width - 30, y);
            ctx.stroke();
            y += 30;

            // Amount (highlighted)
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(30, y - 15, canvas.width - 60, 70);

            const currencyCode = getCurrencyCode();

            ctx.font = '14px Arial';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'left';
            ctx.fillText(`MONTO TOTAL (${currencyCode})`, 50, y + 10);

            ctx.font = 'bold 36px Arial';
            ctx.fillStyle = '#000000';
            const montoStr = formatAmountWithCode(data.monto, currencyCode);
            ctx.fillText(montoStr, 50, y + 48);

            y += 100;

            // Attendant
            if (data.atendidoPor) {
                ctx.font = '14px Arial';
                ctx.fillStyle = '#666666';
                ctx.textAlign = 'center';
                ctx.fillText(`Atendido por: ${data.atendidoPor}`, canvas.width / 2, y);
            }

            // Footer
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, canvas.height - 80, canvas.width, 80);

            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Gracias por confiar en nosotros', canvas.width / 2, canvas.height - 50);
            ctx.fillText('📍 Buenos Aires, Argentina | 📱 WhatsApp disponible', canvas.width / 2, canvas.height - 30);

            // Convert to image
            const imageUrl = canvas.toDataURL('image/jpeg', 0.9);
            setGeneratedImage(imageUrl);

            let storageUrl: string | undefined;

            // Auto-save to storage
            if (autoSave) {
                const base64Data = imageUrl.split(',')[1];
                const result = await uploadToStorage(
                    'caja-recepcion',
                    `recibo-${data.numero}-${Date.now()}.jpg`,
                    base64Data,
                    'image/jpeg'
                );
                if (result.success) {
                    storageUrl = result.publicUrl;
                    setStorageImageUrl(result.publicUrl || null);
                }
            }

            onGenerated?.({ imageUrl, storageUrl });

        } catch (error) {
            console.error('Error generating recibo:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const shareViaWhatsApp = () => {
        if (!generatedImage) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // For WhatsApp, we need to download and share manually
        // or use Web Share API if available
        if (navigator.share) {
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const file = new File([blob], `recibo-${data.numero}.jpg`, { type: 'image/jpeg' });
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Comprobante de Pago',
                        text: `Comprobante Nº ${data.numero} - AM Clínica`,
                    });
                } catch (_err) {
                    console.log('Share cancelled or failed');
                }
            }, 'image/jpeg', 0.9);
        } else {
            // Fallback: download
            downloadImage();
        }
    };

    const openWhatsAppWeb = () => {
        if (!generatedImage) return;

        const currencyCode = getCurrencyCode();

        const digits = (whatsappTarget || '').replace(/\D/g, '');
        const baseMessage = [
            `Hola! Te compartimos tu comprobante de pago de AM Clinica.`,
            `Recibo: ${data.numero}`,
            `Concepto: ${data.concepto}`,
            `Monto: ${formatAmountWithCode(data.monto, currencyCode)}`,
            storageImageUrl ? `Comprobante online: ${storageImageUrl}` : 'Adjunto: comprobante en imagen.',
        ].join('\n');

        const encoded = encodeURIComponent(baseMessage);
        const targetUrl = digits
            ? `https://web.whatsapp.com/send?phone=${digits}&text=${encoded}`
            : `https://web.whatsapp.com/send?text=${encoded}`;

        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };

    const sendByEmail = async () => {
        if (!generatedImage) return;

        setEmailStatus(null);
        setSendingEmail(true);
        try {
            const result = await sendReciboEmailAction({
                toEmail: emailTarget,
                pacienteNombre: data.paciente,
                reciboNumero: data.numero,
                concepto: data.concepto,
                monto: data.monto,
                moneda: getCurrencyCode(),
                imageDataUrl: generatedImage,
                storageUrl: storageImageUrl || undefined,
            });

            if (result.success) {
                setEmailStatus('Email enviado correctamente');
            } else {
                setEmailStatus(result.error || 'No se pudo enviar el email');
            }
        } catch (error) {
            setEmailStatus(error instanceof Error ? error.message : 'Error inesperado al enviar email');
        } finally {
            setSendingEmail(false);
        }
    };


    const downloadImage = () => {
        if (!generatedImage) return;

        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `recibo-${data.numero}.jpg`;
        link.click();
    };

    return (

        <div className="recibo-generator">
            <canvas
                ref={canvasRef}
                style={{ display: generatedImage ? 'none' : 'block', maxWidth: '100%' }}
            />

            {!generatedImage ? (
                <Button
                    onClick={generateRecibo}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg h-auto"
                >
                    {isGenerating ? '⏳ Generando...' : '🧾 Generar Comprobante'}
                </Button>
            ) : (
                <div className="flex flex-col gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={generatedImage}
                        alt="Comprobante"
                        className="w-full max-h-[52vh] object-contain rounded-xl shadow-2xl"
                    />

                    <div className="grid gap-2">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">WhatsApp destino (opcional)</label>
                        <Input
                            type="text"
                            value={whatsappTarget}
                            onChange={(event) => setWhatsappTarget(event.target.value)}
                            placeholder="Ej: +54911..."
                            className="w-full text-sm h-auto"
                        />
                    </div>

                    <div className="grid gap-2">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Email destino (Gmail)</label>
                        <Input
                            type="email"
                            value={emailTarget}
                            onChange={(event) => setEmailTarget(event.target.value)}
                            placeholder="paciente@email.com"
                            className="w-full text-sm h-auto"
                        />
                        {emailStatus && (
                            <p className={`text-xs m-0 ${emailStatus.includes('correctamente') ? 'text-emerald-600' : 'text-red-700'}`}>
                                {emailStatus}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 flex-wrap">
                        <Button
                            onClick={openWhatsAppWeb}
                            className="flex-1 px-5 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold h-auto border-none"
                        >
                            💬 WhatsApp Web
                        </Button>

                        <Button
                            onClick={shareViaWhatsApp}
                            className="flex-1 px-5 py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold h-auto border-none"
                        >
                            📱 Compartir archivo
                        </Button>

                        <Button
                            onClick={sendByEmail}
                            disabled={sendingEmail}
                            className="flex-1 px-5 py-3 bg-red-500 hover:bg-red-600 text-white font-bold h-auto border-none disabled:opacity-70"
                        >
                            {sendingEmail ? '⏳ Enviando email...' : '✉️ Enviar por Gmail'}
                        </Button>

                        <Button
                            onClick={downloadImage}
                            className="flex-1 px-5 py-3 bg-gray-800 hover:bg-gray-900 text-white font-bold h-auto border-none"
                        >
                            💾 Descargar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper to get next recibo number
export function generateReciboNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `${year}${month}-${random}`;
}
