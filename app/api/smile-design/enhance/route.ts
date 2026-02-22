import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Intensity descriptions (1=natural, 10=Hollywood)
const INTENSITY: Record<number, string> = {
    1: 'Subtle Touch-up — preserve original shapes, clean only',
    2: 'Natural Cleaning — professional polish, very subtle',
    3: 'Gentle Whitening — natural appearance, healthy look',
    4: 'Professional Whitening — noticeable but balanced',
    5: 'Balanced Aesthetic — healthy, symmetrical and bright',
    6: 'Enhanced Cosmetic — bright, standard cosmetic dentistry',
    7: 'High-End Transformation — very bright and perfectly aligned',
    8: 'Premium Hollywood — brilliant white, major impact',
    9: 'Ultra-Premium Hollywood — top-tier aesthetic result',
    10: 'Maximum Transformation — blinding white, flawless symmetry',
};

export async function POST(req: NextRequest) {
    try {
        const { imageBase64, mimeType, intensity } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        const level = Math.max(1, Math.min(10, Math.round(intensity ?? 5)));

        const aestheticPrompt = level <= 2
            ? 'an extremely subtle, natural touch-up. Maintain the original tooth shapes and textures, only correcting minor discolorations and providing a gentle, healthy polish.'
            : level <= 5
                ? 'a professional dental whitening result. Enhance tooth symmetry slightly while preserving natural enamel texture, subtle incisal translucency, and realistic anatomical variations.'
                : level <= 8
                    ? 'a premium cosmetic dentistry transformation. Create perfect alignment and a bright, healthy color. Ensure teeth have depth, realistic mamelon details, and a natural light-reflecting surface.'
                    : 'a full Hollywood-standard cosmetic reconstruction. Flawless symmetry, brilliant white shade (BL1 standard), but with high-end photorealistic detail to ensure they look real and integrated.';

        const prompt = `
            Task: Professional Dentofacial Aesthetic Simulation.
            
            Instruction:
            Transform ONLY the teeth and smile area to achieve ${aestheticPrompt}.
            
            CRITICAL REALISM REQUIREMENTS:
            1. LIGHTING & TEXTURE: Match the ambient lighting of the original photo exactly. Include realistic specular highlights and subtle reflections. Teeth must NOT look flat or like a sticker. Maintain natural enamel micro-texture.
            2. ANATOMY: Ensure realistic incisal translucency (edges of teeth should be slightly translucent). Maintain a natural and healthy gingival transition (where teeth meet gums).
            3. INTEGRATION: Teeth must look physically integrated into the mouth. Apply subtle interdental shadowing to provide depth and 3D volume.
            4. PRESERVATION: Keep all other facial features, lips, skin texture, and background COMPLETELY UNTOUCHED.
            5. QUALITY: High-resolution, photorealistic, sharp focus, no pixelation.
        `.trim();

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
