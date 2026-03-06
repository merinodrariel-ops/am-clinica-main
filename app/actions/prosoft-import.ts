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
        horas: number;
        incompleto?: boolean;   // true when only one time is recorded
        requiereRevision?: boolean; // true when data is suspicious and needs manual check
        motivoObservado?: 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' | 'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
        observaciones?: string; // AI notes or metadata
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
    horas: number;
    incompleto?: boolean;
    requiereRevision?: boolean;
    motivoObservado?: 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' | 'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
    observaciones?: string;
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
                horas,
                requiereRevision: suspiciousLongShift,
                motivoObservado: suspiciousLongShift ? 'HorasExcesivas' : undefined,
                observaciones: suspiciousLongShift
                    ? `Jornada inusualmente larga (${horas}h), requiere revisión manual`
                    : (overnight ? 'Turno noche (cruza medianoche)' : undefined),
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
        };
    }

    // --- Case C: repeated marks in the same day (duplicate/conflict)
    if (timeTokens.length > 2) {
        const entrada = timeTokens[0];
        const salida = timeTokens[timeTokens.length - 1];
        const { horas } = computeHours(entrada, salida);
        const hasOddCount = timeTokens.length % 2 !== 0;

        return {
            entrada,
            salida,
            horas: horas > 0 && horas <= 24 ? horas : 0,
            incompleto: hasOddCount,
            requiereRevision: true,
            motivoObservado: hasOddCount ? 'MarcacionesImpares' : 'ConflictoDuplicado',
            observaciones: hasOddCount
                ? `Se detectaron ${timeTokens.length} marcaciones (cantidad impar)`
                : `Se detectaron ${timeTokens.length} marcaciones (posible doble fichada)`,
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

function buildDayToDateMap(period: { desde: string; hasta: string } | null): Map<number, string> {
    const map = new Map<number, string>();
    if (!period) return map;

    const desde = parseIsoDate(period.desde);
    const hasta = parseIsoDate(period.hasta);
    if (!desde || !hasta) return map;

    let cursor = Date.UTC(desde.year, desde.month - 1, desde.day);
    const end = Date.UTC(hasta.year, hasta.month - 1, hasta.day);

    while (cursor <= end) {
        const d = new Date(cursor);
        const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        map.set(d.getUTCDate(), iso);
        cursor += 24 * 60 * 60 * 1000;
    }

    return map;
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

function parseProsoftMatrix(rows: string[][]): {
    employeeRows: { rawName: string; timeCells: Record<number, string> }[];
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

    const validDays = dayColumns;

    // Detect name column: the non-day column (among first 3 cols) with the most
    // alphabetic content in the data rows. Handles Prosoft layouts where col 0
    // is a row-index number and col 1 is the actual employee name.
    const dayColSet = new Set(Object.keys(validDays).map(Number));
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
    const employeeRows: { rawName: string; timeCells: Record<number, string> }[] = [];

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const rawName = (row[nameColIdx] || '').replace(/\r/g, '').trim();
        if (!rawName) continue;
        // Skip totals/summary rows and pure-number rows (row-index artifacts)
        if (/total|resumen|horas|promedio/i.test(rawName)) continue;
        if (/^\d+$/.test(rawName)) continue;

        const timeCells: Record<number, string> = {};
        let hasAny = false;

        for (const [colStr, day] of Object.entries(validDays)) {
            const col = parseInt(colStr);
            const cell = (row[col] || '').trim();
            if (cell) {
                timeCells[day] = cell;
                hasAny = true;
            }
        }

        if (hasAny) {
            employeeRows.push({ rawName, timeCells });
        }
    }

    return { employeeRows, dayColumns: validDays as Record<number, number> };
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
    const preview = await previewProsoftImport(sheetUrl, mesOverride);
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
            const estado = requiereRevision ? 'observado' : 'pending';
            const motivoObservado = requiereRevision ? (reg.motivoObservado || 'Otro') : null;

            let observaciones = requiereRevision
                ? `Registro observado por control automático (${motivoObservado}) — Prosoft ${preview.mes}`
                : `Importado desde Prosoft (${preview.mes})`;

            if (reg.observaciones) {
                observaciones += ` | ${reg.observaciones}`;
            }

            // Check if record already exists (dedup by personal_id + fecha)
            const { data: existing } = await admin
                .from('registro_horas')
                .select('id, horas')
                .eq('personal_id', fila.personalId)
                .eq('fecha', reg.fecha)
                .maybeSingle();

            if (existing) {
                // Skip if the existing record has real hours (could be manually corrected)
                if (Number(existing.horas) > 0 && !requiereRevision) {
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
    const mes = mesOverride || detectedPeriod?.mes;

    if (!mes) {
        throw new Error(
            'No se pudo detectar el período automáticamente desde la planilla. Verificá que Prosoft incluya "Periodo: dd/mm/aaaa ~ dd/mm/aaaa".'
        );
    }

    const { employeeRows } = parseProsoftMatrix(csvRows);

    const [year, month] = mes.split('-').map(Number);
    const dayToDateMap = buildDayToDateMap(detectedPeriod);

    const rawNames = employeeRows.map(r => r.rawName);
    const matchMap = await matchEmployees(rawNames);

    const sinMatch: string[] = [];
    let totalRegistros = 0;

    const filas: ProsoftRow[] = await Promise.all(employeeRows.map(async (emp) => {
        const match = matchMap.get(emp.rawName);
        if (!match) sinMatch.push(emp.rawName);

        const registrosPromises = Object.entries(emp.timeCells)
            .map(async ([dayStr, cell]) => {
                const dia = parseInt(dayStr);
                const parsed = await parseTimeCell(cell);
                if (!parsed) return null;
                const fecha = dayToDateMap.get(dia) || `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                return { dia, fecha, ...parsed };
            });

        const registros = (await Promise.all(registrosPromises)).filter(Boolean) as ProsoftRow['registros'];

        totalRegistros += registros.length;

        return {
            rawName: emp.rawName,
            personalId: match?.id ?? null,
            personalNombre: match ? `${match.nombre} ${match.apellido || ''}`.trim() : '',
            registros,
        };
    }));

    const [retYear, retMonth] = mes.split('-').map(Number);
    const lastDay = new Date(retYear, retMonth, 0).getDate();

    return {
        mes,
        periodoDesde: detectedPeriod?.desde || `${mes}-01`,
        periodoHasta: detectedPeriod?.hasta || `${mes}-${String(lastDay).padStart(2, '0')}`,
        periodoDetectado: Boolean(detectedPeriod),
        filas,
        sinMatch,
        totalRegistros,
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
        const isCsv = file.name.endsWith('.csv');
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
    onlyMatched = true
): Promise<ActionResult<ImportResult>> {
    try {
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
                const estado = requiereRevision ? 'observado' : 'pending';
                const motivoObservado = requiereRevision ? (reg.motivoObservado || 'Otro') : null;

                let observaciones = requiereRevision
                    ? `Registro observado por control automático (${motivoObservado}) — Local ${preview.mes}`
                    : `Importado desde archivo local (${preview.mes})`;

                if (reg.observaciones) {
                    observaciones += ` | ${reg.observaciones}`;
                }

                const { data: existing } = await admin
                    .from('registro_horas')
                    .select('id, horas')
                    .eq('personal_id', fila.personalId)
                    .eq('fecha', reg.fecha)
                    .maybeSingle();

                if (existing) {
                    if (Number(existing.horas) > 0 && !requiereRevision) {
                        skipped++;
                        continue;
                    }
                    const { error } = await admin
                        .from('registro_horas')
                        .update({
                            horas: reg.horas,
                            hora_ingreso: reg.entrada,
                            hora_egreso: reg.salida,
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
