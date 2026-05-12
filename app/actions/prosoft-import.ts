'use server';

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parseImplicitHours } from '@/lib/gemini';
import { addDays, parse, differenceInMinutes } from 'date-fns';

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProsoftRow {
    rawName: string;            // Name as it appears in sheet
    personalId: string | null;  // Matched personal.id (null = no match)
    personalNombre: string;     // Matched worker name
    registros: {
        dia: number;
        fecha: string;          // YYYY-MM-DD
        entrada: string;        // HH:MM
        salida: string;         // HH:MM
        salidaDiaSiguiente?: boolean;
        horas: number;
        incompleto?: boolean;   // true when only one time is recorded
        requiereRevision?: boolean; // true when data is suspicious and needs manual check
        motivoObservado?: 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' | 'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
        observaciones?: string; // AI notes or metadata
        marcaciones?: string[]; // raw explicit marks, used to repair overnight exits
    }[];
}

export interface ProsoftPreview {
    mes: string;
    periodoDesde: string;
    periodoHasta: string;
    periodoDetectado: boolean;
    filas: ProsoftRow[];
    sinMatch: string[];         // Employee names with no personal match
    totalRegistros: number;
}

export interface ImportResult {
    inserted: number;
    skipped: number;
    errors: string[];
}

type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };

function toActionErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message?.trim()) {
        return error.message;
    }
    return fallback;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: string) {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // remove accents
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function padTime(t: string): string {
    // "8:00" → "08:00", "17:00" → "17:00"
    const [h, m] = t.split(':');
    return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
}

interface ParsedTime {
    entrada: string;
    salida: string;
    salidaDiaSiguiente?: boolean;
    horas: number;
    incompleto?: boolean;
    requiereRevision?: boolean;
    motivoObservado?: 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' | 'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
    observaciones?: string;
    marcaciones?: string[];
}

function isValidTimeToken(token: string): boolean {
    if (!/^\d{1,2}:\d{2}$/.test(token)) return false;
    const [h, m] = token.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function computeHours(entrada: string, salida: string): { horas: number; overnight: boolean } {
    const start = parse(entrada, 'HH:mm', new Date());
    let end = parse(salida, 'HH:mm', new Date());
    let overnight = false;

    if (end < start) {
        end = addDays(end, 1);
        overnight = true;
    }

    const diffMinutes = differenceInMinutes(end, start);
    return {
        horas: Math.round((diffMinutes / 60) * 100) / 100,
        overnight,
    };
}

async function parseTimeCell(cell: string): Promise<ParsedTime | null> {
    // Normalize: collapse \r, but preserve internal \n (multi-line cell content)
    const raw = cell.replace(/\r/g, '').trim();
    if (!raw) return null;

    // Time-like tokens in the cell (covers repeated marks and multi-line cells)
    const timeTokens = (raw.match(/\b\d{1,2}:\d{2}\b/g) || []).filter(isValidTimeToken).map(padTime);

    // --- Case A: exact one mark (missing counterpart)
    if (timeTokens.length === 1) {
        const token = timeTokens[0];
        const lower = raw.toLowerCase();
        const seemsExit = /salida|egreso|sale/.test(lower);

        return {
            entrada: seemsExit ? '00:00' : token,
            salida: seemsExit ? token : '00:00',
            horas: 0,
            incompleto: true,
            requiereRevision: true,
            motivoObservado: seemsExit ? 'FaltaIngreso' : 'FaltaEgreso',
            observaciones: 'Solo se detectó una marcación',
            marcaciones: timeTokens,
        };
    }

    // --- Case B: exact two marks (normal pair)
    if (timeTokens.length === 2) {
        const entrada = timeTokens[0];
        const salida = timeTokens[1];
        const { horas, overnight } = computeHours(entrada, salida);

        if (horas > 0 && horas <= 24) {
            const suspiciousLongShift = horas > 14;
            return {
                entrada,
                salida,
                salidaDiaSiguiente: overnight,
                horas,
                requiereRevision: suspiciousLongShift,
                motivoObservado: suspiciousLongShift ? 'HorasExcesivas' : undefined,
                observaciones: suspiciousLongShift
                    ? `Jornada inusualmente larga (${horas}h), requiere revisión manual`
                    : (overnight ? 'Turno noche (cruza medianoche)' : undefined),
                marcaciones: timeTokens,
            };
        }

        return {
            entrada,
            salida,
            horas: 0,
            incompleto: true,
            requiereRevision: true,
            motivoObservado: 'Otro',
            observaciones: 'Marcación inválida, revisar manualmente',
            marcaciones: timeTokens,
        };
    }

    // --- Case C: repeated marks in the same day (duplicate/conflict)
    if (timeTokens.length > 2) {
        const entrada = timeTokens[0];
        const salida = timeTokens[timeTokens.length - 1];
        const { horas, overnight } = computeHours(entrada, salida);
        const suspiciousLongShift = horas > 14;
        const intermediateCount = timeTokens.length - 2;

        return {
            entrada,
            salida,
            salidaDiaSiguiente: overnight,
            horas: horas > 0 && horas <= 24 ? horas : 0,
            incompleto: false,
            requiereRevision: suspiciousLongShift || horas <= 0 || horas > 24,
            motivoObservado: suspiciousLongShift ? 'HorasExcesivas' : (horas <= 0 || horas > 24 ? 'Otro' : undefined),
            observaciones: intermediateCount === 1
                ? `Se ignoró 1 marcación intermedia (${timeTokens.slice(1, -1).join(', ')})`
                : `Se ignoraron ${intermediateCount} marcaciones intermedias (${timeTokens.slice(1, -1).join(', ')})`,
            marcaciones: timeTokens,
        };
    }

    // --- Format B: single number = total hours worked (e.g. "8", "7.5", "8,5")
    const numStr = raw.replace(',', '.');
    const num = parseFloat(numStr);
    if (!isNaN(num) && num > 0 && num <= 24 && /^\d+([.,]\d+)?$/.test(raw)) {
        return { entrada: '00:00', salida: '00:00', horas: Math.round(num * 100) / 100 };
    }

    // --- Format C: presence markers → 8h default (Now with AI fallback for "P", "Sábado", etc.)
    // If it's a known simple case, we return fast. Otherwise, we go to AI.
    if (/^[Pp]$/.test(raw)) {
        return { entrada: '00:00', salida: '00:00', horas: 8, observaciones: 'Marcación de presencia (P)' };
    }

    // AI Fallback for anything else (implicit hours, text, complex formats)
    try {
        const aiResult = await parseImplicitHours(raw);
        if (aiResult.horas > 0 || aiResult.incompleto) {
            return {
                entrada: aiResult.entrada || '00:00',
                salida: aiResult.salida || '00:00',
                horas: aiResult.horas,
                incompleto: aiResult.incompleto,
                observaciones: aiResult.observaciones || 'Detectado por IA'
            };
        }
    } catch (error) {
        console.error("AI Fallback failed:", error);
    }

    return null;
}

function parseExplicitTimeTokens(timeTokens: string[], raw = ''): ParsedTime | null {
    if (timeTokens.length === 0) return null;

    if (timeTokens.length === 1) {
        const token = timeTokens[0];
        const lower = raw.toLowerCase();
        const seemsExit = /salida|egreso|sale/.test(lower);

        return {
            entrada: seemsExit ? '00:00' : token,
            salida: seemsExit ? token : '00:00',
            horas: 0,
            incompleto: true,
            requiereRevision: true,
            motivoObservado: seemsExit ? 'FaltaIngreso' : 'FaltaEgreso',
            observaciones: 'Solo se detectó una marcación',
            marcaciones: timeTokens,
        };
    }

    const entrada = timeTokens[0];
    const salida = timeTokens[timeTokens.length - 1];
    const { horas, overnight } = computeHours(entrada, salida);

    if (timeTokens.length === 2 && horas > 0 && horas <= 24) {
        const suspiciousLongShift = horas > 14;
        return {
            entrada,
            salida,
            salidaDiaSiguiente: overnight,
            horas,
            requiereRevision: suspiciousLongShift,
            motivoObservado: suspiciousLongShift ? 'HorasExcesivas' : undefined,
            observaciones: suspiciousLongShift
                ? `Jornada inusualmente larga (${horas}h), requiere revisión manual`
                : (overnight ? 'Turno noche (cruza medianoche)' : undefined),
            marcaciones: timeTokens,
        };
    }

    const suspiciousLongShift = horas > 14;
    const intermediateCount = timeTokens.length - 2;
    return {
        entrada,
        salida,
        salidaDiaSiguiente: overnight,
        horas: horas > 0 && horas <= 24 ? horas : 0,
        incompleto: false,
        requiereRevision: suspiciousLongShift || horas <= 0 || horas > 24,
        motivoObservado: suspiciousLongShift ? 'HorasExcesivas' : (horas <= 0 || horas > 24 ? 'Otro' : undefined),
        observaciones: intermediateCount === 1
            ? `Se ignoró 1 marcación intermedia (${timeTokens.slice(1, -1).join(', ')})`
            : `Se ignoraron ${intermediateCount} marcaciones intermedias (${timeTokens.slice(1, -1).join(', ')})`,
        marcaciones: timeTokens,
    };
}

function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
}

function isNextCalendarDay(previousDate: string, nextDate: string): boolean {
    const previous = new Date(`${previousDate}T12:00:00`);
    const next = new Date(`${nextDate}T12:00:00`);
    const diffMs = next.getTime() - previous.getTime();
    return diffMs > 0 && diffMs <= 36 * 60 * 60 * 1000;
}

function repairOvernightExitMarks(registros: ProsoftRow['registros']): ProsoftRow['registros'] {
    const sorted = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));

    for (let index = 1; index < sorted.length; index++) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        const firstCurrentMark = current.marcaciones?.[0];

        const previousNeedsExit =
            previous.motivoObservado === 'FaltaEgreso' &&
            previous.entrada !== '00:00' &&
            previous.salida === '00:00';

        const currentCanDonateEarlyExit =
            Boolean(firstCurrentMark) &&
            isNextCalendarDay(previous.fecha, current.fecha) &&
            timeToMinutes(firstCurrentMark!) <= 5 * 60 &&
            (current.marcaciones?.length || 0) >= 3;

        if (!previousNeedsExit || !currentCanDonateEarlyExit) continue;

        const { horas, overnight } = computeHours(previous.entrada, firstCurrentMark!);
        if (!overnight || horas <= 0 || horas > 18) continue;

        previous.salida = firstCurrentMark!;
        previous.salidaDiaSiguiente = true;
        previous.horas = horas;
        previous.incompleto = false;
        previous.requiereRevision = false;
        previous.motivoObservado = undefined;
        previous.observaciones = `Salida de madrugada tomada del día siguiente (${current.fecha} ${firstCurrentMark})`;

        const remainingMarks = current.marcaciones!.slice(1);
        const repairedCurrent = parseExplicitTimeTokens(remainingMarks, remainingMarks.join(' '));
        if (repairedCurrent) {
            Object.assign(current, repairedCurrent);
        }
    }

    return sorted;
}

