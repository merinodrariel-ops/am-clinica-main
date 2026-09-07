import jsPDF from 'jspdf';
import {
    AM_AUTHORITY,
    AM_CLINIC,
    AM_COLORS,
    AM_LINKS,
    AM_TESTIMONIALS,
    findReferenceCases,
    whatsappUrl,
    type ReferenceCase,
} from '@/lib/presupuesto-brand';
import { calculateFinancingBreakdown } from '@/lib/financial-engine';
import type { PresupuestoPayload } from '@/lib/presupuesto-types';

// Formato vertical 100 x 178 mm: proporción de pantalla de teléfono, porque la
// propuesta se envía y se lee por WhatsApp, no se imprime en A4.
const PAGE_W = 100;
const PAGE_H = 178;
const MARGIN = 9;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_BASE = 12;
const CONTENT_TOP = 20;
const FOOTER_RULE = PAGE_H - 13;

const PT_TO_MM = 0.3528;

type Rgb = [number, number, number];

const nfInt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function money(currency: string, value: number): string {
    return `${currency} ${nfInt.format(Math.round(value))}`;
}

async function loadImageData(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

class ProposalDoc {
    readonly doc: jsPDF;
    private cursor = CONTENT_TOP;
    private pageIndex = 0;
    private totalPages = 1;

    constructor() {
        this.doc = new jsPDF({ unit: 'mm', format: [PAGE_W, PAGE_H], compress: true });
    }

    setTotalPages(total: number) {
        this.totalPages = total;
    }

    get y() {
        return this.cursor;
    }

    set y(value: number) {
        this.cursor = value;
    }

    private paintBackground() {
        this.doc.setFillColor(...AM_COLORS.ink);
        this.doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    }

    /** Página con marco completo: sólo la portada la usa. */
    coverPage() {
        this.pageIndex += 1;
        if (this.pageIndex > 1) this.doc.addPage([PAGE_W, PAGE_H]);
        this.paintBackground();
        this.doc.setDrawColor(...AM_COLORS.goldDeep);
        this.doc.setLineWidth(0.2);
        this.doc.rect(5, 5, PAGE_W - 10, PAGE_H - 10);
        this.cursor = CONTENT_TOP;
    }

    page() {
        this.pageIndex += 1;
        if (this.pageIndex > 1) this.doc.addPage([PAGE_W, PAGE_H]);
        this.paintBackground();

        this.label(AM_CLINIC.name, MARGIN, HEADER_BASE, 5, AM_COLORS.goldDeep, 0.6);
        this.label(
            `${String(this.pageIndex).padStart(2, '0')} / ${String(this.totalPages).padStart(2, '0')}`,
            PAGE_W - MARGIN,
            HEADER_BASE,
            5,
            AM_COLORS.muted,
            0.4,
            'right',
        );
        this.hairline(HEADER_BASE + 2.6, AM_COLORS.goldDeep, 0.12);

        this.hairline(FOOTER_RULE, AM_COLORS.goldDeep, 0.12);
        this.label(AM_CLINIC.tagline, MARGIN, FOOTER_RULE + 4, 4.6, AM_COLORS.muted, 0.4);
        this.label('amesteticadental.com', PAGE_W - MARGIN, FOOTER_RULE + 4, 4.6, AM_COLORS.goldDeep, 0.3, 'right');

        this.cursor = CONTENT_TOP;
    }

    hairline(y: number, color: Rgb = AM_COLORS.goldDeep, width = 0.15, from = MARGIN, to = PAGE_W - MARGIN) {
        this.doc.setDrawColor(...color);
        this.doc.setLineWidth(width);
        this.doc.line(from, y, to, y);
    }

    /** Texto corto de una sola línea, sin mover el cursor. Para etiquetas y cifras. */
    label(
        text: string,
        x: number,
        baseline: number,
        size: number,
        color: Rgb,
        tracking = 0,
        align: 'left' | 'center' | 'right' = 'left',
        bold = true,
    ) {
        this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
        this.doc.setFontSize(size);
        this.doc.setTextColor(...color);
        this.doc.text(text, x, baseline, { charSpace: tracking, align });
    }

    /** Etiqueta de sección en versalitas espaciadas, como los kickers del sitio. */
    kicker(text: string, color: Rgb = AM_COLORS.gold) {
        this.label(text.toUpperCase(), MARGIN, this.cursor + 2, 5.6, color, 0.85);
        this.cursor += 5.5;
    }

    block(
        text: string,
        options: {
            size?: number;
            color?: Rgb;
            bold?: boolean;
            italic?: boolean;
            lineFactor?: number;
            tracking?: number;
            gap?: number;
            width?: number;
            x?: number;
            align?: 'left' | 'center';
        } = {},
    ) {
        const size = options.size ?? 8;
        const color = options.color ?? AM_COLORS.cream;
        const lineFactor = options.lineFactor ?? 1.42;
        const width = options.width ?? CONTENT_W;
        const x = options.x ?? MARGIN;
        const style = options.italic ? (options.bold ? 'bolditalic' : 'italic') : options.bold ? 'bold' : 'normal';

        this.doc.setFont('helvetica', style);
        this.doc.setFontSize(size);
        this.doc.setTextColor(...color);

        const lines = this.doc.splitTextToSize(text, width) as string[];
        const lineHeight = size * PT_TO_MM * lineFactor;
        const firstBaseline = this.cursor + size * PT_TO_MM * 0.82;
        const drawX = options.align === 'center' ? x + width / 2 : x;

        lines.forEach((line, index) => {
            this.doc.text(line, drawX, firstBaseline + lineHeight * index, {
                charSpace: options.tracking ?? 0,
                align: options.align === 'center' ? 'center' : 'left',
            });
        });

        this.cursor += lines.length * lineHeight + (options.gap ?? 3);
        return lines.length * lineHeight;
    }

    /** Flecha vectorial: las fuentes estándar del PDF no incluyen el glifo "→". */
    private arrow(x: number, baseline: number, color: Rgb, length = 2.6) {
        const y = baseline - 0.9;
        this.doc.setDrawColor(...color);
        this.doc.setLineWidth(0.22);
        this.doc.line(x, y, x + length, y);
        this.doc.line(x + length - 0.9, y - 0.9, x + length, y);
        this.doc.line(x + length - 0.9, y + 0.9, x + length, y);
    }

    /** Enlace destacado con flecha, tipografía dorada y área clickeable real. */
    linkRow(text: string, url: string, gap = 4) {
        const size = 6.6;
        const baseline = this.cursor + size * PT_TO_MM * 0.85;
        const upper = text.toUpperCase();
        this.label(upper, MARGIN, baseline, size, AM_COLORS.gold, 0.5);
        const textWidth = this.doc.getTextWidth(upper) + upper.length * 0.5;
        this.arrow(MARGIN + textWidth + 2.5, baseline, AM_COLORS.gold);
        const width = textWidth + 7;
        this.doc.setDrawColor(...AM_COLORS.goldDeep);
        this.doc.setLineWidth(0.12);
        this.doc.line(MARGIN, baseline + 1.6, MARGIN + textWidth, baseline + 1.6);
        this.doc.link(MARGIN, baseline - 3, width, 5, { url });
        this.cursor = baseline + gap;
    }

    ctaButton(text: string, url: string) {
        const height = 11;
        const y = this.cursor;
        const baseline = y + height / 2 + 1.5;
        const upper = text.toUpperCase();
        this.doc.setFillColor(...AM_COLORS.gold);
        this.doc.roundedRect(MARGIN, y, CONTENT_W, height, 1.2, 1.2, 'F');
        this.label(upper, PAGE_W / 2 - 3, baseline, 7.2, AM_COLORS.ink, 0.6, 'center');
        this.arrow(MARGIN + CONTENT_W - 9, baseline, AM_COLORS.ink, 3.4);
        this.doc.link(MARGIN, y, CONTENT_W, height, { url });
        this.cursor = y + height + 4;
    }

    framedImage(dataUrl: string, maxHeight: number, caption?: string) {
        try {
            const properties = this.doc.getImageProperties(dataUrl);
            const ratio = properties.width / properties.height;
            const width = Math.min(CONTENT_W, maxHeight * ratio);
            const height = width / ratio;
            const x = MARGIN + (CONTENT_W - width) / 2;
            this.doc.addImage(dataUrl, 'JPEG', x, this.cursor, width, height, undefined, 'FAST');
            this.doc.setDrawColor(...AM_COLORS.goldDeep);
            this.doc.setLineWidth(0.2);
            this.doc.rect(x, this.cursor, width, height);
            this.cursor += height + 2.5;
            if (caption) {
                this.label(caption.toUpperCase(), PAGE_W / 2, this.cursor + 1.5, 4.8, AM_COLORS.muted, 0.6, 'center');
                this.cursor += 5;
            }
            return true;
        } catch {
            return false;
        }
    }

}

function upfrontPctOf(payload: PresupuestoPayload): 30 | 50 {
    return payload.financingUpfrontPct === 30 ? 30 : 50;
}

export function financingBaseAlternative(payload: PresupuestoPayload) {
    const index = payload.financingBaseIndex ?? 0;
    return payload.alternatives[index] ?? payload.alternatives[0];
}

export function buildFinancingRows(payload: PresupuestoPayload) {
    if (payload.financingEnabled === false) return null;
    const base = financingBaseAlternative(payload);
    if (!base || base.total <= 0) return null;
    const upfrontPct = upfrontPctOf(payload);
    const plans = [3, 6, 12].map((installments) => ({
        installments,
        breakdown: calculateFinancingBreakdown({ totalUsd: base.total, upfrontPct, installments }),
    }));
    return {
        currency: base.currency,
        title: base.title,
        upfrontPct,
        upfrontAmount: plans[0].breakdown.upfrontUsd,
        financedAmount: plans[0].breakdown.financedPrincipalUsd,
        plans,
    };
}

export function presupuestoFileName(patientName: string): string {
    const slug = patientName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `propuesta-am-${slug || 'paciente'}.pdf`;
}

export async function generatePresupuestoPdf(payload: PresupuestoPayload): Promise<void> {
    const doc = await buildPresupuestoPdf(payload);
    doc.save(presupuestoFileName(payload.patientName));
}

export async function buildPresupuestoPdf(payload: PresupuestoPayload): Promise<jsPDF> {
    const cases = findReferenceCases(payload.caseSlugs);
    const photos = payload.photoUrls.slice(0, 4);

    const [logoData, patientPhotos, caseImages] = await Promise.all([
        loadImageData('/am-logo.png'),
        Promise.all(photos.map((url) => loadImageData(url))),
        Promise.all(cases.map((item) => loadImageData(item.image))),
    ]);

    const usablePhotos = patientPhotos.filter((value): value is string => Boolean(value));
    const financing = buildFinancingRows(payload);

    const pdf = new ProposalDoc();
    const photoPages = usablePhotos.length > 0 ? Math.ceil(usablePhotos.length / 2) : 0;
    pdf.setTotalPages(1 + photoPages + 1 + (financing ? 1 : 0) + cases.length + 1);

    renderCover(pdf, payload, logoData);
    if (usablePhotos.length > 0) renderPatientPhotos(pdf, usablePhotos);
    renderProposal(pdf, payload);
    if (financing) renderFinancing(pdf, payload, financing);
    cases.forEach((item, index) => renderCase(pdf, item, caseImages[index]));
    renderClose(pdf, payload);

    return pdf.doc;
}

function renderCover(pdf: ProposalDoc, payload: PresupuestoPayload, logoData: string | null) {
    pdf.coverPage();

    if (logoData) {
        try {
            pdf.doc.addImage(logoData, 'PNG', PAGE_W / 2 - 9, 18, 18, 18);
        } catch {
            /* el logo es opcional */
        }
    }

    pdf.y = 46;
    pdf.label(AM_CLINIC.name, PAGE_W / 2, pdf.y, 7, AM_COLORS.cream, 1.4, 'center');
    pdf.y += 4.5;
    pdf.label(AM_CLINIC.tagline, PAGE_W / 2, pdf.y, 4.8, AM_COLORS.muted, 0.9, 'center');

    pdf.y = 68;
    pdf.hairline(pdf.y, AM_COLORS.goldDeep, 0.15, PAGE_W / 2 - 8, PAGE_W / 2 + 8);

    pdf.y = 78;
    pdf.label('PROPUESTA PERSONALIZADA', PAGE_W / 2, pdf.y, 5.4, AM_COLORS.gold, 0.9, 'center');
    pdf.y += 8;
    pdf.block(payload.patientName, {
        size: 20,
        color: AM_COLORS.cream,
        lineFactor: 1.15,
        align: 'center',
        gap: 4,
    });
    pdf.block('Diseño de Sonrisa Digital y plan de tratamiento preparado exclusivamente para vos.', {
        size: 7.6,
        color: AM_COLORS.muted,
        align: 'center',
        width: CONTENT_W - 8,
        x: MARGIN + 4,
        gap: 6,
    });

    const validUntil = new Date(Date.now() + 7 * 86400000).toLocaleDateString('es-AR');
    pdf.label(`VÁLIDA HASTA ${validUntil}`, PAGE_W / 2, 128, 5.2, AM_COLORS.gold, 0.7, 'center');

    // Franja de autoridad: los tres datos que más pesan en la decisión.
    const stripY = 140;
    pdf.hairline(stripY, AM_COLORS.goldDeep, 0.12, MARGIN + 4, PAGE_W - MARGIN - 4);
    const columnWidth = (PAGE_W - MARGIN * 2 - 8) / AM_AUTHORITY.length;
    AM_AUTHORITY.forEach((item, index) => {
        const centerX = MARGIN + 4 + columnWidth * index + columnWidth / 2;
        pdf.label(item.value, centerX, stripY + 8, 10, AM_COLORS.cream, 0, 'center');
        item.label.split('\n').forEach((line, lineIndex) => {
            pdf.label(line.toUpperCase(), centerX, stripY + 12.5 + lineIndex * 3.2, 4.2, AM_COLORS.muted, 0.3, 'center', false);
        });
    });
    pdf.hairline(stripY + 22, AM_COLORS.goldDeep, 0.12, MARGIN + 4, PAGE_W - MARGIN - 4);

    pdf.label(AM_CLINIC.doctor, PAGE_W / 2, PAGE_H - 14, 4.8, AM_COLORS.muted, 0.4, 'center', false);
}

function renderPatientPhotos(pdf: ProposalDoc, photos: string[]) {
    for (let index = 0; index < photos.length; index += 2) {
        pdf.page();
        pdf.kicker('Tu caso');
        pdf.block(index === 0 ? 'Tu resultado, antes de empezar.' : 'Tu diseño en detalle.', {
            size: 13,
            lineFactor: 1.2,
            gap: 2.5,
        });
        pdf.block(
            index === 0
                ? 'Diseñamos tu sonrisa en 3D sobre tus propias fotos. Ves el resultado, lo aprobás, y recién después lo ejecutamos.'
                : 'Cada detalle del diseño se define antes de tocar un solo diente.',
            { size: 7.4, color: AM_COLORS.muted, gap: 5 },
        );

        const pair = photos.slice(index, index + 2);
        const maxHeight = pair.length > 1 ? 48 : 96;
        pair.forEach((dataUrl) => {
            pdf.framedImage(dataUrl, maxHeight, 'DISEÑO AM · @DRARIELMERINO');
        });
    }
}

function renderProposal(pdf: ProposalDoc, payload: PresupuestoPayload) {
    pdf.page();
    pdf.kicker('Tu propuesta');
    pdf.block('Tu plan de tratamiento.', { size: 15, lineFactor: 1.15, gap: 3 });
    if (payload.intro.trim()) {
        pdf.block(payload.intro, { size: 7.6, color: AM_COLORS.muted, gap: 6 });
    }

    payload.alternatives.forEach((item, index) => {
        const boxTop = pdf.y;
        pdf.y = boxTop + 4;

        pdf.label(`OPCIÓN ${String(index + 1).padStart(2, '0')}`, MARGIN + 4, pdf.y + 1.5, 4.8, AM_COLORS.goldDeep, 0.7);
        pdf.y += 5;
        pdf.block(item.title || 'Alternativa de tratamiento', {
            size: 10.5,
            color: AM_COLORS.cream,
            bold: true,
            lineFactor: 1.2,
            x: MARGIN + 4,
            width: CONTENT_W - 8,
            gap: 1.5,
        });
        if (item.description.trim()) {
            pdf.block(item.description, {
                size: 7,
                color: AM_COLORS.muted,
                x: MARGIN + 4,
                width: CONTENT_W - 8,
                gap: 2.5,
            });
        }
        pdf.hairline(pdf.y, AM_COLORS.goldDeep, 0.1, MARGIN + 4, PAGE_W - MARGIN - 4);
        pdf.y += 3;
        pdf.label('INVERSIÓN TOTAL', MARGIN + 4, pdf.y + 2, 4.6, AM_COLORS.muted, 0.6);
        pdf.label(money(item.currency, item.total), PAGE_W - MARGIN - 4, pdf.y + 3, 12, AM_COLORS.gold, 0, 'right');
        pdf.y += 7;

        pdf.doc.setDrawColor(...AM_COLORS.goldDeep);
        pdf.doc.setLineWidth(0.15);
        pdf.doc.rect(MARGIN, boxTop, CONTENT_W, pdf.y - boxTop);
        pdf.y += 4;
    });

    if (pdf.y < FOOTER_RULE - 22) {
        pdf.y = FOOTER_RULE - 22;
        pdf.block(
            'Cada caso es personalizado: no trabajamos con sonrisas en serie. El plan se ejecuta con escáner intraoral, diseño 3D y cerámica CAD/CAM.',
            { size: 6.6, color: AM_COLORS.muted, gap: 2.5 },
        );
        pdf.linkRow('Ver tratamientos y tecnología', `${AM_LINKS.site}/clinica`);
    }
}

function renderFinancing(
    pdf: ProposalDoc,
    payload: PresupuestoPayload,
    financing: NonNullable<ReturnType<typeof buildFinancingRows>>,
) {
    pdf.page();
    pdf.kicker('Financiación');
    pdf.block('Tu tratamiento, en cuotas fijas.', { size: 15, lineFactor: 1.15, gap: 3 });
    pdf.block(
        `Sobre ${financing.title || 'tu plan'}, con ${financing.upfrontPct}% de anticipo. Cuotas iguales y fijas en ${financing.currency}; podés abonar en pesos al tipo de cambio oficial del Banco Nación del día.`,
        { size: 7.2, color: AM_COLORS.muted, gap: 5 },
    );

    // Bloque anticipo / saldo, igual que el simulador público.
    const headTop = pdf.y;
    pdf.doc.setFillColor(...AM_COLORS.inkSoft);
    pdf.doc.rect(MARGIN, headTop, CONTENT_W, 18, 'F');
    const half = CONTENT_W / 2;
    pdf.label('PAGÁS HOY', MARGIN + 4, headTop + 5.5, 4.6, AM_COLORS.muted, 0.6);
    pdf.label(money(financing.currency, financing.upfrontAmount), MARGIN + 4, headTop + 13, 11, AM_COLORS.cream);
    pdf.label('SALDO FINANCIADO', MARGIN + half + 3, headTop + 5.5, 4.6, AM_COLORS.muted, 0.6);
    pdf.label(money(financing.currency, financing.financedAmount), MARGIN + half + 3, headTop + 13, 11, AM_COLORS.gold);
    pdf.doc.setDrawColor(...AM_COLORS.goldDeep);
    pdf.doc.setLineWidth(0.12);
    pdf.doc.line(MARGIN + half, headTop + 3, MARGIN + half, headTop + 15);
    pdf.y = headTop + 24;

    financing.plans.forEach((plan) => {
        const rowTop = pdf.y;
        pdf.label(`${plan.installments} CUOTAS`, MARGIN, rowTop + 4, 6.4, AM_COLORS.cream, 0.5);
        pdf.label('PAGOS IGUALES Y FIJOS', MARGIN, rowTop + 8, 4.4, AM_COLORS.muted, 0.5, 'left', false);
        pdf.label(
            money(financing.currency, plan.breakdown.installmentUsd),
            PAGE_W - MARGIN,
            rowTop + 6.5,
            12.5,
            AM_COLORS.gold,
            0,
            'right',
        );
        pdf.label('/ MES', PAGE_W - MARGIN, rowTop + 10.5, 4.4, AM_COLORS.muted, 0.5, 'right', false);
        pdf.y = rowTop + 13.5;
        pdf.hairline(pdf.y, AM_COLORS.goldDeep, 0.1);
        pdf.y += 3.5;
    });

    if (payload.financing.trim()) {
        pdf.block(payload.financing, { size: 6.8, color: AM_COLORS.muted, gap: 3 });
    }
    pdf.block(
        'Financiación sujeta a evaluación y preaprobación de cada caso.',
        { size: 6, color: AM_COLORS.muted, gap: 4 },
    );
    pdf.linkRow('Simular otras combinaciones', AM_LINKS.financing);
}

function renderCase(pdf: ProposalDoc, item: ReferenceCase, imageData: string | null) {
    pdf.page();
    pdf.kicker('Antes y después reales');
    pdf.block(item.headline, { size: 12, lineFactor: 1.22, gap: 2.5 });
    pdf.block(item.detail, { size: 6.8, color: AM_COLORS.muted, gap: 4.5 });

    if (imageData) {
        pdf.framedImage(imageData, 78, `${item.kicker} · ${item.stat}`);
    } else {
        pdf.label(`${item.kicker} · ${item.stat}`, MARGIN, pdf.y + 3, 5, AM_COLORS.gold, 0.7);
        pdf.y += 8;
    }

    pdf.y = Math.max(pdf.y, FOOTER_RULE - 22);
    pdf.block('Caso real documentado con protocolo fotográfico clínico y firmado @drarielmerino.', {
        size: 6.4,
        color: AM_COLORS.muted,
        gap: 3,
    });
    pdf.linkRow('Ver el caso completo', item.url);
}

function renderClose(pdf: ProposalDoc, payload: PresupuestoPayload) {
    pdf.page();
    pdf.kicker('El siguiente paso');
    pdf.block('Reservá tu lugar en la agenda.', { size: 15, lineFactor: 1.15, gap: 3 });
    if (payload.cta.trim()) {
        pdf.block(payload.cta, { size: 7.4, color: AM_COLORS.muted, gap: 5 });
    }

    pdf.ctaButton(
        'Confirmar por WhatsApp',
        whatsappUrl(`Hola! Soy ${payload.patientName}. Recibí mi propuesta de AM y quiero avanzar con el tratamiento.`),
    );

    const testimonial = AM_TESTIMONIALS[0];
    pdf.hairline(pdf.y, AM_COLORS.goldDeep, 0.12);
    pdf.y += 4;
    pdf.block(`“${testimonial.quote}”`, { size: 7.6, color: AM_COLORS.cream, italic: true, lineFactor: 1.4, gap: 2 });
    pdf.label(`${testimonial.author.toUpperCase()} · ${testimonial.context.toUpperCase()}`, MARGIN, pdf.y + 2, 4.4, AM_COLORS.muted, 0.5);
    pdf.y += 7;
    pdf.linkRow('Ver +120 reseñas en Google', AM_LINKS.reviews, 3);
    pdf.linkRow('Ver todos los casos', AM_LINKS.cases, 5);

    if (payload.guarantee.trim() || payload.conditions.trim()) {
        pdf.hairline(pdf.y, AM_COLORS.goldDeep, 0.1);
        pdf.y += 3;
        pdf.label('GARANTÍA Y CONDICIONES', MARGIN, pdf.y + 2, 4.6, AM_COLORS.goldDeep, 0.7);
        pdf.y += 5;
        pdf.block([payload.guarantee, payload.conditions].filter((text) => text.trim()).join(' '), {
            size: 5.8,
            color: AM_COLORS.muted,
            lineFactor: 1.35,
            gap: 3,
        });
    }

    pdf.y = FOOTER_RULE - 11;
    pdf.label(AM_CLINIC.address, MARGIN, pdf.y, 5.2, AM_COLORS.cream, 0.2, 'left', false);
    pdf.label(AM_CLINIC.phone, MARGIN, pdf.y + 4, 5.2, AM_COLORS.gold, 0.2);
    pdf.doc.link(MARGIN, pdf.y - 4, CONTENT_W, 6, { url: AM_LINKS.maps });
}
