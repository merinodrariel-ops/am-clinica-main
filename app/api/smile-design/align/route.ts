import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
    try {
        const { imageBase64, mimeType, imageWidth, imageHeight } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        const prompt = `Analyze this dental patient portrait photo and return JSON with facial landmark coordinates (pixel positions from top-left corner 0,0):
{
  "leftPupil": { "x": number, "y": number },
  "rightPupil": { "x": number, "y": number },
  "smileLineY": number
}
Where:
- leftPupil and rightPupil are the center of each iris
- smileLineY is the Y coordinate of the horizontal line passing through the corners of the mouth (commissures)
If any landmark is not visible or not detectable, return null for that field.
Return ONLY valid JSON, no markdown.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } }
                ]
            }],
            config: { responseMimeType: 'application/json' }
        });

        const rawText = (response.candidates?.[0]?.content?.parts?.[0] as { text?: string })?.text ?? '{}';

        let parsed: {
            leftPupil: { x: number; y: number } | null;
            rightPupil: { x: number; y: number } | null;
            smileLineY: number | null;
        };
        try {
            parsed = JSON.parse(rawText);
        } catch {
            const cleaned = rawText.replace(/```json?\n?|```/g, '').trim();
            parsed = JSON.parse(cleaned);
        }

        // Normalize to 0-1 if dimensions provided
        const w = imageWidth || null;
        const h = imageHeight || null;
        const norm = w && h;

        const leftPupil = parsed.leftPupil ? {
            x: norm ? parsed.leftPupil.x / w! : parsed.leftPupil.x,
            y: norm ? parsed.leftPupil.y / h! : parsed.leftPupil.y,
        } : null;

        const rightPupil = parsed.rightPupil ? {
            x: norm ? parsed.rightPupil.x / w! : parsed.rightPupil.x,
            y: norm ? parsed.rightPupil.y / h! : parsed.rightPupil.y,
        } : null;

        const smileLineY = parsed.smileLineY != null
            ? (norm ? parsed.smileLineY / h! : parsed.smileLineY)
            : null;

        const bipupilarY = (leftPupil && rightPupil)
            ? (leftPupil.y + rightPupil.y) / 2
            : null;

        const midlineX = (leftPupil && rightPupil)
            ? (leftPupil.x + rightPupil.x) / 2
            : null;

        return NextResponse.json({
            leftPupil,
            rightPupil,
            bipupilarY,
            smileLineY,
            midlineX,
        });
    } catch (err) {
        console.error('[smile-design/align]', err);
        return NextResponse.json({
            leftPupil: null, rightPupil: null,
            bipupilarY: null, smileLineY: null, midlineX: null,
        });
    }
}
