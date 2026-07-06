'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import {
    buildJobApplicationStoragePath,
    findRecentDuplicateJobApplication,
    groupJobApplicationsByCandidate,
    type GroupedJobApplication,
    hashPrivacyValue,
    isJobApplicationStatus,
    isLikelyUrl,
    isValidEmail,
    JOB_APPLICATION_AREAS,
    type JobApplicationStatus,
    normalizeEmail,
    sanitizeJobApplicationFileName,
    sanitizeLongText,
    sanitizeText,
    validateJobApplicationFile,
} from '@/lib/job-applications';

const MIN_FORM_COMPLETION_MS = 4000;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_SUBMISSIONS = 3;
const DUPLICATE_SUBMISSION_WINDOW_MS = 10 * 60 * 1000;

export type JobApplicationRow = {
    id: string;
    created_at: string;
    full_name: string;
    area: string;
    other_area: string | null;
    experience: string;
    area_responsibilities: string;
    instagram_url: string;
    email: string;
    location: string;
    teamwork_answer: string;
    learning_interest: string;
    long_term_goals: string;
    team_contribution: string;
    why_choose_you: string;
    cv_storage_path: string;
    cv_original_filename: string;
    cv_mime_type: string;
    cv_size_bytes: number;
    status: JobApplicationStatus;
    review_notes: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
};

export type GroupedJobApplicationRow = GroupedJobApplication<JobApplicationRow>;

export type SubmitJobApplicationResult = {
    success?: true;
    error?: string;
};

function genericSubmitError() {
    return 'No pudimos recibir la postulación. Revisá los datos e intentá de nuevo.';
}

async function requireInternalUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('No autorizado');
    }
    return user;
}

async function getRequestHashes() {
    const headerStore = await headers();
    const forwardedFor = headerStore.get('x-forwarded-for') || '';
    const realIp = headerStore.get('x-real-ip') || '';
    const userAgent = headerStore.get('user-agent') || '';
    const ip = forwardedFor.split(',')[0]?.trim() || realIp || 'unknown';

    return {
        ipHash: hashPrivacyValue(ip),
        userAgentHash: userAgent ? hashPrivacyValue(userAgent) : null,
    };
}

function getRequiredText(formData: FormData, key: string, maxLength = 3000) {
    return sanitizeLongText(formData.get(key), maxLength);
}

function validateTextPayload(payload: {
    fullName: string;
    areas: string[];
    otherArea: string;
    experience: string;
    instagramUrl: string;
    email: string;
    location: string;
    whyChooseYou: string;
    consent: string;
}) {
    if (!payload.fullName || payload.fullName.length < 3) return 'Completá tu nombre y apellido.';
    if (!payload.areas || payload.areas.length === 0) return 'Seleccioná al menos un área.';
    for (const area of payload.areas) {
        if (!JOB_APPLICATION_AREAS.includes(area as typeof JOB_APPLICATION_AREAS[number])) {
            return 'Selección de área inválida.';
        }
    }
    if (payload.areas.includes('Otros') && !payload.otherArea) return 'Indicá el área de postulación.';
    if (!payload.experience) return 'Completá tu experiencia previa.';
    if (!payload.instagramUrl || !isLikelyUrl(payload.instagramUrl)) return 'Completá tu Instagram.';
    if (!payload.email || !isValidEmail(payload.email)) return 'Completá un email válido.';
    if (!payload.location) return 'Completá dónde vivís.';
    if (!payload.whyChooseYou) return 'Completá por qué te gustaría sumarte.';
    if (payload.consent !== 'on') return 'Aceptá el uso de tus datos para el proceso de selección.';
    return '';
}

