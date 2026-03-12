/**
 * receipt-drawing.ts
 * Pure canvas drawing logic for payment receipts.
 * Extracted to be reusable between auto-generation and manual ReciboGenerator.
 */

export interface ReceiptData {
    numero: string;
    fecha: Date;
    paciente: string;
    concepto: string;
    monto: number;
    moneda: string;
    metodoPago: string;
    atendidoPor?: string;
    cuotaInfo?: string; // e.g. "Cuota 3/12"
    // Optional: show USD equivalent as a small footnote (for ARS/USDT payments)
    usdEquivalente?: number;
}

function getCurrencyCode(moneda: string): string {
    const code = (moneda || 'ARS').toUpperCase();
    if (code === 'USD' || code === 'ARS' || code === 'USDT') return code;
    return 'ARS';
}

function formatAmountWithCode(amount: number, code: string): string {
    const numberPart = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount || 0);
    return `${code} ${numberPart}`;
}

/**
 * Draw a receipt on a given HTMLCanvasElement.
 * Returns the data URL (jpeg) of the rendered image.
 */
export function drawReceiptOnCanvas(canvas: HTMLCanvasElement, data: ReceiptData): string {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

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
    const drawRow = (label: string, value: string, _bold = false) => {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'left';
        ctx.fillText(label, 30, y);

        ctx.font = _bold ? 'bold 18px Arial' : '16px Arial';
        ctx.fillStyle = '#000000';
        ctx.fillText(value, 30, y + 22);
        y += lineHeight;
    };

    drawRow('PACIENTE', data.paciente);
    drawRow('CONCEPTO', data.concepto);
    drawRow('MÉTODO DE PAGO', data.metodoPago);
    if (data.cuotaInfo) {
        drawRow('CUOTA', data.cuotaInfo);
    }

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

    const currencyCode = getCurrencyCode(data.moneda);

    ctx.font = '14px Arial';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'left';
    ctx.fillText(`MONTO TOTAL (${currencyCode})`, 50, y + 10);

    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#000000';
    const montoStr = formatAmountWithCode(data.monto, currencyCode);
    ctx.fillText(montoStr, 50, y + 48);

    // Optional USD equivalent footnote (small, for ARS/USDT payments)
    if (data.usdEquivalente && currencyCode !== 'USD') {
        const usdStr = formatAmountWithCode(data.usdEquivalente, 'USD');
        ctx.font = '13px Arial';
        ctx.fillStyle = '#888888';
        ctx.textAlign = 'left';
        ctx.fillText(`≈ ${usdStr} (equivalente según dólar BNA venta)`, 50, y + 68);
    }

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
    ctx.fillText('Buenos Aires, Argentina | WhatsApp disponible', canvas.width / 2, canvas.height - 30);

    // Convert to image
    return canvas.toDataURL('image/jpeg', 0.9);
}
