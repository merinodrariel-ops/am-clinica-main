'use server';

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Assists with a free-form question or instruction over the full contract text.
 * Returns either a modified contract text or a plain answer, depending on instruction.
 */
export async function assistFullContractAction(
    fullText: string,
    instruction: string
): Promise<{ reply?: string; error?: string }> {
    try {
        const prompt = `Sos un abogado laboral argentino especializado en contratos de locación de servicios para clínicas odontológicas.
Tenés el texto completo de un contrato. El usuario tiene una consulta o instrucción sobre ese contrato.

Reglas de estilo:
- No uses palabras como "prohibido", "prohíbe", "renuncia", "renunciando", "restringir" ni lenguaje punitivo directo.
- Preferí frases como "las partes acuerdan", "EL/LA LOCADOR/A se compromete a", "no forma parte del presente acuerdo".
- Tono formal pero no agresivo.

Si la instrucción pide modificar algo (ej: "cambiá la cláusula de rescisión", "reescribí la parte de honorarios"):
→ Devolvé el texto COMPLETO del contrato con la modificación aplicada, sin explicaciones adicionales.

Si la instrucción es una pregunta (ej: "¿está bien redactada la cláusula de no competencia?", "¿falta algo?"):
→ Respondé de forma concisa y clara. No reproduzcas el texto del contrato completo.

INSTRUCCIÓN: ${instruction}

TEXTO DEL CONTRATO:
${fullText.slice(0, 8000)}`;

        const result = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
        });

        const reply = result.text?.trim();
        if (!reply) return { error: 'La IA no devolvió una respuesta.' };
        return { reply };
    } catch (err) {
        console.error('[assistFullContractAction]', err);
        return { error: err instanceof Error ? err.message : 'Error al conectar con la IA' };
    }
}

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
