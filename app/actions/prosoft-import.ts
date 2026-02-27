'use server';

import { createClient as createAdminClient } from '@supabase/supabase-js';

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
    }[];
}

export interface ProsoftPreview {
    mes: string;
    filas: ProsoftRow[];
    sinMatch: string[];         // Employee names with no personal match
    totalRegistros: number;
}

export interface ImportResult {
    inserted: number;
    skipped: number;
    errors: string[];
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

function parseTimeCell(cell: string): { entrada: string; salida: string; horas: number } | null {
    // Cell value can be "08:00 17:00" or "08:00\n17:00"
    const parts = cell.trim().split(/[\s\n]+/).filter(Boolean);
    if (parts.length < 2) return null;

    const [entrada, salida] = parts;
    const timeRe = /^\d{1,2}:\d{2}$/;
    if (!timeRe.test(entrada) || !timeRe.test(salida)) return null;

    const [eh, em] = entrada.split(':').map(Number);
    const [sh, sm] = salida.split(':').map(Number);
    const horas = (sh * 60 + sm - (eh * 60 + em)) / 60;
    if (horas <= 0 || horas > 16) return null;

    return { entrada, salida, horas: Math.round(horas * 100) / 100 };
}

// Extract spreadsheet ID and optional gid from a Google Sheets URL
function extractSheetParams(url: string): { id: string; gid: string } | null {
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return null;
    const id = idMatch[1];

    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    return { id, gid };
}

async function fetchCsv(sheetId: string, gid: string): Promise<string[][]> {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(csvUrl, { cache: 'no-store' });

    if (!res.ok) {
        throw new Error(`No se pudo acceder a la planilla (HTTP ${res.status}). Verificá que sea pública.`);
    }

    const text = await res.text();

    // Parse CSV (handles \r\n and quoted fields with commas)
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(line => {
        const cells: string[] = [];
        let cur = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                cells.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        cells.push(cur.trim());
        return cells;
    }).filter(r => r.some(c => c !== ''));
}

// ─── Parse Matrix ─────────────────────────────────────────────────────────────

function parseProsoftMatrix(rows: string[][], mes: string): {
    employeeRows: { rawName: string; timeCells: Record<number, string> }[];
    dayColumns: Record<number, number>; // colIndex → day number (1-31)
} {
    const [year, month] = mes.split('-').map(Number);

    // Find the header row: the row with the most day-number columns (1–31).
    // Search up to 20 rows to handle Prosoft layouts with multiple info rows at the top.
    let headerRowIdx = -1;
    let dayColumns: Record<number, number> = {};
    let bestDayCount = 0;

    for (let r = 0; r < Math.min(20, rows.length); r++) {
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

    // Validate days belong to the given month
    const lastDay = new Date(year, month, 0).getDate();
    const validDays = Object.fromEntries(
        Object.entries(dayColumns).filter(([, d]) => d <= lastDay)
    );

    // Employee rows: every row after the header that has a non-empty first column
    // and at least one time cell
    const employeeRows: { rawName: string; timeCells: Record<number, string> }[] = [];

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const rawName = row[0]?.trim() || '';
        if (!rawName) continue;
        // Skip totals/summary rows
        if (/total|resumen|horas|promedio/i.test(rawName)) continue;

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
    mes: string // 'YYYY-MM'
): Promise<ProsoftPreview> {
    const params = extractSheetParams(sheetUrl);
    if (!params) throw new Error('URL inválida. Pegá el link completo de Google Sheets.');

    const csvRows = await fetchCsv(params.id, params.gid);
    const { employeeRows } = parseProsoftMatrix(csvRows, mes);

    const [year, month] = mes.split('-').map(Number);

    const rawNames = employeeRows.map(r => r.rawName);
    const matchMap = await matchEmployees(rawNames);

    const sinMatch: string[] = [];
    let totalRegistros = 0;

    const filas: ProsoftRow[] = employeeRows.map(emp => {
        const match = matchMap.get(emp.rawName);
        if (!match) sinMatch.push(emp.rawName);

        const registros = Object.entries(emp.timeCells)
            .map(([dayStr, cell]) => {
                const dia = parseInt(dayStr);
                const parsed = parseTimeCell(cell);
                if (!parsed) return null;
                const fecha = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                return { dia, fecha, ...parsed };
            })
            .filter(Boolean) as ProsoftRow['registros'];

        totalRegistros += registros.length;

        return {
            rawName: emp.rawName,
            personalId: match?.id ?? null,
            personalNombre: match ? `${match.nombre} ${match.apellido || ''}`.trim() : '',
            registros,
        };
    });

    return { mes, filas, sinMatch, totalRegistros };
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importProsoftData(
    sheetUrl: string,
    mes: string,
    onlyMatched = true
): Promise<ImportResult> {
    const preview = await previewProsoftImport(sheetUrl, mes);
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
            // Check if record already exists (dedup by personal_id + fecha)
            const { data: existing } = await admin
                .from('registro_horas')
                .select('id')
                .eq('personal_id', fila.personalId)
                .eq('fecha', reg.fecha)
                .limit(1)
                .single();

            if (existing) {
                skipped++;
                continue;
            }

            const { error } = await admin.from('registro_horas').insert({
                personal_id: fila.personalId,
                fecha: reg.fecha,
                horas: reg.horas,
                hora_ingreso: reg.entrada,
                hora_egreso: reg.salida,
                estado: 'approved',
                observaciones: `Importado desde Prosoft (${mes})`,
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