function normalizeRepeatedMarksAsValid(reg: ProsoftRow['registros'][number]): ProsoftRow['registros'][number] {
    const repeatedMarksReason =
        reg.motivoObservado === 'MarcacionesImpares' ||
        reg.motivoObservado === 'ConflictoDuplicado';

    const hasUsablePair =
        reg.entrada &&
        reg.salida &&
        reg.entrada !== '00:00' &&
        reg.salida !== '00:00' &&
        Number(reg.horas || 0) > 0 &&
        Number(reg.horas || 0) <= 14;

    if (!repeatedMarksReason || !hasUsablePair) return reg;

    return {
        ...reg,
        incompleto: false,
        requiereRevision: false,
        motivoObservado: undefined,
        observaciones: reg.observaciones?.includes('marcación intermedia')
            ? reg.observaciones
            : 'Marcaciones múltiples: se tomó primera marca como ingreso y última como egreso',
    };
}

// When multiple ProSoft employees share the same personal_id (e.g. cleaning group
// mapped to "Limpieza Horas Totales"), merge their registros by date, summing hours.
function aggregateSharedPersonalIds(filas: ProsoftRow[]): ProsoftRow[] {
    const grouped = new Map<string, ProsoftRow>();
    const unmatched: ProsoftRow[] = [];

    for (const fila of filas) {
        if (!fila.personalId) {
            unmatched.push(fila);
            continue;
        }

        const existing = grouped.get(fila.personalId);
        if (!existing) {
            grouped.set(fila.personalId, {
                ...fila,
                registros: fila.registros.map(r => ({ ...r })),
            });
            continue;
        }

        // Merge this fila's registros into the existing one
        for (const reg of fila.registros) {
            const match = existing.registros.find(r => r.fecha === reg.fecha);
            if (match) {
                match.horas = Math.round((match.horas + reg.horas) * 100) / 100;
                const note = `+${reg.horas}h (${fila.rawName})`;
                match.observaciones = match.observaciones
                    ? `${match.observaciones} | ${note}`
                    : note;
            } else {
                existing.registros.push({
                    ...reg,
                    observaciones: reg.observaciones
                        ? `${reg.observaciones} (${fila.rawName})`
                        : `${reg.horas}h (${fila.rawName})`,
                });
            }
        }
        existing.rawName = `${existing.rawName} + ${fila.rawName}`;
    }

    return [...grouped.values(), ...unmatched];
}

function normalizePreviewRows(preview: ProsoftPreview): ProsoftPreview {
    return {
        ...preview,
        filas: preview.filas.map((fila) => ({
            ...fila,
            registros: repairOvernightExitMarks(fila.registros).map(normalizeRepeatedMarksAsValid),
        })),
    };
}

