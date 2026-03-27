import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

function getAI() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured in environment variables');
    return new GoogleGenAI({ apiKey: key });
}

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
            level, edges, edgesIntensity, texture, textureIntensity, shape, centralLength,
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
        const CENTRAL_LENGTH_PROMPTS: Record<string, string> = {
            'Cortos': 'CENTRAL INCISOR VISUAL LENGTH (shading only — no geometry): Apply subtle darkening to the incisal third of the two central incisors. This shadow gradient visually reduces their apparent length, making them appear closer in height to the lateral incisors. The change is purely a color/luminance gradient. Do NOT move, extend, or warp any tooth or tissue.',
            'Natural': '',
            'Largos': 'CENTRAL INCISOR VISUAL LENGTH (shading only — no geometry): Apply subtle brightening and highlight to the incisal third of the two central incisors. This light gradient visually emphasizes their length relative to the lateral incisors. The change is purely a color/luminance gradient. Do NOT move, extend, or warp any tooth or tissue.',
        };
        const centralLengthInstruction = centralLength && centralLength !== 'Natural'
            ? CENTRAL_LENGTH_PROMPTS[centralLength] ?? ''
            : '';

        const shapeInstruction = shape && Math.abs(shape) > 0.1
            ? shape < 0
                ? `FEMININE TOOTH SHAPE (color/shading only — no geometry): Apply a subtle shadow at the disto-incisal corner of the central incisors to visually round those corners to approximately 120–135°. The mesio-incisal corner should appear slightly more acute (~90°). Use a soft highlight on the incisal edges of the canines to suggest slight tapering. All changes are color gradients only — do NOT reposition, warp, or resize any tooth.`
                : `MASCULINE TOOTH SHAPE (color/shading only — no geometry): Apply a flat, even highlight across the incisal edges of the central incisors to make them appear squared at approximately 90° on both mesial and distal corners. Use shading to minimize the visual hierarchy between centrals and laterals, suggesting a flat incisal plane. All changes are color gradients only — do NOT reposition, warp, or resize any tooth.`
            : '';

        const prompt = `You are performing a PRECISE IN-PLACE dental retouching on this photograph. This is a photo editing task, NOT image generation — you must output the exact same photograph with ONLY the teeth modified.

DENTAL MODIFICATIONS REQUIRED:
WHITENING: ${baseWhitening}
${edgesInstruction ? `INCISAL EDGES: ${edgesInstruction}` : ''}
${textureInstruction ? `SURFACE TEXTURE: ${textureInstruction}` : ''}
${centralLengthInstruction ? centralLengthInstruction : ''}
${shapeInstruction ? `TOOTH SHAPE: ${shapeInstruction}` : ''}

THE EDITING FRAME IS THE LIPS: Imagine the patient's lips as a hard boundary. Everything OUTSIDE the lips — eyes, cheeks, nose, forehead, jaw, neck, hair, background — must be 100% pixel-identical to the input. Zero changes. Not even subtle changes.

ABSOLUTE CONSTRAINTS — ZERO TOLERANCE FOR VIOLATIONS:
1. THE LIPS ARE THE FRAME: Only pixels INSIDE the lip boundary (the teeth and visible gum) may be modified. This is the only zone.
2. NO WARPING OR REPOSITIONING: Do not move, shift, warp, distort, or reposition any tooth, gum, or surrounding tissue. Never apply geometric transforms. Only paint/color/texture changes within the teeth are allowed.
3. FACE: Eyes, nose, cheeks, forehead, ears, hair — completely unchanged. Same pixel values.
4. SKIN: All skin tones, shadows, highlights outside the lips identical to input.
5. HEAD & BODY: Head position, neck, shoulders — pixel-perfect identical to input.
6. BACKGROUND: 100% identical to input.
7. REALISM: Final image must look like a real retouched photograph — not AI-generated, not CGI.

TEETH-ONLY EDITS ALLOWED (all via color/shading — no geometry):
- Whitening/color of tooth enamel
- Incisal edge translucency (blue-gray gradient on incisal 1–2 mm)
- Surface micro-texture (horizontal perikymata, developmental lobes)
- SMILE ARC: Apply a subtle highlight to the incisal edges of the lateral incisors and canines to visually reinforce a positive smile arc — the incisal curve should appear to follow the curvature of the lower lip (corners approximately 1–1.5 mm higher visually than central incisal edges). Color/shading only.
- MIDLINE DEFINITION: If the interproximal embrasure at the dental midline appears open or unclear, apply a subtle darkening shadow at the midline contact point to visually reinforce the midline. If the dental midline appears tilted relative to horizontal, use a shadow on the elevated side of the midline contact to visually correct the tilt impression. Color only.
- LATERAL INCISOR INCISAL EDGE LEVELING: Examine both lateral incisors. If one lateral incisor's incisal edge appears diagonal (one corner higher than the other, making the edge look slanted rather than horizontal), apply a subtle shadow gradient to the elevated corner of that incisal edge to visually create a straight, horizontal appearance. The corrected lateral should match the other lateral's incisal edge orientation. Color/shading only — do not move or warp the tooth.
- SMILE CURVE SYMMETRY: Only if asymmetry is very pronounced, apply subtle highlight/shadow corrections to incisal edges to visually balance the curve. Color/shading only — never geometric.

Think of this as Photoshop retouching: you are painting over only the teeth area while everything else in the image is locked.`;


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
