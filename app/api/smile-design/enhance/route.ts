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
            ? 'slightly whiter, cleaner teeth. Remove visible stains and yellowing. Keep the natural shape and alignment.'
            : level <= 5
                ? 'noticeably whiter and straighter teeth. Improve alignment to be more symmetrical. Use a natural bright shade (like Vita A1).'
                : level <= 8
                    ? 'bright, perfectly aligned teeth like professional porcelain veneers. Use a very white shade (like BL3). Straighten and perfect the dental arch.'
                    : 'ultra-bright, perfectly symmetrical Hollywood-style teeth. Maximum whiteness. Flawless alignment and shape.';

        const prompt = `Edit this photograph. Replace the visible teeth in this person's smile with ${aestheticPrompt}

The new teeth must look photorealistic and match the photo's lighting and shadows. Keep the rest of the face, lips, skin, and background completely unchanged.

Quality guidelines for the teeth:
- They should look like a real photograph, not CGI or a digital overlay.
- Match the existing lighting direction and color temperature.
- Include natural enamel texture and slight surface reflections.
- The gum line should look natural and sharp.`;

        console.log(`[smile-design/enhance] Processing request: level=${level}, mimeType=${mimeType}, imageSize=${imageBase64.length} chars`);

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

        console.log(`[smile-design/enhance] Response: hasImage=${!!imagePart}, text=${textPart?.text?.slice(0, 200) ?? 'none'}, imageSizeChars=${imagePart?.inlineData?.data?.length ?? 0}`);

        if (!imagePart?.inlineData?.data) {
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
