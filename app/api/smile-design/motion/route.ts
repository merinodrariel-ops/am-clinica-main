import { GenerateVideosOperation, GoogleGenAI, VideoCompressionQuality } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { canManagePatientDrive } from '@/lib/patient-drive-access';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VIDEO_MODEL = 'veo-3.1-lite-generate-preview';
const OPERATION_RE = /^(?:models\/[a-zA-Z0-9._-]+\/)?operations\/[a-zA-Z0-9._/-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Keep the JSON request below Vercel's function payload ceiling.
const MAX_IMAGE_BASE64_CHARS = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MOTION_PROMPT = [
  'Use the supplied portrait as the exact first frame.',
  'Create one continuous vertical portrait shot with no cuts.',
  'The adult patient keeps the exact same identity, teeth, dental anatomy, smile design, skin, hair and background.',
  'Only add a very subtle natural head movement, soft blinking and gentle breathing.',
  'Keep the mouth and final designed smile clearly visible and unchanged.',
  'Photorealistic clinical-social media footage, stable camera, no dialogue, no text, no logos.',
].join(' ');

const NEGATIVE_PROMPT = [
  'changed teeth, changed smile, altered dental anatomy, face distortion, identity change,',
  'camera movement, scene cut, zoom, morphing, extra teeth, open mouth, speech, text, watermark',
].join(' ');

type StartBody = {
  afterBase64?: string;
  mimeType?: string;
  patientId?: string;
  baseName?: string;
};

type PollBody = {
  operationName?: string;
  patientId?: string;
  baseName?: string;
};

async function authorizedActor() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('categoria')
    .eq('id', user.id)
    .maybeSingle();

  if (!canManagePatientDrive(profile?.categoria || user.user_metadata?.categoria)) return null;
  return { admin };
}

function videoClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');
  return { apiKey, ai: new GoogleGenAI({ apiKey }) };
}

function safeBaseName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'smile_motion';
}

function generationError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smile-design/motion]', message);
  if (/RESOURCE_EXHAUSTED|quota|billing|paid tier/i.test(message)) {
    return NextResponse.json({ error: 'La cuenta de Google Video no tiene saldo o cuota disponible.' }, { status: 429 });
  }
  if (/safety|personGeneration|filtered|rai/i.test(message)) {
    return NextResponse.json({ error: 'Google no pudo generar el video con esta foto por sus controles de seguridad.' }, { status: 422 });
  }
  return NextResponse.json({ error: 'No se pudo generar el video con Google. Intentá nuevamente.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const actor = await authorizedActor();
  if (!actor) return NextResponse.json({ error: 'Sin permiso para generar videos de pacientes' }, { status: 403 });

  try {
    const body = await request.json().catch(() => null) as StartBody | null;
    const afterBase64 = body?.afterBase64?.trim();
    const mimeType = body?.mimeType?.toLowerCase();
    const patientId = body?.patientId?.trim();
    const baseName = body?.baseName?.trim();

    if (!afterBase64 || !mimeType || !patientId || !baseName) {
      return NextResponse.json({ error: 'Faltan datos para generar el video' }, { status: 400 });
    }
    if (!UUID_RE.test(patientId)) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      return NextResponse.json({ error: 'Formato de imagen no permitido' }, { status: 400 });
    }
    if (afterBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return NextResponse.json({ error: 'La imagen es demasiado grande para generar video' }, { status: 413 });
    }

    const { data: patient } = await actor.admin
      .from('pacientes')
      .select('id_paciente')
      .eq('id_paciente', patientId)
      .maybeSingle();
    if (!patient) return NextResponse.json({ error: 'No se encontró el paciente' }, { status: 404 });

    const { ai } = videoClient();
    const operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt: MOTION_PROMPT,
      image: { imageBytes: afterBase64, mimeType },
      config: {
        numberOfVideos: 1,
        durationSeconds: 4,
        aspectRatio: '9:16',
        resolution: '720p',
        personGeneration: 'allow_adult',
        generateAudio: false,
        negativePrompt: NEGATIVE_PROMPT,
        compressionQuality: VideoCompressionQuality.OPTIMIZED,
      },
    });

    if (!operation.name) throw new Error('Google no devolvió el identificador de la operación');
    return NextResponse.json({
      status: 'generating',
      operationName: operation.name,
      patientId,
      baseName: safeBaseName(baseName),
    }, { status: 202 });
  } catch (error) {
    return generationError(error);
  }
}

export async function PUT(request: NextRequest) {
  const actor = await authorizedActor();
  if (!actor) return NextResponse.json({ error: 'Sin permiso para generar videos de pacientes' }, { status: 403 });

  try {
    const body = await request.json().catch(() => null) as PollBody | null;
    const operationName = body?.operationName?.trim();
    const patientId = body?.patientId?.trim();
    const baseName = body?.baseName?.trim();

    if (!operationName || !OPERATION_RE.test(operationName) || !patientId || !UUID_RE.test(patientId) || !baseName) {
      return NextResponse.json({ error: 'Operación de video inválida' }, { status: 400 });
    }

    const { apiKey, ai } = videoClient();
    const pending = new GenerateVideosOperation();
    pending.name = operationName;
    const operation = await ai.operations.getVideosOperation({ operation: pending });

    if (!operation.done) {
      return NextResponse.json({ status: 'generating' }, { status: 202 });
    }
    if (operation.error) {
      throw new Error(JSON.stringify(operation.error));
    }

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      const reasons = operation.response?.raiMediaFilteredReasons?.join(' ') || 'Google no devolvió un video';
      throw new Error(reasons);
    }

    let videoBuffer: Buffer;
    if (video.videoBytes) {
      videoBuffer = Buffer.from(video.videoBytes, 'base64');
    } else if (video.uri) {
      const download = await fetch(video.uri, { headers: { 'x-goog-api-key': apiKey }, redirect: 'follow' });
      if (!download.ok) throw new Error(`Google no permitió descargar el video (${download.status})`);
      videoBuffer = Buffer.from(await download.arrayBuffer());
    } else {
      throw new Error('Google no devolvió los bytes del video');
    }

    const fileBase = safeBaseName(baseName);
    const storagePath = `portal/${patientId}/${fileBase}_Despues_Motion.mp4`;
    const upload = await actor.admin.storage
      .from('patient-portal-files')
      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true });
    if (upload.error) throw new Error(`No se pudo guardar el video: ${upload.error.message}`);

    const afterVideoUrl = actor.admin.storage
      .from('patient-portal-files')
      .getPublicUrl(storagePath).data.publicUrl;

    return NextResponse.json({ status: 'ready', afterVideoUrl });
  } catch (error) {
    return generationError(error);
  }
}
