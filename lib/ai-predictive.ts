import { z } from 'zod';

const predictiveSchema = z.object({
    forecast: z.object({
        nextMonthRevenue: z.number().nonnegative(),
        confidence: z.number().min(0).max(100),
        trend: z.enum(['up', 'down', 'stable']),
    }),
    insights: z.array(z.string().min(1).max(2000)).max(20),
    recommendations: z.array(z.string().min(1).max(2000)).max(20),
});

export const aiPredictiveJsonSchema = z.toJSONSchema(predictiveSchema);

export function parseAiPredictive(text: string) {
    let input: unknown;
    try {
        input = JSON.parse(text);
    } catch {
        throw new Error('La IA devolvió un informe inválido. Intentá nuevamente.');
    }
    const result = predictiveSchema.safeParse(input);
    if (!result.success) {
        throw new Error('La IA devolvió un informe incompleto o fuera de rango. Intentá nuevamente.');
    }
    return result.data;
}
