import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
    try {
        const { imageBase64, mimeType } = await req.json();

        if (!imageBase64 || !mimeType) {
            return NextResponse.json({ error: 'imageBase64 and mimeType required' }, { status: 400 });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: 'Analyze this portrait photo and return the pixel coordinates of the center of the left and right pupils. Return ONLY a valid JSON object with this exact structure, no markdown, no extra text: {"leftPupil":{"x":number,"y":number},"rightPupil":{"x":number,"y":number}}. Coordinates are in pixels from top-left (0,0). If pupils are not clearly visible, return {"leftPupil":null,"rightPupil":null}.'
                    },
                    { inlineData: { mimeType, data: imageBase64 } }
                ]
            }],
            config: { responseMimeType: 'application/json' }
        });

        const rawText = (response.candidates?.[0]?.content?.parts?.[0] as { text?: string })?.text ?? '{}';

        let data: { leftPupil: { x: number; y: number } | null; rightPupil: { x: number; y: number } | null };
        try {
            data = JSON.parse(rawText);
        } catch {
            // Gemini sometimes wraps in markdown — strip it
            const cleaned = rawText.replace(/```json?\n?|```/g, '').trim();
            data = JSON.parse(cleaned);
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('[smile-design/align]', err);
        // Return null pupils — caller falls back to original without rotation
        return NextResponse.json({ leftPupil: null, rightPupil: null });
    }
}
