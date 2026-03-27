import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const LEVEL_PROMPTS: Record<string, string> = {
    'Natural': 'Keep whitening extremely subtle — healthy clean look, no artificial brightness. Preserve the original tooth shade, just clean.',
    'Natural White': 'Apply moderate natural whitening — brighter than the original but still looks completely natural and healthy, not artificial.',
    'Natural Ultra White': 'Apply maximum whitening while maintaining a natural appearance — very bright but with realistic translucency and texture.',
};

const EDGES_PROMPTS: Record<string, string> = {
    'Sutil': 'Add very subtle incisal translucency — barely noticeable blue-white edge effect.',
    'Medio': 'Add natural incisal translucency — the typical blue-white edge seen in healthy young teeth.',
    'Marcado': 'Add prominent incisal translucency — clearly visible blue-white edge effect for dramatic aesthetic result.',
};

const TEXTURE_PROMPTS: Record<string, string> = {
    'Sutil': 'Add very subtle surface micro-texture — smooth with just a hint of natural tooth structure.',
    'Medio': 'Add natural surface micro-texture — the typical horizontal perikymata and subtle lobes of healthy teeth.',
    'Detallado': 'Add detailed realistic surface texture — prominent perikymata, lobes, and natural surface variations.',
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
            level, edges, edgesIntensity, texture, textureIntensity, shape,
            intensity, // legacy
        } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        // Resolve whitening level
        const resolvedLevel: string = level
            ?? LEGACY_LEVEL[Math.max(1, Math.min(10, Math.round(intensity ?? 5)))]
            ?? 'Natural White';

        const baseWhitening = LEVEL_PROMPTS[resolvedLevel] ?? LEVEL_PROMPTS['Natural White'];
        const edgesInstruction = edges && edgesIntensity ? EDGES_PROMPTS[edgesIntensity] ?? '' : '';
        const textureInstruction = texture && textureIntensity ? TEXTURE_PROMPTS[textureIntensity] ?? '' : '';
        const shapeInstruction = shape && Math.abs(shape) > 0.1
            ? shape < 0
                ? 'Soften tooth shapes slightly — more rounded, feminine incisal edges and gentle curves.'
                : 'Slightly square the tooth shapes — more defined incisal line angles and masculine proportions.'
            : '';

        const prompt = `You are an expert cosmetic dentist performing digital smile design. Enhance the teeth in this patient photo with the following specifications:

WHITENING: ${baseWhitening}
${edgesInstruction ? `INCISAL EDGES: ${edgesInstruction}` : ''}
${textureInstruction ? `SURFACE TEXTURE: ${textureInstruction}` : ''}
${shapeInstruction ? `TOOTH SHAPE: ${shapeInstruction}` : ''}

CRITICAL RULES:
- Only modify the teeth — preserve the face, skin, lips, gums exactly as they are
- Maintain exact facial proportions, lighting, and shadows
- Result must look like a real photograph, not CGI
- Close any diastemas (gaps between teeth) naturally
- Align teeth symmetrically while preserving the patient's natural anatomy
- Do not change the patient's smile arc or lip shape`;

        console.log(`[smile-design/enhance] level=${resolvedLevel}, edges=${edges}, texture=${texture}, shape=${shape}, imageSize=${imageBase64.length}`);

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp-image-generation',
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } }
                ]
            }],
            config: { responseModalities: ['IMAGE', 'TEXT'] }
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
        console.error('[smile-design/enhance]', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('limit: 0')) {
            return NextResponse.json({ error: 'Quota de generación de imágenes agotada. Activá la facturación en Google Cloud Console.', billing: true }, { status: 429 });
        }
        if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
            return NextResponse.json({ error: 'API Key de Gemini inválida. Verificá GEMINI_API_KEY en .env.local.' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Error al procesar la imagen. Intentá de nuevo.' }, { status: 500 });
    }
}
