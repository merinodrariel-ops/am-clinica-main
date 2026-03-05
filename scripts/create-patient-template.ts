/**
 * Script: Create Premium Patient Template in Google Slides
 * 
 * Creates an 8-slide patient presentation template following the 
 * AM Estética Dental premium design system (dark, minimalist, luxury).
 * 
 * Run with: npx tsx scripts/create-patient-template.ts
 */

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ─── Design Tokens ────────────────────────────────────────
const COLORS = {
    black: { red: 0.020, green: 0.020, blue: 0.020 },  // #050505
    darkCard: { red: 0.067, green: 0.067, blue: 0.067 },  // #111111
    white: { red: 1.000, green: 1.000, blue: 1.000 },
    zinc300: { red: 0.831, green: 0.831, blue: 0.847 },
    zinc400: { red: 0.631, green: 0.631, blue: 0.667 },
    zinc500: { red: 0.443, green: 0.443, blue: 0.478 },
    zinc600: { red: 0.322, green: 0.322, blue: 0.353 },
    gold: { red: 0.831, green: 0.686, blue: 0.216 },  // #D4AF37
    amber: { red: 0.918, green: 0.682, blue: 0.063 },  // #EAAE10
    sage: { red: 0.529, green: 0.663, blue: 0.522 },  // #87A985
    teal: { red: 0.176, green: 0.714, blue: 0.596 },  // #2DB698
    red: { red: 0.937, green: 0.267, blue: 0.267 },  // #EF4444
};

const FONTS = {
    serif: 'Noto Serif',
    sans: 'Inter',
};

// ─── Helpers ──────────────────────────────────────────────
const EMU = 914400; // 1 inch = 914400 EMU
const PT = 12700;   // 1 point = 12700 EMU
const SLIDE_W = 10 * EMU;  // 10 inches (widescreen 16:9)
const SLIDE_H = 5.625 * EMU; // 5.625 inches

function inches(n: number) { return Math.round(n * EMU); }
function pt(n: number) { return Math.round(n * PT); }

function makeTextBox(
    pageId: string,
    objectId: string,
    x: number, y: number, w: number, h: number,
    text: string,
    opts: {
        fontFamily?: string;
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        color?: { red: number; green: number; blue: number };
        alignment?: string;
        tracking?: number;
    } = {}
) {
    const requests: object[] = [];

    // Create shape
    requests.push({
        createShape: {
            objectId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
                pageObjectId: pageId,
                size: { width: { magnitude: inches(w), unit: 'EMU' }, height: { magnitude: inches(h), unit: 'EMU' } },
                transform: {
                    scaleX: 1, scaleY: 1,
                    translateX: inches(x), translateY: inches(y),
                    unit: 'EMU',
                },
            },
        },
    });

    // Insert text
    requests.push({
        insertText: { objectId, text, insertionIndex: 0 },
    });

    // Style text
    const style: Record<string, unknown> = {};
    const fields: string[] = [];

    if (opts.fontFamily) { style.fontFamily = opts.fontFamily; fields.push('fontFamily'); }
    if (opts.fontSize) { style.fontSize = { magnitude: opts.fontSize, unit: 'PT' }; fields.push('fontSize'); }
    if (opts.bold !== undefined) { style.bold = opts.bold; fields.push('bold'); }
    if (opts.italic !== undefined) { style.italic = opts.italic; fields.push('italic'); }
    if (opts.color) { style.foregroundColor = { opaqueColor: { rgbColor: opts.color } }; fields.push('foregroundColor'); }

    if (fields.length > 0) {
        requests.push({
            updateTextStyle: {
                objectId,
                style,
                fields: fields.join(','),
                textRange: { type: 'ALL' },
            },
        });
    }

    // Paragraph style
    const pStyle: Record<string, unknown> = {};
    const pFields: string[] = [];

    if (opts.alignment) { pStyle.alignment = opts.alignment; pFields.push('alignment'); }
    if (opts.tracking) {
        pStyle.spaceAbove = { magnitude: 0, unit: 'PT' };
        pFields.push('spaceAbove');
    }

    if (pFields.length > 0) {
        requests.push({
            updateParagraphStyle: {
                objectId,
                style: pStyle,
                fields: pFields.join(','),
                textRange: { type: 'ALL' },
            },
        });
    }

    return requests;
}

