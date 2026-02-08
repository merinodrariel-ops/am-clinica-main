'use client';

import React, { useRef, useState } from 'react';
import { uploadToStorage } from '@/lib/supabase-storage';

interface ReciboData {
    numero: string;
    fecha: Date;
    paciente: string;
    concepto: string;
    monto: number;
    metodoPago: string;
    atendidoPor?: string;
}

interface ReciboGeneratorProps {
    data: ReciboData;
    onGenerated?: (result: { imageUrl: string; storageUrl?: string }) => void;
    autoSave?: boolean;
}

export function ReciboGenerator({ data, onGenerated, autoSave = true }: ReciboGeneratorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

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

            ctx.font = '14px Arial';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'left';
            ctx.fillText('MONTO TOTAL', 50, y + 10);

            ctx.font = 'bold 36px Arial';
            ctx.fillStyle = '#000000';
            const montoStr = new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
            }).format(data.monto);
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
                } catch (err) {
                    console.log('Share cancelled or failed');
                }
            }, 'image/jpeg', 0.9);
        } else {
            // Fallback: download
            downloadImage();
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
                <button
                    onClick={generateRecibo}
                    disabled={isGenerating}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isGenerating ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                    }}
                >
                    {isGenerating ? '⏳ Generando...' : '🧾 Generar Comprobante'}
                </button>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <img
                        src={generatedImage}
                        alt="Comprobante"
                        style={{
                            maxWidth: '100%',
                            borderRadius: '12px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                        }}
                    />

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            onClick={shareViaWhatsApp}
                            style={{
                                flex: 1,
                                padding: '12px 20px',
                                backgroundColor: '#25D366',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 'bold',
                            }}
                        >
                            📱 Compartir WhatsApp
                        </button>

                        <button
                            onClick={downloadImage}
                            style={{
                                flex: 1,
                                padding: '12px 20px',
                                backgroundColor: '#333',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 'bold',
                            }}
                        >
                            💾 Descargar
                        </button>
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