function getGidFromUrl(url: URL): string {
    const searchGid = url.searchParams.get('gid');
    if (searchGid && /^\d+$/.test(searchGid)) return searchGid;

    const hashGid = url.hash.match(/gid=(\d+)/)?.[1];
    if (hashGid) return hashGid;

    return '0';
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

function getCsvUrlsFromSheetUrl(rawUrl: string): string[] {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return [];
    }

    const path = parsed.pathname;
    const candidates: string[] = [];

    // Direct export URL already provided
    if (path.includes('/export')) {
        parsed.searchParams.set('format', 'csv');
        candidates.push(parsed.toString());
    }

    // Already a gviz URL; ensure CSV output is requested.
    if (path.includes('/gviz/tq')) {
        parsed.searchParams.set('tqx', 'out:csv');
        candidates.push(parsed.toString());
    }

    // Published sheet URL (d/e/.../pub or /pubhtml)
    if (/\/spreadsheets\/d\/e\/[^/]+\/(pub|pubhtml)$/.test(path)) {
        const pubUrl = new URL(parsed.toString());

        if (path.endsWith('/pubhtml')) {
            pubUrl.pathname = path.replace(/\/pubhtml$/, '/pub');
        }

        pubUrl.searchParams.set('output', 'csv');
        const gid = getGidFromUrl(parsed);

        if (gid !== '0') {
            pubUrl.searchParams.set('gid', gid);
            pubUrl.searchParams.set('single', 'true');
        }

        candidates.push(pubUrl.toString());

        // Fallback without gid for published docs
        if (gid !== '0') {
            const fallbackPub = new URL(pubUrl.toString());
            fallbackPub.searchParams.delete('gid');
            fallbackPub.searchParams.delete('single');
            candidates.push(fallbackPub.toString());
        }
    }

    // Standard editable sheet URL (d/{sheetId}/...)
    const idMatch = path.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
        const sheetId = idMatch[1];
        const gid = getGidFromUrl(parsed);

        candidates.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`);
        candidates.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);
        candidates.push(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`);
        candidates.push(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`);
    }

    return uniqueStrings(candidates);
}

// Proper RFC-4180 CSV parser that handles quoted multi-line cells.
// The old line-split approach broke Prosoft cells like "08:00\n17:00" (entry/exit on two lines).
function parseCsvText(text: string): string[][] {
    const rows: string[][] = [];
    const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let cur = '';
    let inQuote = false;
    let cells: string[] = [];

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];

        if (inQuote) {
            if (ch === '"') {
                // Escaped "" inside quoted field
                if (src[i + 1] === '"') { cur += '"'; i++; }
                else { inQuote = false; }
            } else {
                cur += ch; // newlines inside quotes stay in the cell
            }
        } else {
            if (ch === '"') {
                inQuote = true;
            } else if (ch === ',') {
                cells.push(cur.trim());
                cur = '';
            } else if (ch === '\n') {
                cells.push(cur.trim());
                if (cells.some(c => c !== '')) rows.push(cells);
                cells = [];
                cur = '';
            } else {
                cur += ch;
            }
        }
    }
    // Last cell / row
    cells.push(cur.trim());
    if (cells.some(c => c !== '')) rows.push(cells);

    return rows;
}

function toIsoFromArDate(dateAr: string): string | null {
    const m = dateAr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;

    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(dateIso: string): { year: number; month: number; day: number } | null {
    const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
    };
}

function getPeriodDates(period: { desde: string; hasta: string } | null): string[] {
    if (!period) return [];

    const desde = parseIsoDate(period.desde);
    const hasta = parseIsoDate(period.hasta);
    if (!desde || !hasta) return [];

    const dates: string[] = [];
    let cursor = Date.UTC(desde.year, desde.month - 1, desde.day);
    const end = Date.UTC(hasta.year, hasta.month - 1, hasta.day);

    while (cursor <= end) {
        const d = new Date(cursor);
        dates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
        cursor += 24 * 60 * 60 * 1000;
    }

    return dates;
}

function extractPeriodFromCsv(rows: string[][]): { desde: string; hasta: string; mes: string } | null {
    for (const row of rows.slice(0, 30)) {
        const joined = row.join(' ').replace(/\s+/g, ' ').trim();
        const match = joined.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:~|\-|–|—|a|al|hasta)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (!match) continue;

        const desde = toIsoFromArDate(match[1]);
        const hasta = toIsoFromArDate(match[2]);
        if (!desde || !hasta) continue;

        return {
            desde,
            hasta,
            mes: desde.slice(0, 7),
        };
    }

    return null;
}

async function fetchCsv(csvUrl: string): Promise<string[][]> {
    const res = await fetch(csvUrl, { cache: 'no-store' });

    if (!res.ok) {
        throw new Error(`No se pudo acceder a la planilla (HTTP ${res.status}). Verificá que sea pública.`);
    }

    const text = await res.text();
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
        throw new Error(
            'Google devolvió una página HTML en lugar de CSV. Verificá que la hoja sea pública para lectura y pegá el link de la pestaña correcta (con gid).'
        );
    }

    return parseCsvText(text);
}

async function fetchCsvWithFallback(csvUrls: string[]): Promise<string[][]> {
    const errors: string[] = [];

    for (const csvUrl of csvUrls) {
        try {
            const rows = await fetchCsv(csvUrl);
            return rows;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            errors.push(message);
        }
    }

    const detail = errors[0] ? ` Detalle: ${errors[0]}` : '';
    throw new Error(
        `No se pudo acceder a la planilla. Probá usar el link de Google Sheets en formato /edit#gid=... de la pestaña correcta.${detail}`
    );
}

