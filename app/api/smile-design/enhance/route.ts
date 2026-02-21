import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Intensity descriptions (1=natural, 10=Hollywood)
const INTENSITY: Record<number, string> = {
    1: 'extremely subtle — just remove minor stains, keep completely natural',
    2: 'very natural — light cleaning, almost invisible change',
    3: 'natural — gentle whitening, like professional cleaning',
    4: 'moderate — noticeable but still natural whitening',
    5: 'medium — clear whitening, balanced and healthy looking',
    6: 'enhanced — bright white, like professional whitening treatment',
    7: 'bright — very white, cosmetic dentistry standard',
    8: 'very bright — high-end cosmetic result, near Hollywood',
    9: 'ultra bright — premium Hollywood smile level',
    10: 'maximum Hollywood — brilliant white, full cosmetic transformation',
};

export async function POST(req: NextRequest) {
    try {
        const { imageBase64, mimeType, intensity } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        const level = Math.max(1, Math.min(10, Math.round(intensity ?? 5)));
        const desc = INTENSITY[level];

        const prompt = `You are a professional dental smile design AI used in a dental clinic.

Task: Enhance ONLY the teeth/smile area in this photo.
Intensity level: ${level}/10 — ${desc}

Rules (strictly follow):
- Apply photorealistic teeth whitening and alignment matching intensity ${level}/10
- Preserve ALL facial features: skin tone, eyes, nose, hair, makeup, background
- The result must look like a real professional dental photo, not a cartoon or illustration
- Do NOT add teeth that aren't there — only enhance existing teeth
- Do NOT change head position, lighting, or any non-dental area
- Return a high-quality image of the same dimensions as the input

Output only the enhanced portrait image.`;

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

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData?.data);

        if (!imagePart?.inlineData?.data) {
            const textPart = parts.find((p: { text?: string }) => p.text);
            console.error('[smile-design/enhance] No image in response. Text:', textPart?.text);
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
            return NextResponse.json({
                error: 'Quota de generación de imágenes agotada. Activá la facturación en Google Cloud Console para usar este modelo.',
                billing: true,
            }, { status: 429 });
        }
        if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
            return NextResponse.json({ error: 'API Key de Gemini inválida. Verificá GEMINI_API_KEY en .env.local.' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Error al procesar la imagen. Intentá de nuevo.' }, { status: 500 });
    }
}