export async function submitJobApplication(formData: FormData): Promise<SubmitJobApplicationResult> {
    const startedAt = Number(formData.get('form_started_at') || 0);
    const company = sanitizeText(formData.get('company'), 120);

    if (company) {
        return { success: true };
    }

    if (!startedAt || Date.now() - startedAt < MIN_FORM_COMPLETION_MS) {
        return { error: 'Esperá unos segundos y volvé a enviar el formulario.' };
    }

    const areas = formData.getAll('areas').map(a => sanitizeText(a, 180)).filter(Boolean);

    const payload = {
        fullName: sanitizeText(formData.get('full_name'), 180),
        areas,
        otherArea: sanitizeText(formData.get('other_area'), 180),
        experience: getRequiredText(formData, 'experience'),
        instagramUrl: sanitizeText(formData.get('instagram_url'), 240),
        email: normalizeEmail(formData.get('email')),
        location: sanitizeText(formData.get('location'), 240),
        whyChooseYou: getRequiredText(formData, 'why_choose_you'),
        consent: String(formData.get('consent') || ''),
    };

    const validationError = validateTextPayload(payload);
    if (validationError) return { error: validationError };

    const cv = formData.get('cv');
    if (!(cv instanceof File)) return { error: 'Adjuntá tu CV.' };

    const fileValidation = validateJobApplicationFile(cv);
    if (!fileValidation.ok) return { error: fileValidation.error };

    const admin = createAdminClient();
    const { ipHash, userAgentHash } = await getRequestHashes();
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { count, error: rateError } = await admin
        .from('job_applications')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', windowStart);

    if (rateError) {
        console.error('[submitJobApplication] rate limit check failed:', rateError.message);
        return { error: genericSubmitError() };
    }

    if ((count || 0) >= RATE_LIMIT_MAX_SUBMISSIONS) {
        return { error: 'Recibimos demasiados envíos recientes. Probá más tarde.' };
    }

    const duplicateWindowStart = new Date(Date.now() - DUPLICATE_SUBMISSION_WINDOW_MS).toISOString();
    const { data: recentCandidates, error: duplicateCheckError } = await admin
        .from('job_applications')
        .select('id, created_at, email, full_name, area')
        .eq('email', payload.email)
        .gte('created_at', duplicateWindowStart)
        .order('created_at', { ascending: false })
        .limit(10);

    if (duplicateCheckError) {
        console.error('[submitJobApplication] duplicate check failed:', duplicateCheckError.message);
        return { error: genericSubmitError() };
    }

    const duplicate = payload.areas.some((area) =>
        findRecentDuplicateJobApplication(
            (recentCandidates || []) as Array<{ id: string; created_at: string; email: string; full_name: string; area: string }>,
            {
                email: payload.email,
                fullName: payload.fullName,
                area: area,
            },
        )
    );

    if (duplicate) {
        return { success: true };
    }

    const applicationId = crypto.randomUUID();
    const storagePath = buildJobApplicationStoragePath(applicationId, cv.name);
    const bytes = Buffer.from(await cv.arrayBuffer());

    const { error: uploadError } = await admin.storage
        .from('job-applications')
        .upload(storagePath, bytes, {
            contentType: cv.type,
            upsert: false,
        });

    if (uploadError) {
        console.error('[submitJobApplication] upload failed:', uploadError.message);
        return { error: genericSubmitError() };
    }

    const inserts = payload.areas.map((area) => ({
        id: crypto.randomUUID(),
        full_name: payload.fullName,
        area: area,
        other_area: area === 'Otros' ? payload.otherArea : null,
        experience: payload.experience,
        area_responsibilities: '',
        instagram_url: payload.instagramUrl,
        email: payload.email,
        location: payload.location,
        teamwork_answer: '',
        learning_interest: '',
        long_term_goals: '',
        team_contribution: '',
        why_choose_you: payload.whyChooseYou,
        cv_storage_path: storagePath,
        cv_original_filename: sanitizeJobApplicationFileName(cv.name),
        cv_mime_type: cv.type,
        cv_size_bytes: cv.size,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
    }));

    const { error: insertError } = await admin
        .from('job_applications')
        .insert(inserts);

    if (insertError) {
        console.error('[submitJobApplication] insert failed:', insertError.message);
        await admin.storage.from('job-applications').remove([storagePath]);
        return { error: genericSubmitError() };
    }

    revalidatePath('/admin/postulaciones');
    return { success: true };
}

export async function listJobApplications(filters?: { status?: string; area?: string; search?: string }) {
    await requireInternalUser();
    const admin = createAdminClient();

    let query = admin
        .from('job_applications')
        .select('id, created_at, full_name, area, other_area, experience, area_responsibilities, instagram_url, email, location, teamwork_answer, learning_interest, long_term_goals, team_contribution, why_choose_you, cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes, status, review_notes, reviewed_at, reviewed_by')
        .order('created_at', { ascending: false })
        .limit(200);

    if (filters?.status && isJobApplicationStatus(filters.status)) {
        query = query.eq('status', filters.status);
    }

    if (filters?.area) {
        query = query.eq('area', filters.area);
    }

    const search = sanitizeText(filters?.search, 120);
    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[listJobApplications] failed:', error.message);
        return [];
    }

    return groupJobApplicationsByCandidate((data || []) as JobApplicationRow[]);
}

export async function updateJobApplicationReview(input: { id: string; status: JobApplicationStatus; review_notes?: string }) {
    const user = await requireInternalUser();
    if (!input.id || !isJobApplicationStatus(input.status)) {
        return { success: false, error: 'Datos inválidos.' };
    }

    const admin = createAdminClient();
    const { error } = await admin
        .from('job_applications')
        .update({
            status: input.status,
            review_notes: sanitizeLongText(input.review_notes, 2000) || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user.id,
        })
        .eq('id', input.id);

    if (error) {
        console.error('[updateJobApplicationReview] failed:', error.message);
        return { success: false, error: 'No se pudo actualizar.' };
    }

    revalidatePath('/admin/postulaciones');
    return { success: true };
}

export async function createJobApplicationCvSignedUrl(id: string) {
    await requireInternalUser();
    const admin = createAdminClient();

    const { data, error } = await admin
        .from('job_applications')
        .select('cv_storage_path')
        .eq('id', id)
        .single();

    if (error || !data?.cv_storage_path) {
        return { success: false, error: 'CV no encontrado.' };
    }

    const { data: signed, error: signedError } = await admin.storage
        .from('job-applications')
        .createSignedUrl(data.cv_storage_path, 60 * 10);

    if (signedError || !signed?.signedUrl) {
        return { success: false, error: 'No se pudo abrir el CV.' };
    }

    return { success: true, url: signed.signedUrl };
}