// ─── Parse Matrix ─────────────────────────────────────────────────────────────

function parseProsoftMatrix(rows: string[][], period: { desde: string; hasta: string } | null = null): {
    employeeRows: { rawName: string; timeCells: Record<string, string> }[];
    dayColumns: Record<number, number>; // colIndex → day number (1-31)
} {
    // Find the header row: the row with the most day-number columns (1–31).
    // Search up to 60 rows to handle layouts with multiple metadata blocks at the top.
    let headerRowIdx = -1;
    let dayColumns: Record<number, number> = {};
    let bestDayCount = 0;

    for (let r = 0; r < Math.min(60, rows.length); r++) {
        const row = rows[r];
        let dayCount = 0;
        const cols: Record<number, number> = {};

        for (let c = 0; c < row.length; c++) {
            // Normalize: strip \r, collapse whitespace
            const cell = row[c].replace(/\r/g, '').trim();
            // Accept any 1-2 digit number found in the cell (handles "1", "01", "1 Lun", "Lun 1", "LUN\n1", etc.)
            const dayMatch = cell.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
            if (dayMatch) {
                const day = parseInt(dayMatch[1]);
                if (day >= 1 && day <= 31) {
                    // Only count as day column if not the first column (first col = employee name)
                    if (c > 0) {
                        cols[c] = day;
                        dayCount++;
                    }
                }
            }
        }

        // Pick the row with the most day columns (need at least 3)
        if (dayCount > bestDayCount) {
            bestDayCount = dayCount;
            headerRowIdx = r;
            dayColumns = cols;
        }
    }

    if (headerRowIdx === -1 || bestDayCount < 3) {
        throw new Error(
            `No se encontró la fila de encabezado de días en la planilla. ` +
            `Verificá que la planilla sea pública y tenga el formato Prosoft estándar ` +
            `(primera columna = nombre, resto = días del mes).`
        );
    }

    const periodDates = getPeriodDates(period);
    const sortedDayCols = Object.keys(dayColumns).map(Number).sort((a, b) => a - b);

    // Build col → ISO date mapping.
    // When the period is known, map columns LEFT-TO-RIGHT against the period dates
    // (ProSoft exports days as consecutive columns; header numbers can be unreliable
    // due to weird Excel formatting, 0-indexed headers, or off-by-one shifts).
    const colToDate = new Map<number, string>();
    if (periodDates.length > 0) {
        const usedCols = sortedDayCols.slice(0, periodDates.length);
        usedCols.forEach((col, index) => colToDate.set(col, periodDates[index]));
    } else {
        // No period detected: fall back to header day numbers as string keys
        for (const [colStr, day] of Object.entries(dayColumns)) {
            colToDate.set(parseInt(colStr), String(day));
        }
    }

    // Detect name column: the non-day column (among first 3 cols) with the most
    // alphabetic content in the data rows. Handles Prosoft layouts where col 0
    // is a row-index number and col 1 is the actual employee name.
    const dayColSet = new Set(colToDate.keys());
    const candidateCols = [0, 1, 2].filter(c => !dayColSet.has(c));
    let nameColIdx = 0;
    let bestAlpha = -1;
    for (const c of candidateCols) {
        let alpha = 0;
        for (let r = headerRowIdx + 1; r < Math.min(headerRowIdx + 10, rows.length); r++) {
            const val = (rows[r][c] || '').trim();
            if (/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(val)) alpha++;
        }
        if (alpha > bestAlpha) { bestAlpha = alpha; nameColIdx = c; }
    }

    // Employee rows: every row after the header with a non-empty name column
    // and at least one time cell
    const employeeRows: { rawName: string; timeCells: Record<string, string> }[] = [];

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const rawName = (row[nameColIdx] || '').replace(/\r/g, '').trim();
        if (!rawName) continue;
        // Skip totals/summary rows and pure-number rows (row-index artifacts)
        if (/total|resumen|horas|promedio/i.test(rawName)) continue;
        if (/^\d+$/.test(rawName)) continue;

        const timeCells: Record<string, string> = {};
        let hasAny = false;

        for (const [col, dateKey] of colToDate) {
            const cell = (row[col] || '').trim();
            if (cell) {
                timeCells[dateKey] = cell;
                hasAny = true;
            }
        }

        if (hasAny) {
            employeeRows.push({ rawName, timeCells });
        }
    }

    return { employeeRows, dayColumns };
}

// ─── Match employees ──────────────────────────────────────────────────────────

