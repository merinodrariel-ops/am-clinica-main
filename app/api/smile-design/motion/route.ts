import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { createAdminClient } from '@/utils/supabase/admin';

export const maxDuration = 180; // Requires Vercel Pro

fal.config({ credentials: process.env.FAL_KEY });

const MOTION_PROMPT =
  'Portrait photo, person with natural gentle smile expression, ' +
  'subtle head movement, soft blinking, photorealistic, ' +
  'smooth motion, face centered, no sudden movements';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export async function POST(req: NextRequest) {
  try {
    const { beforeBase64, afterBase64, mimeType, patientId, baseName } = await req.json();

    if (!beforeBase64 || !afterBase64 || !mimeType || !patientId || !baseName) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    // Step 1: Convert base64 → Blob → upload to fal storage (parallel)
    const beforeBlob = base64ToBlob(beforeBase64, mimeType);
    const afterBlob  = base64ToBlob(afterBase64, mimeType);

    console.log('[smile-design/motion] uploading images to fal storage...');
    const [beforeFalUrl, afterFalUrl] = await Promise.all([
      fal.storage.upload(beforeBlob),
      fal.storage.upload(afterBlob),
    ]);
    console.log('[smile-design/motion] fal uploads done, submitting video jobs...');

    // Step 2: Submit both video jobs in parallel
    const [beforeResult, afterResult] = await Promise.all([
      fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
        input: { image_url: beforeFalUrl, prompt: MOTION_PROMPT, duration: '5' as const },
      }),
      fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
        input: { image_url: afterFalUrl, prompt: MOTION_PROMPT, duration: '5' as const },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const beforeFalVideoUrl = (beforeResult as any).data?.video?.url;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterFalVideoUrl  = (afterResult as any).data?.video?.url;

    if (!beforeFalVideoUrl || !afterFalVideoUrl) {
      return NextResponse.json({ error: 'El modelo no devolvió video. Intentá de nuevo.' }, { status: 502 });
    }

    console.log('[smile-design/motion] video jobs done, downloading MP4s...');

    // Step 3: Download MP4s from fal CDN and upload to Supabase Storage
    const [beforeBuffer, afterBuffer] = await Promise.all([
      fetch(beforeFalVideoUrl).then(r => r.arrayBuffer()),
      fetch(afterFalVideoUrl).then(r => r.arrayBuffer()),
    ]);

    const supabase = createAdminClient();
    const beforePath = `portal/${patientId}/${baseName}_Antes_Motion.mp4`;
    const afterPath  = `portal/${patientId}/${baseName}_Despues_Motion.mp4`;

    const [uploadBefore, uploadAfter] = await Promise.all([
      supabase.storage.from('patient-portal-files').upload(beforePath, beforeBuffer, { contentType: 'video/mp4', upsert: true }),
      supabase.storage.from('patient-portal-files').upload(afterPath,  afterBuffer,  { contentType: 'video/mp4', upsert: true }),
    ]);

    if (uploadBefore.error || uploadAfter.error) {
      console.error('[smile-design/motion] supabase upload error:', uploadBefore.error ?? uploadAfter.error);
      return NextResponse.json({ error: 'Error al guardar el video. Intentá de nuevo.' }, { status: 500 });
    }

    const beforeVideoUrl = supabase.storage.from('patient-portal-files').getPublicUrl(beforePath).data.publicUrl;
    const afterVideoUrl  = supabase.storage.from('patient-portal-files').getPublicUrl(afterPath).data.publicUrl;

    console.log(`[smile-design/motion] done — before=${beforeVideoUrl.slice(0, 60)}...`);
    return NextResponse.json({ beforeVideoUrl, afterVideoUrl });

  } catch (err: unknown) {
    console.error('[smile-design/motion] ERROR:', err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({ error: 'Cuota de video agotada. Contactar soporte.' }, { status: 429 });
    }
    if (msg.includes('content policy') || msg.includes('rejected')) {
      return NextResponse.json({ error: 'La imagen fue rechazada por el modelo. Intentá con otra foto.' }, { status: 422 });
    }
    return NextResponse.json({ error: 'Error al generar video. Intentá de nuevo.' }, { status: 500 });
  }
}
