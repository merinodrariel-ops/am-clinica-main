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
        const whiteningPrompt = level === 1 ? 'a very subtle, natural brightening, just enough to look healthy and clean'
            : level <= 3 ? 'a natural whitening, similar to the effect of professional cleaning and polishing'
                : level <= 5 ? 'a noticeable cosmetic whitening, like using whitening strips for a few weeks'
                    : level <= 7 ? 'a bright, professional cosmetic whitening treatment look'
                        : level <= 9 ? 'a very bright, brilliant "Hollywood" style white'
                            : 'an extremely bright, dazzling white, the maximum level of cosmetic whitening';

        const prompt = `Enhance the smile in this photo to a high-resolution, photorealistic quality. Make the teeth perfectly aligned and apply ${whiteningPrompt}. Maintain all other facial features and the original background without any pixelation or compression artifacts.`;

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

        if (!imagePart?.inlineData?.data) {
            const textPart = parts.find((p) => p.text);
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
