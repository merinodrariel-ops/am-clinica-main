import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

function getAI() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured in environment variables');
    return new GoogleGenAI({ apiKey: key });
}

const LEVEL_PROMPTS: Record<string, string> = {
    Natural: 'un blanqueamiento natural de limpieza profesional',
    'Natural White': 'un blanqueamiento estético moderado y realista',
    'Natural Ultra White': 'un blanqueamiento brillante de alto impacto, pero aún fotorrealista',
};

const EDGES_PROMPTS: Record<string, string> = {
    'Sutil': 'Keep a hint of incisal translucency — barely noticeable.',
    'Medio': 'Keep natural incisal translucency typical of healthy adult teeth.',
    'Marcado': 'Keep visible incisal translucency at the biting edges.',
};

const TEXTURE_PROMPTS: Record<string, string> = {
    'Sutil': 'Preserve subtle natural surface micro-texture.',
    'Medio': 'Preserve natural surface micro-texture with soft perikymata.',
    'Detallado': 'Preserve realistic surface texture with visible perikymata and subtle lobes.',
};

// Legacy intensity → level mapping
const LEGACY_LEVEL: Record<number, string> = {
    1: 'Natural', 2: 'Natural', 3: 'Natural',
    4: 'Natural White', 5: 'Natural White', 6: 'Natural White',
    7: 'Natural Ultra White', 8: 'Natural Ultra White',
    9: 'Natural Ultra White', 10: 'Natural Ultra White',
};

export async function POST(req: NextRequest) {
    try {
        const {
            imageBase64, mimeType,
            level, edges, edgesIntensity, texture, textureIntensity, shape, centralLength,
            intensity, // legacy
        } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        // Resolve whitening level
        const resolvedLevel: string = level
            ?? LEGACY_LEVEL[Math.max(1, Math.min(10, Math.round(intensity ?? 5)))]
            ?? 'Natural';

        const baseWhitening = LEVEL_PROMPTS[resolvedLevel] ?? LEVEL_PROMPTS['Natural'];
        const edgesInstruction = edges && edgesIntensity ? EDGES_PROMPTS[edgesIntensity] ?? '' : '';
        const textureInstruction = texture && textureIntensity ? TEXTURE_PROMPTS[textureIntensity] ?? '' : '';
        const CENTRAL_LENGTH_PROMPTS: Record<string, string> = {
            'Cortos': 'CENTRAL INCISOR LENGTH: Slightly shorten central incisors so they are closer in length to laterals.',
            'Natural': '',
            'Largos': 'CENTRAL INCISOR LENGTH: Slightly lengthen central incisors for a more dominant, youthful appearance.',
        };
        const centralLengthInstruction = centralLength && centralLength !== 'Natural'
            ? CENTRAL_LENGTH_PROMPTS[centralLength] ?? ''
            : '';

        const shapeInstruction = shape && Math.abs(shape) > 0.1
            ? shape < 0
                ? 'Slightly rounder incisal embrasures and softer disto-incisal angles (more feminine morphology).'
                : 'Slightly flatter incisal edges and squarer line angles (more masculine morphology).'
            : '';

        // Opt-in anatomy fixes: only include when explicitly requested by the operator.
        // Applying all of these at once forces the model to hallucinate geometries.
        const anatomyLines: string[] = [];
        if (edgesInstruction) anatomyLines.push(`- ${edgesInstruction}`);
        if (textureInstruction) anatomyLines.push(`- ${textureInstruction}`);
        if (centralLengthInstruction) anatomyLines.push(`- ${centralLengthInstruction}`);
        if (shapeInstruction) anatomyLines.push(`- ${shapeInstruction}`);

        const prompt = `Efectúa un rediseño digital completo de la sonrisa de la persona en esta foto.

INSTRUCCIONES CRÍTICAS:
1. CORRECCIÓN ORTODÓNTICA: Cierra completamente cualquier espacio o diastema entre los dientes. Los dientes deben ser perfectamente contiguos.
2. ALINEACIÓN Y FORMA: Corrige dientes torcidos o astillados. Hazlos perfectamente rectos, uniformes y simétricos.
3. EFECTO CARILLAS: Crea una sonrisa perfecta tipo "Hollywood" con forma y proporciones ideales (como carillas de porcelana de alta calidad), pero sin perder el realismo fotográfico.
4. COLOR: Aplica ${baseWhitening}.
5. PRESERVACIÓN: El resultado DEBE ser fotorrealista. Mantén todas las demás facciones, la textura de la piel, la iluminación y el fondo original exactamente como están. SOLO los dientes y la sonrisa deben ser transformados.

CALIDAD DE DETALLE:
- Evita dientes borrosos, pixelados o con bordes serruchados.
- Mantén contornos dentales limpios y textura natural del esmalte.
- No alteres labios, nariz, ojos, forma facial ni cabello.
- No agregues ni elimines dientes visibles.

${anatomyLines.length > 0 ? `AJUSTES FINOS SOLICITADOS:\n${anatomyLines.join('\n')}\n` : ''}Devuelve solo la imagen final editada.`;


        console.log(`[smile-design/enhance] level=${resolvedLevel}, edges=${edges}, texture=${texture}, shape=${shape}, payloadBytes=${imageBase64.length}`);

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
        const detail = err instanceof Error && (err as any).status ? ` [status=${(err as any).status}]` : '';
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
