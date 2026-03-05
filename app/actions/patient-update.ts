'use server';

import { createClient } from '@/utils/supabase/server';

// Fields we consider "updatable" — the ones old patients may be missing
const UPDATABLE_FIELDS = [
    'fecha_nacimiento',
    'ciudad',
    'zona_barrio',
    'email',
    'whatsapp',
] as const;

type UpdatableField = typeof UPDATABLE_FIELDS[number];

export type PatientLookupResult = {
    found: boolean;
    nombre?: string;
    apellido?: string;
    id_paciente?: string;
    missingFields?: UpdatableField[];
    existingData?: Partial<Record<UpdatableField, string | null>>;
    error?: string;
    // For disambiguation when multiple matches
    multipleMatches?: Array<{ id_paciente: string; nombre: string; apellido: string; hint: string }>;
};

export type SearchMethod = 'dni' | 'whatsapp' | 'email' | 'auto';

// ─── Phone normalizer ──────────────────────────────────────────────
// Extracts the last 8 core digits from any Argentine phone format.
// +54 9 11 5632-5000 → 56325000
// 011 15 5632-5000   → 56325000
// 1156325000         → 56325000
// 15-5632-5000       → 56325000
function extractCoreDigits(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    // Argentine mobile: last 8 digits are always the subscriber number
    // (area code is 2-4 digits, subscriber is always 8)
    if (digits.length >= 8) {
        return digits.slice(-8);
    }
    return digits;
}

// Detect what the user typed
function detectSearchType(input: string): SearchMethod {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return 'email';
    // If it starts with + or has mostly digits with formats like spaces/dashes
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
        // Could be phone or DNI — if longer than 10 or starts with country code, it's phone
        if (trimmed.startsWith('+') || digitsOnly.length > 10 || trimmed.startsWith('15')) {
            return 'whatsapp';
        }
        // 7-8 digits is most likely DNI, 10+ is phone
        if (digitsOnly.length <= 8) return 'dni';
        return 'whatsapp';
    }
    if (digitsOnly.length >= 7 && digitsOnly.length <= 10) return 'dni';
    return 'dni'; // fallback
}

// ─── Unified smart lookup ──────────────────────────────────────────
export async function lookupPatient(
    input: string,
    method: SearchMethod = 'auto'
): Promise<PatientLookupResult> {
    const supabase = await createClient();
    const trimmed = input.trim();
    if (!trimmed || trimmed.length < 3) {
        return { found: false, error: 'Ingresá al menos tu DNI, WhatsApp o email' };
    }

    const resolvedMethod = method === 'auto' ? detectSearchType(trimmed) : method;

    const selectFields = 'id_paciente, nombre, apellido, fecha_nacimiento, ciudad, zona_barrio, email, whatsapp, documento';

    let results: Array<Record<string, unknown>> = [];

    if (resolvedMethod === 'email') {
        const { data } = await supabase
            .from('pacientes')
            .select(selectFields)
            .eq('is_deleted', false)
            .ilike('email', trimmed)
            .limit(5);
        results = data || [];
    } else if (resolvedMethod === 'whatsapp') {
        // Extract core 8 digits and search with LIKE
        const core = extractCoreDigits(trimmed);
        if (core.length < 6) {
            return { found: false, error: 'Ingresá al menos 6 dígitos de tu WhatsApp' };
        }
        const { data } = await supabase
            .from('pacientes')
            .select(selectFields)
            .eq('is_deleted', false)
            .like('whatsapp', `%${core}%`)
            .limit(5);
        results = data || [];

        // If no results with core digits, try raw search
        if (results.length === 0) {
            const digitsOnly = trimmed.replace(/\D/g, '');
            const { data: fallbackData } = await supabase
                .from('pacientes')
                .select(selectFields)
                .eq('is_deleted', false)
                .like('whatsapp', `%${digitsOnly}%`)
                .limit(5);
            results = fallbackData || [];
        }
    } else {
        // DNI search — try normalized and raw
        const normalized = trimmed.replace(/[.\s-]/g, '');
        const { data } = await supabase
            .from('pacientes')
            .select(selectFields)
            .eq('is_deleted', false)
            .or(`documento.eq.${normalized},documento.eq.${trimmed}`)
            .limit(5);
        results = data || [];
    }

    if (results.length === 0) {
        const tipMap: Record<string, string> = {
            dni: 'No encontramos un paciente con ese DNI.',
            whatsapp: 'No encontramos un paciente con ese WhatsApp.',
            email: 'No encontramos un paciente con ese email.',
        };
        return {
            found: false,
            error: `${tipMap[resolvedMethod] || 'No encontramos resultados.'} Probá con otro dato o completá el formulario de admisión.`,
        };
    }

    // Multiple matches → disambiguation
    if (results.length > 1) {
        return {
            found: false,
            multipleMatches: results.map((p) => ({
                id_paciente: p.id_paciente as string,
                nombre: p.nombre as string,
                apellido: p.apellido as string,
                hint: buildHint(p, resolvedMethod),
            })),
        };
    }

    // Single match → return with missing fields
    const patient = results[0];
    return buildPatientResult(patient);
}

// Build a hint to help disambiguate (show partial info)
function buildHint(patient: Record<string, unknown>, method: SearchMethod): string {
    if (method === 'whatsapp' && patient.documento) {
        const doc = String(patient.documento);
        return `DNI: ***${doc.slice(-3)}`;
    }
    if (patient.whatsapp) {
        const tel = String(patient.whatsapp);
        return `Tel: ***${tel.slice(-4)}`;
    }
    if (patient.email) {
        const email = String(patient.email);
        const [local, domain] = email.split('@');
        return `${local.slice(0, 2)}***@${domain}`;
    }
    return '';
}

function buildPatientResult(patient: Record<string, unknown>): PatientLookupResult {
    const missingFields: UpdatableField[] = [];
    const existingData: Partial<Record<UpdatableField, string | null>> = {};

    for (const field of UPDATABLE_FIELDS) {
        const value = patient[field];
        existingData[field] = (value as string | null) ?? null;
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            missingFields.push(field);
        }
    }

    return {
        found: true,
        nombre: patient.nombre as string,
        apellido: patient.apellido as string,
        id_paciente: patient.id_paciente as string,
        missingFields,
        existingData,
    };
}

// Direct lookup by id (for disambiguation selection)
export async function lookupPatientById(id: string): Promise<PatientLookupResult> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, fecha_nacimiento, ciudad, zona_barrio, email, whatsapp')
        .eq('id_paciente', id)
        .eq('is_deleted', false)
        .single();

    if (error || !data) {
        return { found: false, error: 'Paciente no encontrado' };
    }

    return buildPatientResult(data as Record<string, unknown>);
}

// Keep legacy function for backwards compatibility
export async function lookupPatientByDni(dni: string): Promise<PatientLookupResult> {
    return lookupPatient(dni, 'dni');
}

export async function updatePatientData(
    id_paciente: string,
    updates: Partial<Record<UpdatableField, string>>
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    if (!id_paciente) {
        return { success: false, error: 'ID de paciente no proporcionado' };
    }

    // Clean up empty values
    const cleanUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (value && value.trim()) {
            cleanUpdates[key] = value.trim();
        }
    }

    if (Object.keys(cleanUpdates).length === 0) {
        return { success: false, error: 'No hay datos para actualizar' };
    }

    const { error } = await supabase
        .from('pacientes')
        .update(cleanUpdates)
        .eq('id_paciente', id_paciente);

    if (error) {
        console.error('Error updating patient data:', error);
        return { success: false, error: 'Error al actualizar. Intentá de nuevo.' };
    }

    return { success: true };
}
