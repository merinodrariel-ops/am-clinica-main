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
            ? 'a conservative clinical polishing. Maintain the original tooth anatomy exactly, only removing external stains while preserving the natural variation in tooth color and minor healthy imperfections.'
            : level <= 5
                ? 'a professional aesthetic enhancement. Improve alignment and color to a natural Vita A2/A1 shade. The teeth should look bright and healthy, but still like real human enamel with subtle textures.'
                : level <= 8
                    ? 'a premium ceramic bridge reconstruction. Perfect symmetry based on the Golden Proportion. Use a bright, healthy BL3 shade with realistic surface micro-relief and light-reflecting properties.'
                    : 'a high-end celebrity smile transformation. Pure white BLB shade, flawless alignment, but with hyper-realistic photographic detail to ensure they look real and integrated, not like a digital overlay.';

        const prompt = `
            Task: Hyper-Realistic Photographic Dental Simulation.
            
            Instruction:
            Transform ONLY the teeth area to achieve ${aestheticPrompt}.
            
            UNCOMPROMISING REALISM REQUIREMENTS:
            1. PHOTOGRAPHIC GRIT: Avoid AI-generated smoothness. Teeth MUST have micro-textures, tiny surface variations, and realistic enamel luminosity. 
            2. SALIVA & REFLECTIONS: Include realistic "wet" highlights and saliva reflections. The teeth must look moist and integrated into the mouth's environment.
            3. CRISP INTERFACES: The line where the teeth meet the lips and gums must be sharp and physically shadowed. There must be a clear shadow cast by the upper lip onto the teeth. NO blurry transitions.
            4. COLOR PHYSICS: Use a complex color depth. Teeth are not monolithic; they must vary in opacity and color from the translucent cutting edge (incisal) to the slightly warmer neck (cervical).
            5. DEPTH & VOLUME: Ensure the "Buccal Corridors" (shadows at the corners of the smile) are preserved to provide facial depth. Teeth must look 3D and set back within the mouth.
            6. ZERO RADIANCE: Teeth must NOT glow. They must react to the original photo's lighting naturally.
            
            STRICT NEGATIVE CONSTRAINTS:
            - NO "Snap-on Smile" or "Sticker" appearance.
            - NO flat white or solid-color teeth.
            - NO blurring of the gums or lips.
            - NO alteration of the patient's skin, nose, or eyes.
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
