'use server';

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Uses Gemini to suggest an improved version of a contract clause or section.
 * Returns the improved text (plain string).
 */
export async function improveContractClauseAction(
    clauseHeading: string,
    clauseBody: string,
    userInstruction?: string
): Promise<{ improved?: string; error?: string }> {
    try {
        const instruction = userInstruction?.trim()
            ? `Instrucción adicional del usuario: "${userInstruction}"`
            : '';

        const prompt = `Sos un abogado laboral argentino especializado en contratos de locación de servicios para clínicas odontológicas.
Tu tarea es mejorar o reescribir una cláusula de contrato en español argentino legal, claro y profesional.

Reglas:
- No uses palabras como "prohibido", "prohíbe", "renuncia", "renunciando", "restringir" ni lenguaje punitivo directo.
- Preferí frases como "las partes acuerdan", "EL/LA LOCADOR/A se compromete a", "no forma parte del presente acuerdo", "excede el alcance de".
- Mantené un tono formal pero no agresivo — es un contrato de trabajo independiente, no una sanción.
- No cambies el sentido jurídico de la cláusula.
- Devolvé SOLO el texto mejorado de la cláusula, sin encabezado, sin explicación, sin comillas.

Cláusula a mejorar:
ENCABEZADO: ${clauseHeading}
TEXTO: ${clauseBody}
${instruction}

Texto mejorado:`;

        const result = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
        });

        const improved = result.text?.trim();
        if (!improved) return { error: 'La IA no devolvió una respuesta.' };

        return { improved };
    } catch (err) {
        console.error('[improveContractClauseAction]', err);
        return { error: err instanceof Error ? err.message : 'Error al conectar con la IA' };
    }
}