async function matchEmployees(
    names: string[]
): Promise<Map<string, { id: string; nombre: string; apellido: string }>> {
    const admin = getAdminClient();

    // 1. Check saved DB mappings first (exact raw_name match)
    const { data: savedMaps } = await admin
        .from('prosoft_name_map')
        .select('raw_name, personal_id, personal!inner(id, nombre, apellido)')
        .in('raw_name', names);

    const result = new Map<string, { id: string; nombre: string; apellido: string }>();
    const unmapped: string[] = [];

    for (const name of names) {
        const saved = savedMaps?.find((m: Record<string, unknown>) => m.raw_name === name);
        if (saved?.personal) {
            const p = (Array.isArray(saved.personal) ? saved.personal[0] : saved.personal) as { id: string; nombre: string; apellido: string };
            result.set(name, p);
        } else {
            unmapped.push(name);
        }
    }

    if (unmapped.length === 0) return result;

    // 2. Fuzzy match for the rest
    const { data: workers } = await admin
        .from('personal')
        .select('id, nombre, apellido')
        .eq('activo', true);

    for (const rawName of unmapped) {
        const normName = norm(rawName);
        let bestMatch: { id: string; nombre: string; apellido: string } | null = null;
        let bestScore = 0;

        for (const w of workers || []) {
            const fullName = norm(`${w.nombre} ${w.apellido || ''}`);
            const reverseName = norm(`${w.apellido || ''} ${w.nombre}`);

            const score =
                fullName === normName ? 100 :
                    reverseName === normName ? 100 :
                        fullName.includes(normName) || normName.includes(fullName) ? 80 :
                            reverseName.includes(normName) || normName.includes(reverseName) ? 80 :
                                norm(w.nombre) === normName ? 70 :
                                    normName.includes(norm(w.nombre)) ? 60 : 0;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = w;
            }
        }

        if (bestMatch && bestScore >= 60) {
            result.set(rawName, bestMatch);
        }
    }

    return result;
}

// ─── Name map management ──────────────────────────────────────────────────────

export async function getAllPersonalBasic(): Promise<
    { id: string; nombre: string; apellido: string | null }[]
> {
    const admin = getAdminClient();
    const { data } = await admin
        .from('personal')
        .select('id, nombre, apellido')
        .eq('activo', true)
        .order('apellido')
        .order('nombre');
    return (data || []) as { id: string; nombre: string; apellido: string | null }[];
}

export async function saveProsoftMapping(
    rawName: string,
    personalId: string
): Promise<{ success: boolean; error?: string }> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('prosoft_name_map')
        .upsert({ raw_name: rawName, personal_id: personalId, updated_at: new Date().toISOString() }, {
            onConflict: 'raw_name',
        });
    if (error) return { success: false, error: error.message };
    return { success: true };
}

export async function deleteProsoftMapping(
    rawName: string
): Promise<{ success: boolean }> {
    const admin = getAdminClient();
    await admin.from('prosoft_name_map').delete().eq('raw_name', rawName);
    return { success: true };
}

export async function getProsoftMappings(): Promise<
    { raw_name: string; personal_id: string; nombre: string; apellido: string | null }[]
