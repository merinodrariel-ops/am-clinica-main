import jsPDF from 'jspdf';
import { formatArs, formatUsd, type FinancingBreakdown } from '@/lib/financial-engine';

interface FinancingProposalPdfInput {
    patientName: string;
    patientDocument?: string | null;
    patientCuit?: string | null;
    treatment: string;
    quote: FinancingBreakdown;
    generatedAt?: Date;
}

function sanitizeFileNamePart(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

export function getFinancingProposalPdfFileName(input: FinancingProposalPdfInput): string {
    const patient = sanitizeFileNamePart(input.patientName || 'paciente');
    const date = (input.generatedAt || new Date()).toISOString().split('T')[0];
    return `propuesta-financiacion-${patient || 'paciente'}-${date}.pdf`;
}

export function generateFinancingProposalPDF(input: FinancingProposalPdfInput): Blob {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const margin = 16;
    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    function checkPage(needed = 8) {
        if (y + needed > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    }

    function writeLine(text: string, size = 11, bold = false, color: [number, number, number] = [20, 23, 28]) {
        checkPage(size * 0.5 + 4);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach((line: string) => {
            checkPage(size * 0.5 + 4);
            doc.text(line, margin, y);
            y += size * 0.45 + 1.5;
        });
    }

    function writePair(label: string, value: string, strong = false) {
        writeLine(`${label}: ${value}`, 11, strong);
    }

    function separator(space = 4) {
        y += space;
        checkPage(4);
        doc.setDrawColor(210, 214, 220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5;
    }

    const generatedAt = input.generatedAt || new Date();
    const generatedAtLabel = generatedAt.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    writeLine('AM Clinica Dental', 10, true, [8, 145, 178]);
    writeLine('Propuesta de financiacion', 18, true);
    writeLine(`Emitida el ${generatedAtLabel}`, 10, false, [100, 116, 139]);
    separator();

    writeLine('Datos del paciente', 13, true);
    writePair('Paciente', input.patientName || '-');
    writePair('Documento', input.patientDocument || '-');
    writePair('CUIT/CUIL', input.patientCuit || '-');
    writePair('Tratamiento', input.treatment || '-');
    separator();

    writeLine('Resumen comercial', 13, true);
    writePair('Monto total del tratamiento', formatUsd(input.quote.totalUsd), true);
    writePair(`Anticipo hoy (${input.quote.upfrontPct}%)`, formatUsd(input.quote.upfrontUsd));
    writePair('Saldo financiado', formatUsd(input.quote.financedPrincipalUsd));
    writePair('TNA aplicada', '18% anual');
    writePair('Tasa mensual', `${input.quote.monthlyInterestPct.toFixed(2)}%`);
    writePair(`Plan seleccionado (${input.quote.installments} cuotas)`, formatUsd(input.quote.installmentUsd), true);
    writePair('Total financiado', formatUsd(input.quote.financedTotalUsd));

    if (input.quote.bnaVentaArs > 0) {
        separator(2);
        writeLine('Referencias en pesos al tipo de cambio BNA Venta vigente', 11, true, [8, 145, 178]);
        writePair('Monto total', formatArs(input.quote.totalArs));
        writePair('Anticipo hoy', formatArs(input.quote.upfrontArs));
        writePair('Cuota estimada', formatArs(input.quote.installmentArs));
    }

    separator();
    writeLine('Condiciones', 13, true);
    writeLine('La cuota se calcula sobre el saldo financiado mediante sistema frances.', 10);
    writeLine('Financiacion sujeta a evaluacion y preaprobacion de cada caso.', 10);
    writeLine('Esta propuesta es informativa y no reemplaza el contrato definitivo.', 10);

    return doc.output('blob');
}
