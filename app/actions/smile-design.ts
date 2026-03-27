'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export interface SaveSmileDesignParams {
  patientId: number;
  beforeDataUrl: string;  // data:image/...;base64,...
  afterBase64: string;    // base64 only (no prefix)
  afterMime: string;
  settings: {
    level: string;
    edges: boolean;
    edgesIntensity: string;
    texture: boolean;
    textureIntensity: string;
    shape: number;
  };
}

export interface SaveSmileDesignResult {
  success: boolean;
  error?: string;
  afterUrl?: string;
}

export async function saveSmileDesignResult(
  params: SaveSmileDesignParams
): Promise<SaveSmileDesignResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const adminClient = createAdminClient();
    const ts = Date.now();
    const dateStr = new Date().toISOString().split('T')[0];

    // Upload after image
    const afterBytes = Buffer.from(params.afterBase64, 'base64');
    const ext = params.afterMime.includes('png') ? 'png' : 'jpg';
    const afterPath = `portal/${params.patientId}/smile_design_v2_${ts}.${ext}`;

    const afterUpload = await adminClient.storage
      .from('patient-portal-files')
      .upload(afterPath, afterBytes, { contentType: params.afterMime, upsert: false });

    if (afterUpload.error) return { success: false, error: afterUpload.error.message };

    const { data: { publicUrl: afterUrl } } = adminClient.storage
      .from('patient-portal-files')
      .getPublicUrl(afterPath);

    // Upload before image
    const beforeBase64 = params.beforeDataUrl.includes(',')
      ? params.beforeDataUrl.split(',')[1]
      : params.beforeDataUrl;
    const beforeBytes = Buffer.from(beforeBase64, 'base64');
    const beforePath = `portal/${params.patientId}/smile_before_v2_${ts}.jpg`;

    const beforeUpload = await adminClient.storage
      .from('patient-portal-files')
      .upload(beforePath, beforeBytes, { contentType: 'image/jpeg', upsert: false });

    const beforeUrl = !beforeUpload.error
      ? adminClient.storage.from('patient-portal-files').getPublicUrl(beforePath).data.publicUrl
      : '';

    const cacheBuster = `?t=${ts}`;
    const label = `Smile Design ${dateStr} · ${params.settings.level}`;

    // Save to patient_files (3 records: before, after, smile_design)
    await Promise.all([
      adminClient.from('patient_files').insert({
        patient_id: params.patientId,
        file_type: 'photo_before',
        label: `${label} – Antes`,
        file_url: beforeUrl + cacheBuster,
        is_visible_to_patient: true,
      }),
      adminClient.from('patient_files').insert({
        patient_id: params.patientId,
        file_type: 'photo_after',
        label: `${label} – Después`,
        file_url: afterUrl + cacheBuster,
        is_visible_to_patient: true,
      }),
      adminClient.from('patient_files').insert({
        patient_id: params.patientId,
        file_type: 'smile_design',
        label,
        file_url: afterUrl + cacheBuster,
        is_visible_to_patient: true,
      }),
    ]);

    return { success: true, afterUrl: afterUrl + cacheBuster };
  } catch (err) {
    console.error('[saveSmileDesignResult]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Error inesperado' };
  }
}

export interface GetSmileShareUrlResult {
  success: boolean;
  error?: string;
  url?: string;
}

export async function getSmileShareUrl(
  patientId: number
): Promise<GetSmileShareUrlResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const adminClient = createAdminClient();

    const { data: existing } = await adminClient
      .from('patient_portal_tokens')
      .select('token, expires_at')
      .eq('patient_id', patientId)
      .single();

    let token: string;

    if (existing && new Date(existing.expires_at) > new Date()) {
      token = existing.token;
    } else {
      token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const { error: upsertError } = await adminClient
        .from('patient_portal_tokens')
        .upsert({ patient_id: patientId, token, expires_at: expiresAt.toISOString() }, {
          onConflict: 'patient_id',
        });

      if (upsertError) return { success: false, error: upsertError.message };
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.amclinica.com');

    return { success: true, url: `${base}/mi-clinica/${token}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error inesperado' };
  }
}
