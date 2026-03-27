'use server';

import { createClient } from '@/utils/supabase/server';
import { GoogleGenAI } from '@google/genai';
import * as xlsx from 'xlsx';
import { inferSalidaDiaSiguiente } from '@/lib/caja-admin/attendance-utils';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

interface AIHorarioRegistro {
    personal_id?: string;
    fecha?: string;
    hora_ingreso?: string | null;
    hora_egreso?: string | null;
    horas?: number;
    estado?: string;
}

interface AIHorarioResponse {
    registros?: AIHorarioRegistro[];
    mensaje_al_usuario?: string;
}

export async function processHorariosFile(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        const prompt = formData.get('prompt') as string;

        if (!file) throw new Error("No file provided");

        // 1. Read the file
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const csvContent = xlsx.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);

        // 2. Get current active personal from DB to map names accurately
        const supabase = await createClient();
        const { data: personalList, error: personalError } = await supabase
            .from('personal')
            .select('id, nombre, apellido, email')
            .eq('activo', true);

        if (personalError) throw new Error("Error fetching personal");

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
      "horas": número decimal (calcula Salida - Ingreso, ojo con salida después de medianoche),
      "estado": "pending" o "observado" (si falta entrada o salida u ocurre alguna anomalía)
    }
  ],
  "mensaje_al_usuario": "Un mensaje claro y amable dirigido al usuario, informando si faltaron datos (ej. faltaron salidas), u omitiste gente o cualquier otra anomalía según lo que te pidió en sus instrucciones."
}
`;

        // 4. Call Gemini
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt
        });

        const textOutput = result.text || "";
        const cleanJson = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();

        const parsedData = JSON.parse(cleanJson) as AIHorarioResponse;

        if (!parsedData.registros || !Array.isArray(parsedData.registros)) {
            throw new Error("El modelo de AI no devolvió la estructura esperada.");
        }

        // 5. Insert valid records into database
        const validRecords = parsedData.registros
            .filter((r) => r.personal_id && r.fecha)
            .map((r) => ({
                personal_id: r.personal_id,
                fecha: r.fecha,
                hora_ingreso: r.hora_ingreso,
                hora_egreso: r.hora_egreso,
                salida_dia_siguiente: inferSalidaDiaSiguiente(r.hora_ingreso, r.hora_egreso),
                horas: r.horas || 0,
                estado: r.estado === 'observado' || r.estado === 'Observado' ? 'observado' : 'pending'
            }));

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
        console.error("Error processHorariosFile:", err);
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}
