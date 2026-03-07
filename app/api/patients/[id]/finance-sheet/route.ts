import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

type CsvRow = Record<string, string>;

const DNI_HEADERS = ['dni', 'documento', 'pasaporte', 'documento de identidad', 'id paciente'];
const NAME_HEADERS = ['nombre y apellido', 'nombre completo', 'paciente', 'nombre'];
const CUOTAS_ABONADAS_HEADERS = ['cuotas abonadas', 'cuotas pagadas', 'abonadas hasta la fecha', 'pagadas hasta la fecha', 'cuotas abonadas hasta'];
const SALDO_HEADERS = ['saldo faltante de pago', 'saldo faltante', 'saldo pendiente', 'saldo restante', 'saldo'];
const TOTAL_PLAN_HEADERS = ['total del plan de financiacion', 'total del plan de financiación', 'total del plan', 'total plan', 'monto total', 'total financiacion', 'total financiación'];
const CUOTAS_TOTAL_HEADERS = ['cuotas totales', 'cantidad de cuotas', 'total cuotas', 'cuotas plan', 'cuotas pactadas'];

function normalizeText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\\/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeDigits(value: string) {
    return (value || '').replace(/\D/g, '');
}

function parseNumber(value?: string | null) {
    if (!value) return null;
    const raw = value.trim();
    if (!raw) return null;

    const cleaned = raw
        .replace(/\s/g, '')
        .replace(/[A-Za-z$€£]/g, '')
        .replace(/[^\d,.-]/g, '');

    if (!cleaned) return null;

    let normalized = cleaned;
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (hasComma) {
        normalized = normalized.replace(',', '.');
    }

    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

function parseInteger(value?: string | null) {
    const parsed = parseNumber(value);
    if (parsed === null) return null;
    return Math.round(parsed);
}

function parseCSV(text: string): CsvRow[] {
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    if (lines.length < 2) return [];

    const parseLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = parseLine(lines[0]);
    const data: CsvRow[] = [];

    for (let i = 1; i < lines.length; i += 1) {
        const values = parseLine(lines[i]);
        const entry: CsvRow = {};
        headers.forEach((header, idx) => {
            entry[header] = values[idx] || '';
        });
        data.push(entry);
    }

    return data;
}

function findValueByHeaders(row: CsvRow, patterns: string[]) {
    const entries = Object.entries(row);
    for (const [header, value] of entries) {
        const normalizedHeader = normalizeText(header);
        if (patterns.some((pattern) => normalizedHeader.includes(normalizeText(pattern)))) {
            return value;
        }
    }
    return '';
}

function buildFinanceCsvUrl() {
    const direct = process.env.GOOGLE_FINANCE_SHEET_CSV_URL || process.env.GOOGLE_FINANZAS_SHEET_CSV_URL;
    if (direct) return direct;

    const sheetId = process.env.GOOGLE_SHEET_ID;
    const gid = process.env.GOOGLE_FINANCE_SHEET_GID || process.env.GOOGLE_FINANZAS_SHEET_GID;
    if (sheetId && gid) {
        return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    }

    return null;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: 'Paciente requerido' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const admin = createAdminClient();
        const { data: patient, error: patientError } = await admin
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento')
            .eq('id_paciente', id)
            .eq('is_deleted', false)
            .single();

        if (patientError || !patient) {
            return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
        }

        const financeCsvUrl = buildFinanceCsvUrl();
        if (!financeCsvUrl) {
            return NextResponse.json(
                { error: 'Fuente de finanzas no configurada (falta GOOGLE_FINANCE_SHEET_CSV_URL o GOOGLE_FINANCE_SHEET_GID).' },
                { status: 503 },
            );
        }

        const sheetResponse = await fetch(financeCsvUrl, { cache: 'no-store' });
        if (!sheetResponse.ok) {
            return NextResponse.json({ error: 'No se pudo consultar la hoja de Finanzas.' }, { status: 502 });
        }

        const csvText = await sheetResponse.text();
        const rows = parseCSV(csvText);
        if (rows.length === 0) {
            return NextResponse.json({ error: 'La hoja de Finanzas no tiene filas.' }, { status: 404 });
        }

        const patientDni = normalizeDigits(String(patient.documento || ''));
        const patientName = normalizeText(`${patient.apellido} ${patient.nombre}`);

        let matchedRow: CsvRow | null = null;
        let matchedBy: 'dni' | 'nombre' | null = null;

        if (patientDni) {
            matchedRow = rows.find((row) => {
                const rawDni = findValueByHeaders(row, DNI_HEADERS);
                return normalizeDigits(rawDni) === patientDni;
            }) || null;
            if (matchedRow) matchedBy = 'dni';
        }

        if (!matchedRow) {
            matchedRow = rows.find((row) => {
                const rawName = findValueByHeaders(row, NAME_HEADERS);
                return normalizeText(rawName) === patientName;
            }) || null;
            if (matchedRow) matchedBy = 'nombre';
        }

        if (!matchedRow || !matchedBy) {
            return NextResponse.json({ error: 'No se encontró fila en Finanzas para este paciente.' }, { status: 404 });
        }

        const cuotasAbonadas = parseInteger(findValueByHeaders(matchedRow, CUOTAS_ABONADAS_HEADERS));
        const saldoFaltante = parseNumber(findValueByHeaders(matchedRow, SALDO_HEADERS));
        const totalPlan = parseNumber(findValueByHeaders(matchedRow, TOTAL_PLAN_HEADERS));
        const cuotasTotal = parseInteger(findValueByHeaders(matchedRow, CUOTAS_TOTAL_HEADERS));

        return NextResponse.json({
            source: 'google_sheets',
            matchedBy,
            patientId: patient.id_paciente,
            cuotasAbonadas,
            saldoFaltante,
            totalPlan,
            cuotasTotal,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error inesperado consultando finanzas.' },
            { status: 500 },
        );
    }
}
