import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { buildSmileDesignPrompt } from '@/lib/smile-design-prompt';
import {
    DEFAULT_SMILE_SETTINGS,
    type SmileIdentity,
    type SmileSettings,
    type SmileShade,
} from '@/lib/smile-design-settings';

function getAI() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured in environment variables');
    return new GoogleGenAI({ apiKey: key });
}

// Legacy intensity → level mapping
const LEGACY_LEVEL: Record<number, SmileShade> = {
    1: 'Natural', 2: 'Natural', 3: 'Natural',
    4: 'Blanco estético', 5: 'Blanco estético', 6: 'Blanco estético',
    7: 'Ultra blanco', 8: 'Ultra blanco',
    9: 'Ultra blanco', 10: 'Ultra blanco',
};

export async function POST(req: NextRequest) {
    try {
        const {
            imageBase64, mimeType,
            level, identity, edges, edgesIntensity, texture, textureIntensity, shape, centralLength,
            intensity, // legacy
        } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        // Resolve whitening level
        const legacyShadeAliases: Record<string, SmileShade> = {
            'Natural White': 'Blanco estético',
            'Natural Ultra White': 'Ultra blanco',
        };
        const allowedShades: SmileShade[] = [
            'Original mejorado',
            'Natural',
            'Blanco estético',
            'Ultra blanco',
        ];
        const requestedLevel = legacyShadeAliases[level] ?? level;
        const legacyLevel = typeof intensity === 'number'
            ? LEGACY_LEVEL[Math.max(1, Math.min(10, Math.round(intensity)))]
            : undefined;
        const resolvedLevel: SmileShade = allowedShades.includes(requestedLevel)
            ? requestedLevel
            : legacyLevel ?? DEFAULT_SMILE_SETTINGS.level;
        const allowedIdentities: SmileIdentity[] = ['Fiel', 'Equilibrado', 'Idealizado'];
        const resolvedIdentity: SmileIdentity = allowedIdentities.includes(identity)
            ? identity
            : DEFAULT_SMILE_SETTINGS.identity;

        const settings: SmileSettings = {
            ...DEFAULT_SMILE_SETTINGS,
            level: resolvedLevel,
            identity: resolvedIdentity,
            edges: typeof edges === 'boolean' ? edges : DEFAULT_SMILE_SETTINGS.edges,
            edgesIntensity: edgesIntensity ?? DEFAULT_SMILE_SETTINGS.edgesIntensity,
            texture: typeof texture === 'boolean' ? texture : DEFAULT_SMILE_SETTINGS.texture,
            textureIntensity: textureIntensity ?? DEFAULT_SMILE_SETTINGS.textureIntensity,
            shape: typeof shape === 'number' ? shape : DEFAULT_SMILE_SETTINGS.shape,
            centralLength: centralLength ?? DEFAULT_SMILE_SETTINGS.centralLength,
        };
        const prompt = buildSmileDesignPrompt(settings);


        console.log(`[smile-design/enhance] level=${resolvedLevel}, identity=${resolvedIdentity}, edges=${settings.edges}, texture=${settings.texture}, shape=${settings.shape}, payloadBytes=${imageBase64.length}`);

        const ai = getAI();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } }
                ]
            }],
            config: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: { imageSize: '1K' },
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = response.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p) => p.inlineData?.data);
        const textPart = parts.find((p) => p.text);

        console.log(`[smile-design/enhance] hasImage=${!!imagePart}, text=${textPart?.text?.slice(0, 100) ?? 'none'}`);

        if (!imagePart?.inlineData?.data) {
            return NextResponse.json({ error: 'Gemini did not return an image. Try again or use a different photo.' }, { status: 502 });
        }

        return NextResponse.json({
            imageBase64: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType || 'image/png',
        });
    } catch (err: unknown) {
        console.error('[smile-design/enhance] ERROR:', err);
        const msg = err instanceof Error ? err.message : String(err);
        const maybeStatusError = err as { status?: unknown };
        const detail = err instanceof Error && maybeStatusError.status ? ` [status=${maybeStatusError.status}]` : '';
        console.error('[smile-design/enhance] msg:', msg + detail);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('limit: 0')) {
            return NextResponse.json({ error: 'Quota de generación de imágenes agotada. Activá la facturación en Google Cloud Console.', billing: true }, { status: 429 });
        }
        if (msg.includes('GEMINI_API_KEY not configured') || msg.includes('API_KEY_INVALID') || msg.includes('401')) {
            return NextResponse.json({ error: 'API Key de Gemini no configurada o inválida. Agregá GEMINI_API_KEY en .env.local.' }, { status: 401 });
        }
        if (msg.includes('INVALID_ARGUMENT') || msg.includes('400')) {
            return NextResponse.json({ error: `Argumento inválido: ${msg}` }, { status: 400 });
        }
        // Return the raw error in dev so we can debug
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json({
            error: isDev ? `Error: ${msg}` : 'Error al procesar la imagen. Intentá de nuevo.',
            detail: isDev ? msg : undefined,
        }, { status: 500 });
    }
}
