'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { uploadFileToFolder } from '@/lib/google-drive';

export interface SaveSmileDesignParams {
  patientId: string;
  folderId?: string;      // Google Drive folder ID
  beforeDataUrl: string;  // data:image/...;base64,...
  afterBase64: string;    // base64 only (no prefix)
  afterMime: string;
  comparisonBase64?: string; // base64 only (optional side-by-side)
  settings: {
    level: string;
    edges: boolean;
    edgesIntensity: string;
    texture: boolean;
    textureIntensity: string;
    shape: number;
  };
  customFilename?: string; // e.g. "DiseñoSonrisa_Juan_Perez_2024-03-28"
}

export interface SaveSmileDesignResult {
  success: boolean;
  error?: string;
  afterUrl?: string;
  driveFileId?: string;
}

export async function saveSmileDesignResult(
  params: SaveSmileDesignParams
): Promise<SaveSmileDesignResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const adminClient = createAdminClient();
    const now = new Date();
    const ts = now.getTime();
    // Formato YYYY-MM-DD_HH-MM-SS
    const timeStr = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('-').slice(0, 5).join('-');
    
    const dateStr = now.toISOString().split('T')[0];

    // Upload after image
    const afterBytes = Buffer.from(params.afterBase64, 'base64');
    const ext = params.afterMime.includes('png') ? 'png' : 'jpg';
    
    // Use a unique name to avoid overwriting files if the user saves multiple times
    const baseName = params.customFilename
      ? `${params.customFilename}_${ts}`
      : `smile_design_${params.patientId}_${timeStr}`;

    const afterPath = `portal/${params.patientId}/${baseName}_Resultado.${ext}`;

    console.log(`[saveSmileDesignResult] Saving RESULTADO to ${afterPath}`);

    const afterUpload = await adminClient.storage
      .from('patient-portal-files')
      .upload(afterPath, afterBytes, { contentType: params.afterMime, upsert: false });

    if (afterUpload.error) {
      console.error('[saveSmileDesignResult] Error uploading RESULTADO:', afterUpload.error);
      return { success: false, error: `Error subiendo resultado: ${afterUpload.error.message}` };
    }

    const { data: { publicUrl: afterUrl } } = adminClient.storage
      .from('patient-portal-files')
      .getPublicUrl(afterPath);

    // Upload before image
    const beforeBase64 = params.beforeDataUrl.includes(',')
      ? params.beforeDataUrl.split(',')[1]
      : params.beforeDataUrl;
    const beforeBytes = Buffer.from(beforeBase64, 'base64');
    const beforePath = `portal/${params.patientId}/${baseName}_Antes.jpg`;

    console.log(`[saveSmileDesignResult] Saving ANTES to ${beforePath}`);

    const beforeUpload = await adminClient.storage
      .from('patient-portal-files')
      .upload(beforePath, beforeBytes, { contentType: 'image/jpeg', upsert: false });

    const beforeUrl = !beforeUpload.error
      ? adminClient.storage.from('patient-portal-files').getPublicUrl(beforePath).data.publicUrl
      : '';

    // Upload comparison image if provided
    let comparisonUrl = '';
    let comparisonBytes: Buffer | null = null;
    if (params.comparisonBase64) {
      comparisonBytes = Buffer.from(params.comparisonBase64, 'base64');
      const comparisonPath = `portal/${params.patientId}/${baseName}_Comparativa.jpg`;
      console.log(`[saveSmileDesignResult] Saving COMPARATIVA to ${comparisonPath}`);
      
      const compUpload = await adminClient.storage
        .from('patient-portal-files')
        .upload(comparisonPath, comparisonBytes, { contentType: 'image/jpeg', upsert: false });
      
      if (!compUpload.error) {
        comparisonUrl = adminClient.storage.from('patient-portal-files').getPublicUrl(comparisonPath).data.publicUrl;
      }
    }

    const cacheBuster = `?t=${ts}`;
    const label = `Smile Design ${dateStr} · ${params.settings.level}`;

    // Upload to Google Drive if folderId is provided
    let driveFileId: string | undefined;
    if (params.folderId) {
      console.log(`[saveSmileDesignResult] Uploading to Google Drive folder: ${params.folderId}`);
      
      // 1. Upload Result ("Después")
      const resultFileName = `Smile Design - Resultado - ${label}.${ext}`;
      const driveUpload = await uploadFileToFolder(
        params.folderId,
        resultFileName,
        afterBytes,
        params.afterMime
      );
      if (driveUpload.success) {
        driveFileId = driveUpload.fileId;
      }

      // 2. Upload "Antes"
      const beforeFileName = `Smile Design - Antes - ${label}.jpg`;
      await uploadFileToFolder(
        params.folderId,
        beforeFileName,
        beforeBytes,
        'image/jpeg'
      );

      // 3. Upload Comparison (Side-by-Side)
      if (comparisonBytes) {
        const compFileName = `Smile Design - COMPARATIVA - ${label}.jpg`;
        await uploadFileToFolder(
          params.folderId,
          compFileName,
          comparisonBytes,
          'image/jpeg'
        );
      }
    }

    // Save to patient_files (4 records: before, after, comparison, smile_design)
    const records = [
      {
        patient_id: params.patientId,
        file_type: 'photo_before',
        label: `${label} – Antes`,
        file_url: beforeUrl + cacheBuster,
        is_visible_to_patient: true,
      },
      {
        patient_id: params.patientId,
        file_type: 'photo_after',
        label: `${label} – Después`,
        file_url: afterUrl + cacheBuster,
        is_visible_to_patient: true,
      },
      {
        patient_id: params.patientId,
        file_type: 'smile_design',
        label, // Main simulation record
        file_url: afterUrl + cacheBuster,
        is_visible_to_patient: true,
      }
    ];

    if (comparisonUrl) {
      records.push({
        patient_id: params.patientId,
        file_type: 'photo_comparison',
        label: `${label} – Comparativa S-b-S`,
        file_url: comparisonUrl + cacheBuster,
        is_visible_to_patient: true,
      });
    }

    console.log(`[saveSmileDesignResult] Inserting ${records.length} records into patient_files`);
    const { error: insertError } = await adminClient.from('patient_files').insert(records);
    if (insertError) {
        console.error('[saveSmileDesignResult] Error inserting files:', insertError);
        return { success: false, error: `Error en base de datos: ${insertError.message}` };
    }

    return { 
      success: true, 
      afterUrl: afterUrl + cacheBuster,
      driveFileId
    };
  } catch (err) {
    console.error('[saveSmileDesignResult] UNCAUGHT ERROR:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Error inesperado' };
  }
}


export interface GetSmileShareUrlResult {
  success: boolean;
  error?: string;
  url?: string;
}

export async function getSmileShareUrl(
  patientId: string
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