function makeRectangle(
    pageId: string,
    objectId: string,
    x: number, y: number, w: number, h: number,
    opts: {
        fill?: { red: number; green: number; blue: number };
        borderColor?: { red: number; green: number; blue: number };
        borderWeight?: number;
        borderDash?: string;
        cornerRadius?: number;
    } = {}
) {
    const requests: object[] = [];

    requests.push({
        createShape: {
            objectId,
            shapeType: 'ROUND_RECTANGLE',
            elementProperties: {
                pageObjectId: pageId,
                size: { width: { magnitude: inches(w), unit: 'EMU' }, height: { magnitude: inches(h), unit: 'EMU' } },
                transform: {
                    scaleX: 1, scaleY: 1,
                    translateX: inches(x), translateY: inches(y),
                    unit: 'EMU',
                },
            },
        },
    });

    // Shape properties
    const shapeProps: Record<string, unknown> = {};
    const spFields: string[] = [];

    if (opts.fill) {
        shapeProps.shapeBackgroundFill = {
            solidFill: { color: { rgbColor: opts.fill }, alpha: 1 },
        };
        spFields.push('shapeBackgroundFill');
    } else {
        shapeProps.shapeBackgroundFill = {
            solidFill: { color: { rgbColor: COLORS.black }, alpha: 0 },
        };
        spFields.push('shapeBackgroundFill');
    }

    if (opts.borderColor) {
        shapeProps.outline = {
            outlineFill: { solidFill: { color: { rgbColor: opts.borderColor } } },
            weight: { magnitude: opts.borderWeight || 1, unit: 'PT' },
            dashStyle: opts.borderDash || 'SOLID',
        };
        spFields.push('outline');
    }

    if (spFields.length > 0) {
        requests.push({
            updateShapeProperties: {
                objectId,
                shapeProperties: shapeProps,
                fields: spFields.join(','),
            },
        });
    }

    return requests;
}

function setSlideBackground(pageId: string, color: { red: number; green: number; blue: number }) {
    return {
        updatePageProperties: {
            objectId: pageId,
            pageProperties: {
                pageBackgroundFill: {
                    solidFill: { color: { rgbColor: color } },
                },
            },
            fields: 'pageBackgroundFill',
        },
    };
}

function makeLine(
    pageId: string,
    objectId: string,
    x: number, y: number, endX: number, endY: number,
    color: { red: number; green: number; blue: number } = COLORS.zinc600,
    weight: number = 0.5
) {
    return [
        {
            createLine: {
                objectId,
                lineCategory: 'STRAIGHT',
                elementProperties: {
                    pageObjectId: pageId,
                    size: {
                        width: { magnitude: inches(endX - x), unit: 'EMU' },
                        height: { magnitude: inches(endY - y), unit: 'EMU' },
                    },
                    transform: {
                        scaleX: 1, scaleY: 1,
                        translateX: inches(x), translateY: inches(y),
                        unit: 'EMU',
                    },
                },
            },
        },
        {
            updateLineProperties: {
                objectId,
                lineProperties: {
                    lineFill: { solidFill: { color: { rgbColor: color } } },
                    weight: { magnitude: weight, unit: 'PT' },
                },
                fields: 'lineFill,weight',
            },
        },
    ];
}

// ─── Slide Builders ───────────────────────────────────────

function buildSlide1_Cover(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Logo: "— AM —"
    r.push(...makeTextBox(pageId, `${pageId}_logo`, 3, 0.8, 4, 0.4, '— AM —', {
        fontFamily: FONTS.serif, fontSize: 16, bold: true, color: COLORS.white, alignment: 'CENTER',
    }));
    // Subtitle: "ESTÉTICA DENTAL"
    r.push(...makeTextBox(pageId, `${pageId}_sub`, 3, 1.15, 4, 0.3, 'ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 8, color: COLORS.zinc400, alignment: 'CENTER',
    }));
    // Decorative dots (gold + sage) — using text for simplicity
    r.push(...makeTextBox(pageId, `${pageId}_dots`, 4.6, 1.45, 0.8, 0.2, '●  ●', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.gold, alignment: 'CENTER',
    }));

    // Patient name - large serif italic
    r.push(...makeTextBox(pageId, `${pageId}_name`, 1.5, 2.4, 7, 0.8, '{{NombreApellido}}', {
        fontFamily: FONTS.serif, fontSize: 44, italic: true, color: COLORS.white, alignment: 'CENTER',
    }));

    // DNI
    r.push(...makeTextBox(pageId, `${pageId}_dni`, 3.5, 3.3, 3, 0.25, 'DNI: {{DNI}}', {
        fontFamily: FONTS.sans, fontSize: 9, color: COLORS.zinc500, alignment: 'CENTER',
    }));
    // Fecha de alta
    r.push(...makeTextBox(pageId, `${pageId}_fecha`, 3.5, 3.55, 3, 0.25, 'FECHA DE ALTA: {{Fecha}}', {
        fontFamily: FONTS.sans, fontSize: 8, color: COLORS.zinc600, alignment: 'CENTER',
    }));

    // Tagline
    r.push(...makeTextBox(pageId, `${pageId}_tagline`, 1.5, 4.8, 7, 0.3, 'EXCELENCIA Y MINIMALISMO EN ODONTOLOGÍA ESTÉTICA', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.zinc600, alignment: 'CENTER',
    }));

    return r;
}

