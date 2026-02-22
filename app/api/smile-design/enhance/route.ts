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
            ? 'a conservative clinical touch-up. Maintain 100% of the original anatomy. Only apply a professional prophylaxis effect (cleaning), removing extrinsic stains while preserving the natural variation in tooth color and texture.'
            : level <= 5
                ? 'a professional aesthetic enhancement. Improve alignment and color to a natural Vita A1 shade. Maintain realistic dental anatomy including developmental grooves and subtle incisal translucency.'
                : level <= 8
                    ? 'a high-end ceramic veneer simulation. Perfect the "Golden Proportion" in alignment. Use a bright, healthy BL2/BL3 shade with realistic light-reflecting surface micro-relief.'
                    : 'a premium cosmetic dentistry reconstruction. Achieve maximum brightness (BL1 shade) and flawless symmetry, but ensure every tooth has realistic internal depth, mamelon structures, and translucent edges.';

        const prompt = `
            Task: Clinical-Grade Dentofacial Aesthetic Simulation.
            
            Instruction:
            Transform ONLY the teeth and smile area to achieve ${aestheticPrompt}.
            
            CRITICAL REALISM & ANATOMICAL REQUIREMENTS:
            1. LIGHT PHYSICS: Implement Subsurface Scattering. Teeth are not opaque; light must appear to enter and diffuse within the enamel. Ensure specular highlights match the primary light source of the original photo.
            2. COLOR GRADIENT: Do NOT use a single flat color. Teeth must show a natural gradient: translucent and slightly cooler at the incisal edges, higher saturation (warmer/more yellow) toward the cervical neck (near the gums).
            3. INTERDENTAL DEPTH: Maintain clear separation between teeth. Use subtle proximal shading and preserve "dark corridors" (buccal corridors) at the corners of the mouth to provide 3D volume.
            4. GINGIVAL TRANSITION: The transition between teeth and gums must be sharp and anatomically correct. Respect the "Gingival Zenith" of each tooth. Avoid any blurring or "pasted" look at the gum line.
            5. TEXTURE: Maintain realistic enamel micro-texture (perikymata) and surface reflections. Avoid perfectly smooth surfaces that look like plastic.
            6. PRESERVATION: Every pixel outside the modified teeth/gum area—including lips, skin, philtrum, and background—must remain 100% identical to the source image.
            
            NEGATIVE CONSTRAINTS:
            - NO flat, uniform white (monochromatic) teeth.
            - NO "sticker" or "floating" appearance.
            - NO blurring of the lip-to-tooth interface.
            - NO modification of facial structure or skin texture.
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
