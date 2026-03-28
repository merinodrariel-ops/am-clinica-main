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
  "leftEye": { "x": number, "y": number },
  "rightEye": { "x": number, "y": number },
  "smileLineY": number
}
Where:
- leftEye is the center of the pupil on the LEFT side of the photo (viewer's left)
- rightEye is the center of the pupil on the RIGHT side of the photo (viewer's right)
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
            leftEye?: { x: number; y: number };
            rightEye?: { x: number; y: number };
            leftPupil?: { x: number; y: number };
            rightPupil?: { x: number; y: number };
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

        const leftRaw = parsed.leftEye || parsed.leftPupil;
        const rightRaw = parsed.rightEye || parsed.rightPupil;

        let leftPupil = leftRaw ? {
            x: norm ? leftRaw.x / w! : leftRaw.x,
            y: norm ? leftRaw.y / h! : leftRaw.y,
        } : null;

        let rightPupil = rightRaw ? {
            x: norm ? rightRaw.x / w! : rightRaw.x,
            y: norm ? rightRaw.y / h! : rightRaw.y,
        } : null;

        // CRITICAL BUGFIX: Ensure left is ACTUALLY mathematically left (lower X coordinate)
        // If the AI swapped them (e.g. from the patient's perspective), we swap them back before calculating rotation!
        if (leftPupil && rightPupil && leftPupil.x > rightPupil.x) {
            const temp = leftPupil;
            leftPupil = rightPupil;
            rightPupil = temp;
        }

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