function buildSlide2_PersonalData(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section label
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.4, 2, 0.2, 'PASO 01', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.sage, alignment: 'START',
    }));
    // Title
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.6, 4, 0.5, 'Datos Personales', {
        fontFamily: FONTS.serif, fontSize: 28, italic: true, color: COLORS.white, alignment: 'START',
    }));
    // Subtitle
    r.push(...makeTextBox(pageId, `${pageId}_desc`, 0.6, 1.05, 5, 0.25, 'Información de contacto y ubicación', {
        fontFamily: FONTS.sans, fontSize: 9, color: COLORS.zinc500, alignment: 'START',
    }));

    // ── LEFT CARD: Identificación ──
    r.push(...makeRectangle(pageId, `${pageId}_card1`, 0.6, 1.5, 4.2, 2.8, {
        borderColor: COLORS.zinc600, borderWeight: 0.5,
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c1title`, 0.9, 1.65, 3, 0.25, '● IDENTIFICACIÓN', {
        fontFamily: FONTS.sans, fontSize: 8, bold: true, color: COLORS.sage, alignment: 'START',
    }));
    // Name
    r.push(...makeTextBox(pageId, `${pageId}_c1_lbl1`, 0.9, 2.1, 1, 0.15, 'NOMBRE', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c1_val1`, 0.9, 2.25, 3.5, 0.3, '{{NombreApellido}}', {
        fontFamily: FONTS.sans, fontSize: 13, bold: true, color: COLORS.white, alignment: 'START',
    }));
    // DNI
    r.push(...makeTextBox(pageId, `${pageId}_c1_lbl2`, 0.9, 2.7, 1, 0.15, 'DNI', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c1_val2`, 0.9, 2.85, 3.5, 0.3, '{{DNI}}', {
        fontFamily: FONTS.sans, fontSize: 13, bold: true, color: COLORS.white, alignment: 'START',
    }));
    // DOB + Age row
    r.push(...makeTextBox(pageId, `${pageId}_c1_lbl3`, 0.9, 3.3, 2, 0.15, 'FECHA DE NACIMIENTO', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c1_val3`, 0.9, 3.45, 2, 0.3, '{{FechaNacimiento}}', {
        fontFamily: FONTS.sans, fontSize: 12, bold: true, color: COLORS.white, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c1_lbl4`, 3.2, 3.3, 1, 0.15, 'EDAD', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c1_val4`, 3.2, 3.45, 1.5, 0.3, '{{Edad}}', {
        fontFamily: FONTS.sans, fontSize: 12, bold: true, color: COLORS.white, alignment: 'START',
    }));

    // ── RIGHT CARD: Contacto ──
    r.push(...makeRectangle(pageId, `${pageId}_card2`, 5.2, 1.5, 4.2, 2.8, {
        borderColor: COLORS.zinc600, borderWeight: 0.5,
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c2title`, 5.5, 1.65, 3, 0.25, '● CONTACTO', {
        fontFamily: FONTS.sans, fontSize: 8, bold: true, color: COLORS.sage, alignment: 'START',
    }));
    // WhatsApp
    r.push(...makeTextBox(pageId, `${pageId}_c2_lbl1`, 5.5, 2.1, 1.5, 0.15, '📱 WHATSAPP', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c2_val1`, 5.5, 2.25, 3.5, 0.3, '{{Telefono}}', {
        fontFamily: FONTS.sans, fontSize: 12, color: COLORS.white, alignment: 'START',
    }));
    // Email
    r.push(...makeTextBox(pageId, `${pageId}_c2_lbl2`, 5.5, 2.65, 1.5, 0.15, '✉️ EMAIL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c2_val2`, 5.5, 2.8, 3.5, 0.3, '{{Email}}', {
        fontFamily: FONTS.sans, fontSize: 12, color: COLORS.white, alignment: 'START',
    }));
    // Ciudad
    r.push(...makeTextBox(pageId, `${pageId}_c2_lbl3`, 5.5, 3.2, 1.5, 0.15, '📍 CIUDAD', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c2_val3`, 5.5, 3.35, 3.5, 0.3, '{{Ciudad}}', {
        fontFamily: FONTS.sans, fontSize: 12, color: COLORS.white, alignment: 'START',
    }));
    // Barrio
    r.push(...makeTextBox(pageId, `${pageId}_c2_lbl4`, 5.5, 3.7, 1.5, 0.15, '🏠 BARRIO', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_c2_val4`, 5.5, 3.85, 3.5, 0.3, '{{Barrio}}', {
        fontFamily: FONTS.sans, fontSize: 12, color: COLORS.white, alignment: 'START',
    }));

    // Footer
    r.push(...makeTextBox(pageId, `${pageId}_foot`, 7, 4.9, 3, 0.2, '◆ AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

function buildSlide3_MedicalHistory(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section label
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.4, 2, 0.2, 'PASO 02', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.amber, alignment: 'START',
    }));
    // Title
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.6, 5, 0.5, 'Historial Médico', {
        fontFamily: FONTS.serif, fontSize: 28, italic: true, color: COLORS.white, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_desc`, 0.6, 1.05, 5, 0.25, 'Alertas clínicas y antecedentes', {
        fontFamily: FONTS.sans, fontSize: 9, color: COLORS.zinc500, alignment: 'START',
    }));

    // ── ALERT CARD ──
    r.push(...makeRectangle(pageId, `${pageId}_alertcard`, 0.6, 1.5, 8.8, 1.2, {
        borderColor: COLORS.amber, borderWeight: 1.5,
    }));
    r.push(...makeTextBox(pageId, `${pageId}_alerttitle`, 0.9, 1.6, 3, 0.25, '⚠ ALERTAS CLÍNICAS', {
        fontFamily: FONTS.sans, fontSize: 9, bold: true, color: COLORS.amber, alignment: 'START',
    }));

    // Treatment column
    r.push(...makeTextBox(pageId, `${pageId}_al1`, 0.9, 1.95, 2.5, 0.15, '🏥 TRATAMIENTO ACTIVO', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc500, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_al1v`, 0.9, 2.1, 2.5, 0.25, '{{TratamientoActivo}}', {
        fontFamily: FONTS.sans, fontSize: 10, color: COLORS.white, alignment: 'START',
    }));
    // Medication column
    r.push(...makeTextBox(pageId, `${pageId}_al2`, 3.8, 1.95, 2.5, 0.15, '💊 MEDICACIÓN', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc500, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_al2v`, 3.8, 2.1, 2.5, 0.25, '{{Medicacion}}', {
        fontFamily: FONTS.sans, fontSize: 10, color: COLORS.white, alignment: 'START',
    }));
    // Allergies column
    r.push(...makeTextBox(pageId, `${pageId}_al3`, 6.8, 1.95, 2.5, 0.15, '🚨 ALERGIAS', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc500, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_al3v`, 6.8, 2.1, 2.5, 0.25, '{{Alergias}}', {
        fontFamily: FONTS.sans, fontSize: 10, bold: true, color: COLORS.red, alignment: 'START',
    }));

    // ── OBSERVATIONS CARD ──
    r.push(...makeRectangle(pageId, `${pageId}_obscard`, 0.6, 2.95, 8.8, 1.3, {
        borderColor: COLORS.zinc600, borderWeight: 0.5,
    }));
    r.push(...makeTextBox(pageId, `${pageId}_obstitle`, 0.9, 3.1, 4, 0.25, '📋 OBSERVACIONES GENERALES', {
        fontFamily: FONTS.sans, fontSize: 8, bold: true, color: COLORS.zinc400, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_obsval`, 0.9, 3.4, 8.2, 0.7, '{{ObservacionesGenerales}}', {
        fontFamily: FONTS.serif, fontSize: 10, italic: true, color: COLORS.zinc300, alignment: 'START',
    }));

    // Footer
    r.push(...makeTextBox(pageId, `${pageId}_foot`, 7, 4.9, 3, 0.2, '◆ AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

function buildSlide4_ConsultationReason(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section label
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.4, 2, 0.2, 'PASO 03', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.gold, alignment: 'START',
    }));
    // Title
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.6, 5, 0.5, 'Motivo de Consulta', {
        fontFamily: FONTS.serif, fontSize: 28, italic: true, color: COLORS.white, alignment: 'START',
    }));

    // ── PULL QUOTE CARD ──
    r.push(...makeRectangle(pageId, `${pageId}_quotecard`, 0.6, 1.3, 8.8, 1.3, {
        borderColor: COLORS.zinc600, borderWeight: 0.5,
    }));
    r.push(...makeTextBox(pageId, `${pageId}_quoteicon`, 4.6, 1.4, 0.8, 0.3, '✦', {
        fontFamily: FONTS.sans, fontSize: 16, color: COLORS.gold, alignment: 'CENTER',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_quoteval`, 1.2, 1.75, 7.6, 0.6, '"{{MotivoConsulta}}"', {
        fontFamily: FONTS.serif, fontSize: 20, italic: true, color: COLORS.zinc300, alignment: 'CENTER',
    }));

    // ── How they found us ──
    r.push(...makeTextBox(pageId, `${pageId}_refl`, 0.6, 2.85, 2, 0.2, '🔗 Cómo nos conoció:', {
        fontFamily: FONTS.sans, fontSize: 9, bold: true, color: COLORS.zinc400, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_refv`, 2.8, 2.85, 5, 0.2, '{{ComoNosConocio}}', {
        fontFamily: FONTS.sans, fontSize: 9, italic: true, color: COLORS.zinc500, alignment: 'START',
    }));

    // ── Professional Notes ──
    r.push(...makeRectangle(pageId, `${pageId}_notescard`, 0.6, 3.3, 8.8, 1.2, {
        borderColor: COLORS.zinc600, borderWeight: 0.5, borderDash: 'DASH',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_notesttl`, 0.9, 3.4, 4, 0.25, '✏ NOTAS DEL PROFESIONAL', {
        fontFamily: FONTS.sans, fontSize: 8, bold: true, color: COLORS.zinc500, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_notesval`, 0.9, 3.7, 8.2, 0.6, 'Haga clic aquí para añadir observaciones clínicas adicionales sobre las consultas del paciente...', {
        fontFamily: FONTS.sans, fontSize: 9, italic: true, color: COLORS.zinc600, alignment: 'START',
    }));

    // Footer
    r.push(...makeTextBox(pageId, `${pageId}_foot`, 7, 4.9, 3, 0.2, '◆ AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

function buildSlide5_Photography(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section label
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.3, 3, 0.2, 'REGISTRO CLÍNICO', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.teal, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.5, 5, 0.5, 'Análisis Fotográfico', {
        fontFamily: FONTS.serif, fontSize: 28, italic: true, color: COLORS.white, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_desc`, 0.6, 0.95, 5, 0.2, 'Registro fotográfico inicial', {
        fontFamily: FONTS.sans, fontSize: 9, color: COLORS.zinc500, alignment: 'START',
    }));

    // Photo grid — 3 columns × 2 rows
    const photoLabels = ['FRONTAL', 'PERFIL', 'SONRISA', 'INTRAORAL SUPERIOR', 'INTRAORAL INFERIOR', 'RX PANORÁMICA'];
    const colW = 2.7;
    const rowH = 1.5;
    const startX = 0.7;
    const startY = 1.3;
    const gap = 0.2;

    photoLabels.forEach((label, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = startX + col * (colW + gap);
        const y = startY + row * (rowH + gap);
        const boxId = `${pageId}_photo${i}`;
        const lblId = `${pageId}_plbl${i}`;

        r.push(...makeRectangle(pageId, boxId, x, y, colW, rowH, {
            borderColor: COLORS.zinc600, borderWeight: 0.5, borderDash: 'DASH',
        }));
        r.push(...makeTextBox(pageId, `${boxId}_icon`, x + colW / 2 - 0.2, y + rowH / 2 - 0.25, 0.4, 0.3, '📷', {
            fontFamily: FONTS.sans, fontSize: 14, color: COLORS.zinc600, alignment: 'CENTER',
        }));
        r.push(...makeTextBox(pageId, lblId, x, y + rowH - 0.3, colW, 0.2, label, {
            fontFamily: FONTS.sans, fontSize: 7, color: COLORS.zinc600, alignment: 'CENTER',
        }));
    });

    // Date line
    r.push(...makeTextBox(pageId, `${pageId}_datelab`, 0.7, 4.7, 5, 0.2, 'Fecha sesión fotográfica: ______________________', {
        fontFamily: FONTS.sans, fontSize: 8, color: COLORS.zinc500, alignment: 'START',
    }));

    // Footer
    r.push(...makeTextBox(pageId, `${pageId}_foot`, 7, 4.9, 3, 0.2, '◆ AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

function buildSlide6_DiagnosisPlan(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section header
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.35, 3, 0.2, 'PLAN CLÍNICO', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.teal, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.55, 5, 0.5, 'Diagnóstico y Plan', {
        fontFamily: FONTS.serif, fontSize: 28, italic: true, color: COLORS.white, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_desc`, 0.6, 0.95, 5, 0.2, 'Plan de tratamiento personalizado', {
        fontFamily: FONTS.sans, fontSize: 9, color: COLORS.zinc500, alignment: 'START',
    }));

    // Diagnosis field
    r.push(...makeTextBox(pageId, `${pageId}_diaglbl`, 0.6, 1.35, 3, 0.2, 'DIAGNÓSTICO PRINCIPAL', {
        fontFamily: FONTS.sans, fontSize: 8, bold: true, color: COLORS.zinc400, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_diagval`, 0.6, 1.6, 8.8, 0.3, 'Ingrese el diagnóstico principal aquí...', {
        fontFamily: FONTS.serif, fontSize: 12, italic: true, color: COLORS.zinc500, alignment: 'START',
    }));

    // Separator line
    r.push(...makeLine(pageId, `${pageId}_line1`, 0.6, 1.95, 9.4, 1.95, COLORS.zinc600, 0.5));

    // Table header
    const headers = ['#', 'PROCEDIMIENTO', 'FASE', 'ESTADO', 'PRESUPUESTO'];
    const colXs = [0.6, 1.1, 5.0, 6.4, 7.8];
    const colWs = [0.4, 3.8, 1.3, 1.3, 1.6];

    headers.forEach((h, i) => {
        r.push(...makeTextBox(pageId, `${pageId}_th${i}`, colXs[i], 2.15, colWs[i], 0.2, h, {
            fontFamily: FONTS.sans, fontSize: 7, bold: true, color: COLORS.zinc500, alignment: 'START',
        }));
    });

    // Separator under header
    r.push(...makeLine(pageId, `${pageId}_line2`, 0.6, 2.4, 9.4, 2.4, COLORS.zinc600, 0.3));

    // Example rows
    const rows = [
        ['01', 'Limpieza Ultrasónica Profunda', 'FASE 1', 'Pendiente', '$ 12.000'],
        ['02', 'Restauración Estética Resina 3M', 'FASE 1', 'Pendiente', '$ 25.000'],
        ['03', 'Blanqueamiento LED Consultorio', 'FASE 2', 'Pendiente', '$ 45.000'],
        ['04', 'Corona E-Max Cementada', 'FASE 3', 'Pendiente', '$ 89.000'],
    ];

    rows.forEach((row, ri) => {
        const y = 2.55 + ri * 0.35;
        row.forEach((cell, ci) => {
            const color = ci === 2 ? COLORS.teal : (ci === 3 ? COLORS.zinc500 : COLORS.white);
            const fontSize = ci === 0 ? 8 : (ci === 2 ? 7 : 9);
            r.push(...makeTextBox(pageId, `${pageId}_td${ri}${ci}`, colXs[ci], y, colWs[ci], 0.25, cell, {
                fontFamily: FONTS.sans, fontSize, color, alignment: 'START',
            }));
        });
        // Row separator
        r.push(...makeLine(pageId, `${pageId}_rowl${ri}`, 0.6, y + 0.3, 9.4, y + 0.3, COLORS.zinc600, 0.2));
    });

    // Footer
    r.push(...makeTextBox(pageId, `${pageId}_foot`, 7, 4.9, 3, 0.2, '◆ AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

function buildSlide7_Evolution(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section header
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.35, 3, 0.2, 'SEGUIMIENTO', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.teal, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.55, 5, 0.5, 'Evolución', {
        fontFamily: FONTS.serif, fontSize: 28, italic: true, color: COLORS.white, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_desc`, 0.6, 0.95, 5, 0.2, 'Registro de sesiones y seguimiento clínico', {
        fontFamily: FONTS.sans, fontSize: 9, color: COLORS.zinc500, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_slideN`, 8.5, 0.35, 1, 0.2, 'SLIDE 07', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.zinc600, alignment: 'END',
    }));

    // Table header
    const eCols = ['FECHA', 'SESIÓN', 'PROCEDIMIENTO REALIZADO', 'OBSERVACIONES', 'PRÓXIMO PASO'];
    const eXs = [0.6, 1.7, 2.5, 5.3, 7.5];
    const eWs = [1.0, 0.7, 2.7, 2.1, 2.0];

    eCols.forEach((h, i) => {
        r.push(...makeTextBox(pageId, `${pageId}_eth${i}`, eXs[i], 1.35, eWs[i], 0.2, h, {
            fontFamily: FONTS.sans, fontSize: 7, bold: true, color: COLORS.zinc500, alignment: 'START',
        }));
    });
    r.push(...makeLine(pageId, `${pageId}_eline0`, 0.6, 1.58, 9.4, 1.58, COLORS.zinc600, 0.3));

    // Example rows
    const eRows = [
        ['12/03/2025', '01', 'Evaluación Inicial y Limpieza Profunda', 'Sensibilidad moderada en cuadrante sup. dir.', 'RADIOGRAFÍA'],
        ['19/03/2025', '02', 'Blanqueamiento LED - Sesión 1', 'Tono inicial A3 → A2. Sin dolor.', 'SESIÓN 3'],
        ['...', '...', '...', '...', '...'],
    ];

    eRows.forEach((row, ri) => {
        const y = 1.7 + ri * 0.32;
        row.forEach((cell, ci) => {
            const isBadge = ci === 4 && ri < 2;
            const color = isBadge ? COLORS.teal : (ci === 2 ? COLORS.white : COLORS.zinc400);
            const fontSize = ci === 2 ? 9 : 8;
            const bold = ci === 2;
            r.push(...makeTextBox(pageId, `${pageId}_etd${ri}${ci}`, eXs[ci], y, eWs[ci], 0.25, cell, {
                fontFamily: FONTS.sans, fontSize, bold, color, alignment: 'START',
            }));
        });
        r.push(...makeLine(pageId, `${pageId}_erl${ri}`, 0.6, 1.7 + (ri + 1) * 0.32, 9.4, 1.7 + (ri + 1) * 0.32, COLORS.zinc600, 0.15));
    });

    // Next control card
    r.push(...makeRectangle(pageId, `${pageId}_nextcard`, 0.6, 3.5, 4.5, 1.0, {
        borderColor: COLORS.teal, borderWeight: 1,
    }));
    r.push(...makeTextBox(pageId, `${pageId}_nextlbl`, 0.9, 3.6, 2, 0.18, 'PRÓXIMO CONTROL', {
        fontFamily: FONTS.sans, fontSize: 7, bold: true, color: COLORS.teal, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_nextdate`, 0.9, 3.85, 2, 0.3, '26 de Mayo,\n2025', {
        fontFamily: FONTS.serif, fontSize: 14, bold: true, color: COLORS.white, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_nextnlbl`, 3.2, 3.6, 1.5, 0.18, 'NOTAS PRE-SESIÓN', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.zinc500, alignment: 'START',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_nextnval`, 3.2, 3.8, 1.8, 0.5, 'Control de sensibilidad post-Blanqueamiento.', {
        fontFamily: FONTS.sans, fontSize: 8, italic: true, color: COLORS.zinc400, alignment: 'START',
    }));

    // Footer
    r.push(...makeTextBox(pageId, `${pageId}_foot`, 7, 4.9, 3, 0.2, 'AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 6, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

function buildSlide8_BeforeAfter(pageId: string): object[] {
    const r: object[] = [];
    r.push(setSlideBackground(pageId, COLORS.black));

    // Section label
    r.push(...makeTextBox(pageId, `${pageId}_label`, 0.6, 0.35, 2, 0.2, 'RESULTADO', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.zinc500, alignment: 'START',
    }));
    // Title
    r.push(...makeTextBox(pageId, `${pageId}_title`, 0.6, 0.55, 5, 0.5, 'Transformación', {
        fontFamily: FONTS.serif, fontSize: 30, italic: true, color: COLORS.white, alignment: 'START',
    }));

    // Before photo placeholder
    r.push(...makeRectangle(pageId, `${pageId}_before`, 0.7, 1.3, 3.8, 2.3, {
        borderColor: COLORS.zinc600, borderWeight: 0.5, borderDash: 'DASH',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_beficon`, 2.2, 2.1, 0.5, 0.3, '📷', {
        fontFamily: FONTS.sans, fontSize: 18, color: COLORS.zinc600, alignment: 'CENTER',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_beflbl`, 0.7, 3.65, 3.8, 0.2, 'ANTES', {
        fontFamily: FONTS.sans, fontSize: 8, color: COLORS.zinc600, alignment: 'CENTER',
    }));

    // Arrow between
    r.push(...makeTextBox(pageId, `${pageId}_arrow`, 4.65, 2.2, 0.7, 0.3, '→', {
        fontFamily: FONTS.sans, fontSize: 16, color: COLORS.zinc500, alignment: 'CENTER',
    }));

    // After photo placeholder
    r.push(...makeRectangle(pageId, `${pageId}_after`, 5.5, 1.3, 3.8, 2.3, {
        borderColor: COLORS.zinc600, borderWeight: 0.5, borderDash: 'DASH',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_afticon`, 7.0, 2.1, 0.5, 0.3, '📷', {
        fontFamily: FONTS.sans, fontSize: 18, color: COLORS.zinc600, alignment: 'CENTER',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_aftlbl`, 5.5, 3.65, 3.8, 0.2, 'DESPUÉS', {
        fontFamily: FONTS.sans, fontSize: 8, color: COLORS.zinc600, alignment: 'CENTER',
    }));

    // Brand closing
    r.push(...makeTextBox(pageId, `${pageId}_quote`, 2, 4.0, 6, 0.3, '"Tu sonrisa, nuestra firma"', {
        fontFamily: FONTS.serif, fontSize: 16, italic: true, color: COLORS.zinc300, alignment: 'CENTER',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_brand`, 2, 4.35, 6, 0.2, 'AM ESTÉTICA DENTAL', {
        fontFamily: FONTS.sans, fontSize: 9, bold: true, color: COLORS.white, alignment: 'CENTER',
    }));
    r.push(...makeTextBox(pageId, `${pageId}_doctor`, 2, 4.55, 6, 0.2, '● Dr. Ariel Merino ●', {
        fontFamily: FONTS.sans, fontSize: 8, color: COLORS.zinc400, alignment: 'CENTER',
    }));

    // Date footer
    r.push(...makeTextBox(pageId, `${pageId}_datefoot`, 7.5, 5.0, 2, 0.2, '{{Fecha}}', {
        fontFamily: FONTS.sans, fontSize: 7, color: COLORS.zinc600, alignment: 'END',
    }));

    return r;
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
    console.log('🦷 Creating Premium Patient Template...\n');

    // Auth
    const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
    const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;
    const oauthRedirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

    if (!oauthClientId || !oauthClientSecret || !oauthRefreshToken) {
        console.error('❌ Missing OAuth credentials in .env.local');
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret, oauthRedirectUri);
    oauth2Client.setCredentials({ refresh_token: oauthRefreshToken });

    const slides = google.slides({ version: 'v1', auth: oauth2Client });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Create the presentation
    console.log('📄 Creating presentation...');
    const presentation = await slides.presentations.create({
        requestBody: {
            title: 'Plantilla Pacientes AM — Premium',
            pageSize: {
                width: { magnitude: SLIDE_W, unit: 'EMU' },
                height: { magnitude: SLIDE_H, unit: 'EMU' },
            },
        },
    });

    const presentationId = presentation.data.presentationId!;
    console.log(`✅ Presentation created: ${presentationId}`);

    // Get the default first slide ID
    const defaultSlideId = presentation.data.slides?.[0]?.objectId;

    // 2. Create 7 additional slides (we already have 1)
    console.log('📑 Adding slides...');
    const slideIds: string[] = [];
    const createSlideRequests: object[] = [];

    for (let i = 0; i < 8; i++) {
        const id = `slide_${i + 1}`;
        slideIds.push(id);
        if (i === 0 && defaultSlideId) {
            // We'll use the default slide for slide 1
            slideIds[0] = defaultSlideId;
            continue;
        }
        createSlideRequests.push({
            createSlide: {
                objectId: id,
                insertionIndex: i,
            },
        });
    }

    if (createSlideRequests.length > 0) {
        await slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: createSlideRequests },
        });
    }

    // 3. Build all slide content
    console.log('🎨 Building slide content...');
    const allRequests: object[] = [];

    const builders = [
        buildSlide1_Cover,
        buildSlide2_PersonalData,
        buildSlide3_MedicalHistory,
        buildSlide4_ConsultationReason,
        buildSlide5_Photography,
        buildSlide6_DiagnosisPlan,
        buildSlide7_Evolution,
        buildSlide8_BeforeAfter,
    ];

    builders.forEach((builder, i) => {
        console.log(`  → Slide ${i + 1}: ${builder.name.replace('buildSlide', '').replace(/_/g, ' ')}`);
        allRequests.push(...builder(slideIds[i]));
    });

    // 4. Execute all requests in batches (API limit is ~500 per batch)
    const BATCH_SIZE = 200;
    for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
        const batch = allRequests.slice(i, i + BATCH_SIZE);
        console.log(`  📤 Sending batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allRequests.length / BATCH_SIZE)} (${batch.length} requests)...`);
        await slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: batch },
        });
    }

    // 5. Move the presentation to the templates area or log its URL
    const editUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;

    console.log('\n' + '─'.repeat(60));
    console.log('✅ TEMPLATE CREATED SUCCESSFULLY!\n');
    console.log(`📎 Edit URL: ${editUrl}`);
    console.log(`🆔 Presentation ID: ${presentationId}`);
    console.log('\n📋 Next steps:');
    console.log(`   1. Open the URL above and review/adjust the template`);
    console.log(`   2. Add this to your .env.local:`);
    console.log(`      GOOGLE_SLIDES_TEMPLATE_FICHA=${presentationId}`);
    console.log('─'.repeat(60));
}

main().catch((err) => {
    console.error('❌ Error:', err.message || err);
    if (err.response?.data) {
        console.error('Details:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
