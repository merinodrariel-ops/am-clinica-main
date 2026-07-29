import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/google-drive';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { slugifyCaseTitle } from '@/lib/public-case-draft';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ALLOWED_ROLES = new Set(['owner', 'admin', 'reception', 'marketing']);
type Photo = {
    id: string;
    name: string;
    alt: string;
    caption?: string;
    altEn: string;
    captionEn?: string;
    createdTime?: string;
};
type Payload = {
    mode: 'create' | 'append'; caseId?: string; patientId: string;
    title: string; slug: string; description: string; photos: Photo[];
    translation: { title: string; description: string };
};

async function publisher() {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return null;
    const admin = createAdminClient();
    const { data } = await admin.from('personal').select('categoria').eq('user_id', user.id).maybeSingle();
    const role = String(data?.categoria || user.user_metadata?.role || '').toLowerCase();
    return ALLOWED_ROLES.has(role) ? { user, admin } : null;
}

export async function GET() {
    const actor = await publisher();
    if (!actor) return NextResponse.json({ error: 'Sin permiso para publicar casos' }, { status: 403 });
    const { data, error } = await actor.admin.from('public_clinical_cases')
        .select('id, slug, title, status, updated_at')
        .in('status', ['draft', 'published']).order('updated_at', { ascending: false });
    return error
        ? NextResponse.json({ error: error.message }, { status: 500 })
        : NextResponse.json({ cases: data || [] });
}

function config() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary no está configurado');
    return { cloudName, apiKey, apiSecret };
}

async function upload(photo: Photo, slug: string, order: number) {
    const source = await getDriveClient().files.get(
        { fileId: photo.id, alt: 'media' },
        { responseType: 'arraybuffer' }
    );
    const { cloudName, apiKey, apiSecret } = config();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `casos/${slug}`;
    const publicId = `${String(order + 1).padStart(2, '0')}-${slugifyCaseTitle(photo.name) || 'foto'}`;
    const safeAlt = photo.alt.replace(/[|=]/g, ' ');
    const safeCaption = (photo.caption || photo.alt).replace(/[|=]/g, ' ');
    const context = `alt=${safeAlt}|caption=${safeCaption}|case_slug=${slug}|clinic=AM Estetica Dental`;
    const tags = 'casos,am-estetica-dental';
    const signature = createHash('sha1').update(
        `context=${context}&folder=${folder}&overwrite=true&public_id=${publicId}&tags=${tags}&timestamp=${timestamp}${apiSecret}`
    ).digest('hex');
    const form = new FormData();
    form.set('file', new Blob([source.data as ArrayBuffer], { type: String(source.headers['content-type'] || 'image/jpeg') }), photo.name);
    Object.entries({ api_key: apiKey, timestamp: String(timestamp), signature, folder, public_id: publicId, overwrite: 'true', tags, context })
        .forEach(([key, value]) => form.set(key, value));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
    const result = await response.json() as { public_id?: string; url?: string; secure_url?: string; error?: { message?: string } };
    if (!response.ok || !result.public_id || !result.secure_url) throw new Error(result.error?.message || `Cloudinary respondió ${response.status}`);
    const verified = await fetch(result.secure_url, { method: 'HEAD' });
    if (!verified.ok) throw new Error(`La imagen subida no pudo verificarse (${verified.status})`);
    return result as { public_id: string; url?: string; secure_url: string };
}

export async function POST(request: NextRequest) {
    const actor = await publisher();
    if (!actor) return NextResponse.json({ error: 'Sin permiso para publicar casos' }, { status: 403 });
    const body = await request.json().catch(() => null) as Payload | null;
    if (
        !body?.patientId
        || !body.title?.trim()
        || !body.description?.trim()
        || !body.translation?.title?.trim()
        || !body.translation?.description?.trim()
        || !body.photos?.length
        || body.photos.some(photo => !photo.altEn?.trim())
    ) {
        return NextResponse.json({ error: 'Faltan título, descripción, traducción al inglés o fotos' }, { status: 400 });
    }
    const admin = actor.admin;
    let caseId = body.caseId;
    let slug = slugifyCaseTitle(body.slug || body.title);
    if (!slug) return NextResponse.json({ error: 'La URL elegida no es válida' }, { status: 400 });

    if (body.mode === 'append') {
        if (!caseId) return NextResponse.json({ error: 'Elegí un caso existente' }, { status: 400 });
        const { data } = await admin.from('public_clinical_cases').select('id, slug').eq('id', caseId).single();
        if (!data) return NextResponse.json({ error: 'No se encontró el caso' }, { status: 404 });
        slug = data.slug;
    } else {
        const { data, error } = await admin.from('public_clinical_cases').insert({
            source: 'app', patient_id: body.patientId, slug, status: 'draft',
            title: body.title.trim(), description: body.description.trim(),
            categories: ['Caso clínico'], copy: body.description.trim(),
            translations: {
                en: {
                    title: body.translation.title.trim(),
                    subtitle: body.translation.description.trim(),
                    description: body.translation.description.trim(),
                    copy: body.translation.description.trim(),
                    categories: ['Clinical case'],
                    duration: 'Clinical case',
                },
            },
            doctor_name: 'Dr. Ariel Merino', created_by: actor.user.id, updated_by: actor.user.id,
        }).select('id').single();
        if (error || !data) return NextResponse.json(
            { error: error?.code === '23505' ? 'Esa URL ya existe; elegí otra' : error?.message || 'No se pudo crear el caso' },
            { status: 409 }
        );
        caseId = data.id;
    }

    const { data: assets } = await admin.from('public_clinical_case_assets')
        .select('source_drive_file_id, sort_order').eq('case_id', caseId!);
    const known = new Set((assets || []).map((row: { source_drive_file_id: string | null }) => row.source_drive_file_id).filter(Boolean));
    const pending = body.photos.filter(photo => !known.has(photo.id));
    let order = Math.max(-1, ...(assets || []).map((row: { sort_order: number | null }) => row.sort_order ?? -1)) + 1;
    try {
        for (const photo of pending) {
            const result = await upload(photo, slug, order);
            const { error } = await admin.from('public_clinical_case_assets').insert({
                case_id: caseId, source_drive_file_id: photo.id, source_drive_name: photo.name,
                source_drive_created_time: photo.createdTime || null, asset_type: 'image',
                role: order === 0 ? 'cover' : 'other', cloudinary_public_id: result.public_id,
                cloudinary_url: result.url, cloudinary_secure_url: result.secure_url,
                public_url: result.secure_url, alt: photo.alt, caption: photo.caption || photo.alt,
                metadata: { source: 'drive', clinic: 'AM Estética Dental' },
                translations: {
                    en: {
                        alt: photo.altEn.trim(),
                        caption: (photo.captionEn || photo.altEn).trim(),
                    },
                },
                sort_order: order,
            });
            if (error) throw error;
            order += 1;
        }
        const { error } = await admin.from('public_clinical_cases').update({
            status: 'published', published_at: new Date().toISOString(),
            published_by: actor.user.id, updated_by: actor.user.id, updated_at: new Date().toISOString(),
        }).eq('id', caseId!);
        if (error) throw error;
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Falló la publicación' }, { status: 500 });
    }
    return NextResponse.json({
        caseId, slug, uploaded: pending.length, skippedDuplicates: body.photos.length - pending.length,
        publicUrl: 'https://www.amesteticadental.com/casos-antes-y-despues',
        englishUrl: 'https://www.amesteticadental.com/en/before-after',
        detailUrl: `https://www.amesteticadental.com/casos/${slug}`,
        englishDetailUrl: `https://www.amesteticadental.com/en/cases/${slug}`,
    });
}
