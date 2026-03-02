import Papa from 'papaparse';
import { createAdminClient } from '@/utils/supabase/admin';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CsvMapping {
    title?: string;
    startTime: string;
    endTime?: string;
    patientName?: string;
    patientEmail?: string;
    patientPhone?: string;
    notes?: string;
}

export interface CorrelationResult {
    patientId: string | null;
    confidence: number;
    reasons: string[];
}

export interface ParseResult {
    success: boolean;
    data: any[];
    errors: any[];
    meta: any;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parses a raw CSV string into an array of objects.
 */
export function parseCsv(csvString: string): ParseResult {
    const result = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
    });

    return {
        success: result.errors.length === 0,
        data: result.data,
        errors: result.errors,
        meta: result.meta,
    };
}

// ─── Identity Correlation Engine ──────────────────────────────────────────────

/**
 * Normalizes a phone number for comparison (strips non-digits)
 */
function normalizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10); // get last 10 digits for loose matching
}

/**
 * Compares two strings using a basic fuzzy logic
 */
function fuzzyMatch(str1: string, str2: string): boolean {
    if (!str1 || !str2) return false;
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    // Simple subset matching
    return s1.includes(s2) || s2.includes(s1);
}

/**
 * The Brain of the import. Matches a CSV row (mapped to standard fields)
 * to an existing patient in the database.
 */
export async function correlatePatient(
    mappedRow: Record<string, any>,
    mapping: CsvMapping
): Promise<CorrelationResult> {
    const supabase = createAdminClient();
    let bestMatch: CorrelationResult = { patientId: null, confidence: 0, reasons: [] };

    const email = mappedRow[mapping.patientEmail || '']?.toString().toLowerCase().trim();
    const phone = normalizePhone(mappedRow[mapping.patientPhone || '']);
    const name = mappedRow[mapping.patientName || '']?.toString().trim();

    // We need to fetch potential candidates. 
    // To avoid fetching the whole DB, we query by exact email or phone first.
    let candidates: any[] = [];

    const queries = [];
    if (email) {
        queries.push(supabase.from('pacientes').select('id_paciente, email, telefono, nombre, apellido').ilike('email', email).eq('is_deleted', false));
    }
    if (phone && phone.length >= 8) {
        queries.push(supabase.from('pacientes').select('id_paciente, email, telefono, nombre, apellido').ilike('telefono', `%${phone}%`).eq('is_deleted', false));
    }

    // If we have an exact email or phone match
    if (queries.length > 0) {
        const results = await Promise.all(queries);
        for (const res of results) {
            if (res.data) candidates.push(...res.data);
        }
    }

    // If no candidates from strictly identifying info, try a fuzzy name search
    if (candidates.length === 0 && name) {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            const { data } = await supabase
                .from('pacientes')
                .select('id_paciente, email, telefono, nombre, apellido')
                .ilike('nombre', `%${parts[0]}%`)
                .ilike('apellido', `%${parts[parts.length - 1]}%`)
                .eq('is_deleted', false);
            if (data) candidates.push(...data);
        } else {
            // Just one name provided
            const { data } = await supabase
                .from('pacientes')
                .select('id_paciente, email, telefono, nombre, apellido')
                .ilike('nombre', `%${name}%`)
                .eq('is_deleted', false);
            if (data) candidates.push(...data);
        }
    }

    // Deduplicate candidates
    const uniqueCandidates = Array.from(new Map(candidates.map(item => [item.id_paciente, item])).values());

    // Evaluate each candidate to find the highest confidence
    for (const candidate of uniqueCandidates) {
        let score = 0;
        const reasons: string[] = [];

        // 1. Email Match (Highest Weight)
        if (email && candidate.email && candidate.email.toLowerCase() === email) {
            score += 80;
            reasons.push('exact_email_match');
        }

        // 2. Phone Match (High Weight)
        const candPhone = normalizePhone(candidate.telefono);
        if (phone && candPhone && (phone.includes(candPhone) || candPhone.includes(phone))) {
            score += 70;
            reasons.push('phone_match');
        }

        // 3. Name Match
        if (name) {
            const candFullName = `${candidate.nombre} ${candidate.apellido}`;
            if (candFullName.toLowerCase() === name.toLowerCase()) {
                score += 40;
                reasons.push('exact_name_match');
            } else if (fuzzyMatch(candFullName, name)) {
                score += 20;
                reasons.push('fuzzy_name_match');
            }
        }

        // Cap at 100
        if (score > 100) score = 100;

        if (score > bestMatch.confidence) {
            bestMatch = {
                patientId: candidate.id_paciente,
                confidence: score,
                reasons,
            };
        }
    }

    return bestMatch;
}

// ─── Import Job Processing ────────────────────────────────────────────────────

/**
 * Initializes a new import job and populates the agenda_import_rows table.
 */
export async function initializeImportJob(
    jobId: string,
    rows: any[],
    mapping: CsvMapping
) {
    const supabase = createAdminClient();

    // We process in batches to avoid overwhelming the DB/Functions
    const batchSize = 50;
    let processed = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        // Process correlation in parallel for the batch
        const importRows = await Promise.all(
            batch.map(async (row) => {
                const correlation = await correlatePatient(row, mapping);
                let status = 'pending';

                // Auto-match if confidence is very high
                if (correlation.confidence >= 80) {
                    status = 'matched';
                }

                return {
                    job_id: jobId,
                    raw_data: row,
                    status,
                    suggested_patient_id: correlation.patientId,
                    match_confidence: correlation.confidence,
                    match_reasons: correlation.reasons,
                };
            })
        );

        const { error } = await supabase.from('agenda_import_rows').insert(importRows);
        if (error) {
            console.error('[CSV Import] Failed to insert row batch:', error);
            throw new Error(`Batch insert failed: ${error.message}`);
        }

        processed += batch.length;

        // Update tracking
        await supabase
            .from('agenda_import_jobs')
            .update({ total_rows: rows.length, status: 'mapped' })
            .eq('id', jobId);
    }

    return true;
}
