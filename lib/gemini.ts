import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

export interface ParsedImplicitHours {
    entrada: string | null;
    salida: string | null;
    horas: number;
    incompleto: boolean;
    observaciones?: string;
}

/**
 * Usa Gemini para parsear celdas de asistencia que no siguen un formato estándar.
 * Ejemplos: "adicional sab", "P", "08:00 -", "Tarde", "Noche", etc.
 */
export async function parseImplicitHours(cellContent: string): Promise<ParsedImplicitHours> {
    if (!cellContent || cellContent.trim() === "") {
        return { entrada: null, salida: null, horas: 0, incompleto: false };
    }

    const prompt = `
Contexto: Eres un asistente experto en liquidaciones de personal para una clínica. 
Tu tarea es extraer horarios de entrada, salida y total de horas trabajadas de una celda de planilla de asistencia.

Reglas:
1. Si la celda indica un horario explícito (ej: "08:00 - 17:00", "08:00 a 17:00", "@17/01/2026 08:00 → 17:00"), extráelo ignorando la fecha si está presente.
2. Si la celda tiene indicadores implícitos, usa estos valores por defecto:
   - "P" o "Presente" o "X": 8 horas (08:00 a 16:00) si no se especifica otra cosa.
   - "Sábado" o "Sab" o "Adicional Sab": 4 horas (08:00 a 12:00).
   - "Domingo" o "Dom": 8 horas (08:00 a 16:00).
   - "Tarde": 6 horas (14:00 a 20:00).
   - "Noche": 10 horas (20:00 a 06:00 del día siguiente).
3. Si el horario cruza la medianoche (ej: 20:00 a 06:00), calcula las horas correctamente (10 horas).
4. Si solo hay un horario (ej: "08:00"), marca incompleto: true.
5. Formato de salida: JSON puro con las llaves: entrada (string HH:mm o null), salida (string HH:mm o null), horas (number), incompleto (boolean), observaciones (string corto del motivo).

Celda a procesar: "${cellContent}"

Respuesta JSON:`;

    try {
        const result = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt
        });
        const text = result.text || "";

        // Limpiar posibles bloques de código markdown
        const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonStr);

        return {
            entrada: parsed.entrada || null,
            salida: parsed.salida || null,
            horas: Number(parsed.horas) || 0,
            incompleto: !!parsed.incompleto,
            observaciones: parsed.observaciones || ""
        };
    } catch (error) {
        console.error("Error calling Gemini for parsing:", error);
        // Fallback básico si falla la IA
        return { entrada: null, salida: null, horas: 0, incompleto: true, observaciones: "Error AI" };
    }
}
