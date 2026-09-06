import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { ADMIN_VIEW_ROLES } from '@/lib/server-role-guard';
import { getAiModel } from '@/lib/ai-models';
import { aiPredictiveJsonSchema, parseAiPredictive } from '@/lib/ai-predictive';


function getGeminiAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY no configurada');
    }
    return new GoogleGenAI({ apiKey });
}

export async function GET(_req: NextRequest) {
    try {
        const userClient = await createClient();
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        const { data: profile, error: profileError } = await userClient
            .from('profiles').select('categoria').eq('id', user.id).single();
        if (profileError || !profile?.categoria || !ADMIN_VIEW_ROLES.includes(profile.categoria)) {
            return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
        }
        const supabase = createAdminClient();
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

            if (incomeError) throw new Error('No se pudieron consultar los ingresos para el informe.');
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

            if (expenseError) throw new Error('No se pudieron consultar los egresos para el informe.');
            const expenses = expenseData?.reduce((sum: number, m: { usd_equivalente_total: unknown }) => sum + (Number(m.usd_equivalente_total) || 0), 0) || 0;

            // New Patients
            const { count: newPatients, error: patientError } = await supabase
                .from('pacientes')
                .select('*', { count: 'exact', head: true })
                .eq('is_deleted', false)
                .gte('fecha_alta', startIso)
                .lt('fecha_alta', endIso);

            if (patientError) throw new Error('No se pudieron consultar las altas para el informe.');

            monthsData.push({
                month: monthLabel,
                income: Math.round(income),
                expenses: Math.round(expenses),
                newPatients: newPatients || 0
            });
        }

        const model = getAiModel('predictivePulse');
        console.log(`[predictive-pulse] Data aggregation complete. Prompting Gemini with model ${model}...`);
        const ai = getGeminiAI();

        const prompt = `
            Eres un analista experto en gestión de clínicas dentales. Analiza los siguientes datos históricos de los últimos 4 meses (del más reciente al más antiguo):
            ${JSON.stringify(monthsData, null, 2)}

            Genera un informe predictivo siguiendo esta estructura JSON exacta:
            {
                "forecast": {
                    "nextMonthRevenue": number,
                    "confidence": number entre 0 y 100 (estimación orientativa, no certeza estadística),
                    "trend": "up" | "down" | "stable"
                },
                "insights": string[],
                "recommendations": string[]
            }
            Devuelve ÚNICAMENTE el JSON, sin markdown, sin texto extra. Idioma: Español.
        `;

        const response = await ai.models.generateContent({
            model,
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }],
            config: { responseMimeType: 'application/json', responseJsonSchema: aiPredictiveJsonSchema }
        });

        const analysis = parseAiPredictive(response.text || '');

        return NextResponse.json({
            analysis,
            history: monthsData.reverse()
        });

    } catch (error: unknown) {
        console.error('[predictive-pulse] General Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Error desconocido'
        }, { status: 500 });
    }
}
