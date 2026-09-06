'use server';

import { createClient } from '@/utils/supabase/server';
import { GoogleGenAI } from '@google/genai';
import * as xlsx from 'xlsx';
import { aiScheduleJsonSchema, parseAiSchedule } from '@/lib/ai-schedule';
import { getAiModel } from '@/lib/ai-models';

function getGeminiAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY no configurada');
    }
    return new GoogleGenAI({ apiKey });
}

export async function processHorariosFile(formData: FormData) {
    try {
        const file = formData.get('file');
        const prompt = formData.get('prompt');

        if (!(file instanceof File) || file.size === 0) throw new Error('Seleccioná una planilla válida.');
        if (file.size > 10 * 1024 * 1024) throw new Error('La planilla supera el límite de 10 MB.');
        if (typeof prompt !== 'string' || prompt.length > 10000) throw new Error('Las instrucciones no son válidas.');

        // 1. Read the file
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error('La planilla no contiene hojas.');
        const csvContent = xlsx.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);

        // 2. Get current active personal from DB to map names accurately
        const supabase = await createClient();
        const { data: personalList, error: personalError } = await supabase
            .from('personal')
            .select('id, nombre, apellido')
            .eq('activo', true);

        if (personalError) throw new Error("Error fetching personal");

        if (!personalList?.length) throw new Error('No hay personal activo disponible para importar.');
        const contextPersonal = personalList.map(p => `ID: ${p.id} | Name: ${p.nombre} ${p.apellido || ''}`).join('\n');

        // 3. Prepare AI Prompt
        const fullPrompt = `
Eres un asistente experto en procesar planillas de horarios exportadas (ej: software PROsoft u otros).
Tienes que analizar el CSV adjunto y devolver un JSON estructurado con los registros listos para insertar en la base de datos de la clínica.

El usuario proporcionó las siguientes instrucciones específicas (SÍGUELAS Fielmente):
"${prompt}"

Para mappear nombres de persona en el CSV al "personal_id" correcto, utiliza ÚNICAMENTE esta lista de personal activo en nuestra base de datos:
${contextPersonal}
(Si un nombre del CSV no calza perfecto con ninguno, aplica fuzzy matching o deducción lógica. Si no se encuentra, omite ese registro pero coméntalo en el mensaje final).

El CSV de entrada (puede tener filas de encabezado basura, ignóralas si es necesario):
${csvContent}

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido (sin marcas de markdown de código) que cumpla con esta estructura exacta:
{
  "registros": [
    {
      "personal_id": "uuid encontrado en el mapeo",
      "fecha": "YYYY-MM-DD",
      "hora_ingreso": "HH:mm" o null,
      "hora_egreso": "HH:mm" o null,
      "estado": "pending" o "observado" (si falta entrada o salida u ocurre alguna anomalía)
    }
  ],
  "mensaje_al_usuario": "Un mensaje claro y amable dirigido al usuario, informando si faltaron datos (ej. faltaron salidas), u omitiste gente o cualquier otra anomalía según lo que te pidió en sus instrucciones."
}
`;

        // 4. Call Gemini
        const ai = getGeminiAI();
        const result = await ai.models.generateContent({
            model: getAiModel('scheduleImport'),
            contents: fullPrompt,
            config: { responseMimeType: 'application/json', responseJsonSchema: aiScheduleJsonSchema },
        });

        const parsedData = parseAiSchedule(result.text || '', personalList.map(person => person.id));
        const validRecords = parsedData.registros;

        let insertedCount = 0;

        if (validRecords.length > 0) {
            // Check for duplicates before inserting or just upsert?
            // Since there's no unique constraint on personal_id + fecha + hora_ingreso in standard tables, 
            // we will just insert. The user can review them later.
            const { error: insertError } = await supabase
                .from('registro_horas')
                .insert(validRecords);

            if (insertError) {
                console.error("Insert Error", insertError);
                throw new Error("Error al guardar en base de datos: " + insertError.message);
            }
            insertedCount = validRecords.length;
        }

        return {
            success: true,
            insertedCount,
            message: parsedData.mensaje_al_usuario || "Proceso completado."
        };

    } catch (err: unknown) {
        console.error("Error processHorariosFile: import failed");
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}
