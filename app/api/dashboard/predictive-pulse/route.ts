import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/utils/supabase/admin';

const supabase = createAdminClient();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function GET(req: NextRequest) {
    try {
        const now = new Date();
        const monthsData = [];

        console.log('[predictive-pulse] Starting data aggregation for last 4 months...');

        for (let i = 0; i < 4; i++) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const monthLabel = start.toLocaleString('es-AR', { month: 'long', year: 'numeric' });

            const startIso = start.toISOString().split('T')[0];
            const endIso = end.toISOString().split('T')[0];

            // Income - sum usd_equivalente
            const { data: incomeData, error: incomeError } = await supabase
                .from('caja_recepcion_movimientos')
                .select('usd_equivalente')
                .eq('estado', 'pagado')
                .eq('is_deleted', false)
                .gte('fecha_movimiento', startIso)
                .lt('fecha_movimiento', endIso);

            if (incomeError) console.error(`[predictive-pulse] Income fetch error for ${monthLabel}:`, incomeError);
            const income = incomeData?.reduce((sum: number, m: { usd_equivalente: unknown }) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;

            // Expenses - sum usd_equivalente_total
            const { data: expenseData, error: expenseError } = await supabase
                .from('caja_admin_movimientos')
                .select('usd_equivalente_total')
                .eq('tipo_movimiento', 'EGRESO')
                .neq('estado', 'Anulado')
                .eq('is_deleted', false)
                .gte('fecha_movimiento', startIso)
                .lt('fecha_movimiento', endIso);

            if (expenseError) console.error(`[predictive-pulse] Expense fetch error for ${monthLabel}:`, expenseError);
            const expenses = expenseData?.reduce((sum: number, m: { usd_equivalente_total: unknown }) => sum + (Number(m.usd_equivalente_total) || 0), 0) || 0;

            // New Patients
            const { count: newPatients, error: patientError } = await supabase
                .from('pacientes')
                .select('*', { count: 'exact', head: true })
                .eq('is_deleted', false)
                .gte('fecha_alta', startIso)
                .lt('fecha_alta', endIso);

            if (patientError) console.error(`[predictive-pulse] Patient fetch error for ${monthLabel}:`, patientError);

            monthsData.push({
                month: monthLabel,
                income: Math.round(income),
                expenses: Math.round(expenses),
                newPatients: newPatients || 0
            });
        }

        console.log('[predictive-pulse] Data aggregation complete. Prompting Gemini with model gemini-2.5-flash...');

        const prompt = `
            Eres un analista experto en gestión de clínicas dentales. Analiza los siguientes datos históricos de los últimos 4 meses (del más reciente al más antiguo):
            ${JSON.stringify(monthsData, null, 2)}

            Genera un informe predictivo siguiendo esta estructura JSON exacta:
            {
                "forecast": {
                    "nextMonthRevenue": number,
                    "confidence": number,
                    "trend": "up" | "down" | "stable"
                },
                "insights": string[],
                "recommendations": string[]
            }
            Devuelve ÚNICAMENTE el JSON, sin markdown, sin texto extra. Idioma: Español.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }],
            config: { responseMimeType: 'application/json' }
        });

        const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log(`[predictive-pulse] Gemini response: ${responseText.slice(0, 100)}...`);

        let analysis;
        try {
            analysis = JSON.parse(responseText.replace(/```json?\n?|```/g, '').trim());
        } catch (e) {
            console.error('[predictive-pulse] JSON parse error. Raw:', responseText);
            throw new Error('AI Response parsing failed');
        }

        return NextResponse.json({
            analysis,
            history: monthsData.reverse()
        });

    } catch (error: any) {
        console.error('[predictive-pulse] General Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error.message
        }, { status: 500 });
    }
}
