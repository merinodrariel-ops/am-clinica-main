import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

function getAI() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured in environment variables');
    return new GoogleGenAI({ apiKey: key });
}

const LEVEL_PROMPTS: Record<string, string> = {
    'Natural': 'Apply a radiant and healthy naturally white tooth shade (A1/B1). Remove all yellow or brown stains. Teeth must look clean, vibrant, and bright while maintaining standard natural tooth coloration.',
    'Natural White': 'Apply a luminous, fresh white (BL4/BL3 shade). The teeth must look aesthetically perfect and exceptionally clean, but without being aggressively white or artificial. No artifacts.',
    'Natural Ultra White': 'Apply a spectacular, ultra-bright Hollywood white (BL1/BL2 shade). Teeth must be radiantly luminous and perfectly white. Uncompromising brilliance and cleanliness.',
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
                ? `TOOTH SHAPE: More feminine morphology with rounded incisal embrasures and softer disto-incisal angles.`
                : `TOOTH SHAPE: More masculine morphology with flatter incisal edges and squarer, ~90-degree line angles.`
            : '';

        const prompt = `You are an expert PROSTHODONTIST and cosmetic dental technician performing a highly realistic digital smile design simulation on this photograph. Your goal is to vastly improve the patient's smile aesthetics following strict clinical dental rules, while maintaining absolute photographic realism.

DENTAL MODIFICATIONS REQUIRED:
1. WHITENING: ${baseWhitening}
${edgesInstruction ? `2. INCISAL EDGES: ${edgesInstruction}` : ''}
${textureInstruction ? `3. SURFACE TEXTURE: ${textureInstruction}` : ''}
${centralLengthInstruction ? `4. ${centralLengthInstruction}` : ''}
${shapeInstruction ? `5. ${shapeInstruction}` : ''}

CRITICAL CLINICAL ANATOMY RULES (YOU MUST FOLLOW THESE STRICTLY):
- CLOSE ALL GAPS: You MUST completely close ANY AND ALL diastemas, black triangles, or missing teeth spaces (especially in the lower anteriors). Never leave a hole, gap, or dark empty space between the teeth.
- GOLDEN PROPORTION: Lateral incisors MUST be visibly shorter and slightly narrower than the central incisors. Do NOT make laterals the same length as centrals.
- CANINE ALIGNMENT: Bring flared or outward-pointing canines into proper arch alignment. They must not bulge outward excessively or rest awkwardly on the lower lip. Create a smooth, aesthetic buccal corridor.
- GINGIVAL MARGINS: Ensure gingival zeniths are harmonious.
- MIDLINE CORRECTION: If the dental midline is canted or off-center relative to the face, you MUST subtly correct it.

STRICT VISUAL CONSTRAINTS (DO NOT VIOLATE):
- UPPER FACE PRESERVATION: The eyes, nose, forehead, eyes, and skin MUST remain 100% identical to the original image. Only modify the teeth and gums area.
- EXTREME DEFINITION: The teeth and gums MUST be rendered with maximum 4K sharpness and perfect micro-contrast. Every edge must be razor-sharp. NO BLURRINESS.
- CLEAN RADIANT WHITE: Use only pure, radiant white tones for the teeth. ABSOLUTELY NO GRAY, GREEN, YELLOW, OR DARK HALOS. 
- NATURAL BEAUTY: The result must look like professional cosmetic dentistry (perfect porcelain veneers). The gums must look healthy and pink.
- NO AI NOISE: The image must be flawless, high-resolution, and free of digital artifacts.

The objective is a high-end, ultra-sharp, and brilliantly white smile simulation that looks like a real 4K photograph.`;


        console.log(`[smile-design/enhance] level=${resolvedLevel}, edges=${edges}, texture=${texture}, shape=${shape}, imageSize=${imageBase64.length}`);

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
