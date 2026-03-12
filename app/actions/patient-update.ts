'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// Fields we consider "updatable" — the ones old patients may be missing
const UPDATABLE_FIELDS = [
    'documento',
    'fecha_nacimiento',
    'email',
    'whatsapp',
    'como_nos_conocio',
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
    multipleMatches?: Array<{ id_paciente: string; nombre: string; apellido: string; hint: string }>;
};

export type SearchMethod = 'dni' | 'whatsapp' | 'email' | 'auto';

// ─── Phone normalizer ──────────────────────────────────────────────
function extractCoreDigits(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 8) return digits.slice(-8);
    return digits;
}

function detectSearchType(input: string): SearchMethod {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return 'email';
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
        if (trimmed.startsWith('+') || digitsOnly.length > 10 || trimmed.startsWith('15')) return 'whatsapp';
        if (digitsOnly.length <= 8) return 'dni';
        return 'whatsapp';
    }
    if (digitsOnly.length >= 7 && digitsOnly.length <= 10) return 'dni';
    return 'dni';
}

const SELECT_FIELDS = 'id_paciente, nombre, apellido, documento, fecha_nacimiento, email, whatsapp, como_nos_conocio, referencia_origen';

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
    let results: Array<Record<string, unknown>> = [];

    if (resolvedMethod === 'email') {
        const { data } = await supabase
            .from('pacientes')
            .select(SELECT_FIELDS)
            .eq('is_deleted', false)
            .ilike('email', trimmed)
            .limit(5);
        results = data || [];
    } else if (resolvedMethod === 'whatsapp') {
        const core = extractCoreDigits(trimmed);
        if (core.length < 6) return { found: false, error: 'Ingresá al menos 6 dígitos de tu WhatsApp' };
        const { data } = await supabase
            .from('pacientes')
            .select(SELECT_FIELDS)
            .eq('is_deleted', false)
            .like('whatsapp', `%${core}%`)
            .limit(5);
        results = data || [];
        if (results.length === 0) {
            const digitsOnly = trimmed.replace(/\D/g, '');
            const { data: fallbackData } = await supabase
                .from('pacientes')
                .select(SELECT_FIELDS)
                .eq('is_deleted', false)
                .like('whatsapp', `%${digitsOnly}%`)
                .limit(5);
            results = fallbackData || [];
        }
    } else {
        const normalized = trimmed.replace(/[.\s-]/g, '');
        const { data } = await supabase
            .from('pacientes')
            .select(SELECT_FIELDS)
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
            error: `${tipMap[resolvedMethod] || 'No encontramos resultados.'} Probá con otro dato.`,
        };
    }

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

    return buildPatientResult(results[0]);
}

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
        const value = field === 'como_nos_conocio'
            ? (patient.como_nos_conocio as string | null) || (patient.referencia_origen as string | null) || null
            : (patient[field] as string | null) || null;

        existingData[field] = value;
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

export async function lookupPatientById(id: string): Promise<PatientLookupResult> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('pacientes')
        .select(SELECT_FIELDS)
        .eq('id_paciente', id)
        .eq('is_deleted', false)
        .single();

    if (error || !data) return { found: false, error: 'Paciente no encontrado' };
    return buildPatientResult(data as Record<string, unknown>);
}

export async function lookupPatientByDni(dni: string): Promise<PatientLookupResult> {
    return lookupPatient(dni, 'dni');
}

// ─── Token-based personalized lookup ──────────────────────────────
// Uses admin client because patient_portal_tokens has RLS = no public access.
export async function lookupPatientByToken(token: string): Promise<PatientLookupResult> {
    if (!token || token.length < 10) return { found: false, error: 'Token inválido' };

    const admin = getAdminClient();
    const { data: tokenRow, error: tokenError } = await admin
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, used')
        .eq('token', token)
        .single();

    if (tokenError || !tokenRow) return { found: false, error: 'Link inválido o expirado' };
    if (tokenRow.used) return { found: false, error: 'Este link ya fue utilizado' };
    if (new Date(tokenRow.expires_at) < new Date()) {
        return { found: false, error: 'Este link expiró. Pedí uno nuevo en recepción.' };
    }

    const { data: patient, error: patientError } = await admin
        .from('pacientes')
        .select(SELECT_FIELDS)
        .eq('id_paciente', tokenRow.patient_id)
        .eq('is_deleted', false)
        .single();

    if (patientError || !patient) return { found: false, error: 'Paciente no encontrado' };
    return buildPatientResult(patient as Record<string, unknown>);
}

// ─── Generate personalized update link ────────────────────────────
// Called by staff from the patient list. Returns a 7-day URL.
export async function generatePatientUpdateToken(
    patientId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { error } = await admin
        .from('patient_portal_tokens')
        .upsert(
            { patient_id: patientId, token, expires_at: expiresAt.toISOString(), used: false },
            { onConflict: 'patient_id' }
        );

    if (error) return { success: false, error: error.message };

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    const url = `${baseUrl}/actualizar-datos?t=${token}`;
    return { success: true, url };
}

// ─── Update patient data ───────────────────────────────────────────
// Uses admin client so it works from both staff and the public token form.
export async function updatePatientData(
    id_paciente: string,
    updates: Partial<Record<UpdatableField, string>>
): Promise<{ success: boolean; error?: string }> {
    if (!id_paciente) return { success: false, error: 'ID de paciente no proporcionado' };

    const cleanUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (value && value.trim()) cleanUpdates[key] = value.trim();
    }

    if (cleanUpdates.como_nos_conocio && !cleanUpdates.referencia_origen) {
        cleanUpdates.referencia_origen = cleanUpdates.como_nos_conocio;
    }

    if (Object.keys(cleanUpdates).length === 0) {
        return { success: false, error: 'No hay datos para actualizar' };
    }

    const { error } = await getAdminClient()
        .from('pacientes')
        .update(cleanUpdates)
        .eq('id_paciente', id_paciente);

    if (error) {
        console.error('Error updating patient data:', error);
        return { success: false, error: 'Error al actualizar. Intentá de nuevo.' };
    }

    return { success: true };
}