> {
    const admin = getAdminClient();
    const { data } = await admin
        .from('prosoft_name_map')
        .select('raw_name, personal_id, personal!inner(nombre, apellido)')
        .order('raw_name');

    return (data || []).map((m: Record<string, unknown>) => {
        const p = (Array.isArray(m.personal) ? m.personal[0] : m.personal) as { nombre: string; apellido: string | null };
        return {
            raw_name: m.raw_name as string,
            personal_id: m.personal_id as string,
            nombre: p.nombre,
            apellido: p.apellido,
        };
    });
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export async function previewProsoftImport(
    sheetUrl: string,
    mesOverride?: string // optional manual override: 'YYYY-MM'
): Promise<ProsoftPreview> {
    const csvUrls = getCsvUrlsFromSheetUrl(sheetUrl);
    if (csvUrls.length === 0) {
        throw new Error(
            'URL inválida. Pegá un link de Google Sheets (edit, pub/pubhtml o gviz) y, si aplica, el gid de la pestaña.'
        );
    }

    const csvRows = await fetchCsvWithFallback(csvUrls);
    const preview = await processProsoftRows(csvRows, mesOverride);
    return preview;
}

export async function previewProsoftImportSafe(
    sheetUrl: string,
    mesOverride?: string
): Promise<ActionResult<ProsoftPreview>> {
    try {
        const data = await previewProsoftImport(sheetUrl, mesOverride);
        return { success: true, data };
    } catch (error) {
        console.error('previewProsoftImportSafe error:', error);
        return {
            success: false,
            error: toActionErrorMessage(error, 'No se pudo procesar la planilla Prosoft.'),
        };
    }
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importProsoftData(
    sheetUrl: string,
    mesOverride?: string,
    onlyMatched = true
): Promise<ImportResult> {
    const preview = normalizePreviewRows(await previewProsoftImport(sheetUrl, mesOverride));
    const admin = getAdminClient();

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    const filasToImport = onlyMatched
        ? preview.filas.filter(f => f.personalId)
        : preview.filas;

    for (const fila of filasToImport) {
        if (!fila.personalId) {
            skipped += fila.registros.length;
            continue;
        }

        for (const reg of fila.registros) {
            const requiereRevision = Boolean(reg.incompleto || reg.requiereRevision);
            const estado = requiereRevision ? 'Observado' : 'Registrado';
            const motivoObservado = requiereRevision ? (reg.motivoObservado || 'Otro') : null;

            let observaciones = requiereRevision
                ? `Registro observado por control automático (${motivoObservado}) — Prosoft ${preview.mes}`
                : `Importado desde Prosoft (${preview.mes})`;

            if (reg.observaciones) {
                observaciones += ` | ${reg.observaciones}`;
            }

            // Check if record already exists (dedup by personal_id + fecha)
            const { data: existingRows } = await admin
                .from('registro_horas')
                .select('id, horas, estado')
                .eq('personal_id', fila.personalId)
                .eq('fecha', reg.fecha)
                .limit(1);
            const existing = existingRows?.[0] ?? null;

            if (existing) {
                // Skip if the existing record has real hours (could be manually corrected)
                const existingIsObserved = String(existing.estado || '').toLowerCase() === 'observado';
                if (Number(existing.horas) > 0 && !requiereRevision && !existingIsObserved) {
                    skipped++;
                    continue;
                }
                // Update if existing record had 0h (bad previous import) or if new data is complete
                const { error } = await admin
                    .from('registro_horas')
                    .update({
                        horas: reg.horas,
                        hora_ingreso: reg.entrada,
                        hora_egreso: reg.salida,
                        salida_dia_siguiente: reg.salidaDiaSiguiente ?? false,
                        estado,
                        motivo_observado: motivoObservado,
                        original_hora_ingreso: reg.entrada,
                        original_hora_egreso: reg.salida,
                        observaciones,
                    })
                    .eq('id', existing.id);
                if (error) errors.push(`${fila.rawName} ${reg.fecha}: ${error.message}`);
                else inserted++;
                continue;
            }

            const { error } = await admin.from('registro_horas').insert({
                personal_id: fila.personalId,
                fecha: reg.fecha,
                horas: reg.horas,
                hora_ingreso: reg.entrada,
                hora_egreso: reg.salida,
                salida_dia_siguiente: reg.salidaDiaSiguiente ?? false,
                estado,
                motivo_observado: motivoObservado,
                original_hora_ingreso: reg.entrada,
                original_hora_egreso: reg.salida,
                observaciones,
            });

            if (error) {
                errors.push(`${fila.rawName} ${reg.fecha}: ${error.message}`);
            } else {
                inserted++;
            }
        }
    }

    return { inserted, skipped, errors };
}

export async function importProsoftDataSafe(
    sheetUrl: string,
    mesOverride?: string,
    onlyMatched = true
): Promise<ActionResult<ImportResult>> {
    try {
        const data = await importProsoftData(sheetUrl, mesOverride, onlyMatched);
        return { success: true, data };
    } catch (error) {
        console.error('importProsoftDataSafe error:', error);
        return {
            success: false,
            error: toActionErrorMessage(error, 'No se pudo importar la planilla Prosoft.'),
        };
    }
}

import * as xlsx from 'xlsx';

export async function processProsoftRows(
    csvRows: string[][],
    mesOverride?: string
): Promise<ProsoftPreview> {
    const detectedPeriod = extractPeriodFromCsv(csvRows);
    const mes = detectedPeriod?.mes || mesOverride;

    if (!mes) {
        throw new Error(
            'No se pudo detectar el período automáticamente desde la planilla. Verificá que Prosoft incluya "Periodo: dd/mm/aaaa ~ dd/mm/aaaa".'
        );
    }

    const { employeeRows } = parseProsoftMatrix(csvRows, detectedPeriod);

    const [year, month] = mes.split('-').map(Number);

    const rawNames = employeeRows.map(r => r.rawName);
    const matchMap = await matchEmployees(rawNames);

    const sinMatch: string[] = [];
    let totalRegistros = 0;

    const filas: ProsoftRow[] = await Promise.all(employeeRows.map(async (emp) => {
        const match = matchMap.get(emp.rawName);
        if (!match) sinMatch.push(emp.rawName);

        const registrosPromises = Object.entries(emp.timeCells)
            .map(async ([key, cell]) => {
                const parsed = await parseTimeCell(cell);
                if (!parsed) return null;
                // key is an ISO date when period is detected, or a day number string as fallback
                const fecha = key.includes('-')
                    ? key
                    : `${year}-${String(month).padStart(2, '0')}-${String(parseInt(key)).padStart(2, '0')}`;
                const dia = parseInt(fecha.slice(-2));
                return { dia, fecha, ...parsed };
            });

        const registros = repairOvernightExitMarks(
            (await Promise.all(registrosPromises)).filter(Boolean) as ProsoftRow['registros']
        );

        totalRegistros += registros.length;

        return {
            rawName: emp.rawName,
            personalId: match?.id ?? null,
            personalNombre: match ? `${match.nombre} ${match.apellido || ''}`.trim() : '',
            registros,
        };
    }));

    const aggregatedFilas = aggregateSharedPersonalIds(filas);

    const [retYear, retMonth] = mes.split('-').map(Number);
    const lastDay = new Date(retYear, retMonth, 0).getDate();

    return {
        mes,
        periodoDesde: detectedPeriod?.desde || `${mes}-01`,
        periodoHasta: detectedPeriod?.hasta || `${mes}-${String(lastDay).padStart(2, '0')}`,
        periodoDetectado: Boolean(detectedPeriod),
        filas: aggregatedFilas,
        sinMatch,
        totalRegistros: aggregatedFilas.reduce((s, f) => s + f.registros.length, 0),
    };
}

export async function previewProsoftFileSafe(
    formData: FormData,
    mesOverride?: string
): Promise<ActionResult<ProsoftPreview>> {
    try {
        const file = formData.get('file') as File;
        if (!file) throw new Error('No se envió ningún archivo');

        const buffer = Buffer.from(await file.arrayBuffer());
        const lowerName = file.name.toLowerCase();
        const isCsv = lowerName.endsWith('.csv');
        let csvText = '';

        if (isCsv) {
            csvText = buffer.toString('utf8');
        } else {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const firstSheetName = workbook.SheetNames[0];
            csvText = xlsx.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
        }

        const csvRows = parseCsvText(csvText);
        const preview = await processProsoftRows(csvRows, mesOverride);
        return { success: true, data: preview };
    } catch (e: unknown) {
        return { success: false, error: toActionErrorMessage(e, 'Error al procesar el archivo') };
    }
}

export async function importProsoftPreviewSafe(
    preview: ProsoftPreview,
    onlyMatched = true,
    personalIdFilter?: string
): Promise<ActionResult<ImportResult>> {
    try {
        const normalizedPreview = normalizePreviewRows(preview);
        const admin = getAdminClient();
        let inserted = 0;
        let skipped = 0;
        const errors: string[] = [];

        let filasToImport = onlyMatched
            ? normalizedPreview.filas.filter(f => f.personalId)
            : normalizedPreview.filas;

        if (personalIdFilter) {
            filasToImport = filasToImport.filter(f => f.personalId === personalIdFilter);
        }

        for (const fila of filasToImport) {
            if (!fila.personalId) {
                skipped += fila.registros.length;
                continue;
            }

            for (const reg of fila.registros) {
                const requiereRevision = Boolean(reg.incompleto || reg.requiereRevision);
                const estado = requiereRevision ? 'Observado' : 'Registrado';
                const motivoObservado = requiereRevision ? (reg.motivoObservado || 'Otro') : null;

                let observaciones = requiereRevision
                    ? `Registro observado por control automático (${motivoObservado}) — Local ${normalizedPreview.mes}`
                    : `Importado desde archivo local (${normalizedPreview.mes})`;

                if (reg.observaciones) {
                    observaciones += ` | ${reg.observaciones}`;
                }

                const { data: existingRows2 } = await admin
                    .from('registro_horas')
                    .select('id, horas, estado')
                    .eq('personal_id', fila.personalId)
                    .eq('fecha', reg.fecha)
                    .limit(1);
                const existing = existingRows2?.[0] ?? null;

                if (existing) {
                    const existingIsObserved = String(existing.estado || '').toLowerCase() === 'observado';
                    if (Number(existing.horas) > 0 && !requiereRevision && !existingIsObserved) {
                        skipped++;
                        continue;
                    }
                    const { error } = await admin
                        .from('registro_horas')
                        .update({
                            horas: reg.horas,
                            hora_ingreso: reg.entrada,
                            hora_egreso: reg.salida,
                            salida_dia_siguiente: reg.salidaDiaSiguiente ?? false,
                            estado,
                            motivo_observado: motivoObservado,
                            original_hora_ingreso: reg.entrada,
                            original_hora_egreso: reg.salida,
                            observaciones,
                        })
                        .eq('id', existing.id);
                    if (error) errors.push(`${fila.rawName} ${reg.fecha}: ${error.message}`);
                    else inserted++;
                    continue;
                }

                const { error } = await admin.from('registro_horas').insert({
                    personal_id: fila.personalId,
                    fecha: reg.fecha,
                    horas: reg.horas,
                    hora_ingreso: reg.entrada,
                    hora_egreso: reg.salida,
                    salida_dia_siguiente: reg.salidaDiaSiguiente ?? false,
                    estado,
                    motivo_observado: motivoObservado,
                    original_hora_ingreso: reg.entrada,
                    original_hora_egreso: reg.salida,
                    observaciones,
                });

                if (error) {
                    errors.push(`${fila.rawName} ${reg.fecha}: ${error.message}`);
                } else {
                    inserted++;
                }
            }
        }

        return { success: true, data: { inserted, skipped, errors } };
    } catch (e: unknown) {
        return { success: false, error: toActionErrorMessage(e, 'Error al importar') };
    }
}
