'use server';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type CreateSmileReviewFollowupInput = {
    patientId: string;
    patientName: string;
    comparisonUrl: string;
};

export async function createSmileReviewFollowupAction(input: CreateSmileReviewFollowupInput) {
    try {
        if (!input.patientId || !input.patientName || !input.comparisonUrl) {
            return { success: false, error: 'Datos incompletos para crear seguimiento' };
        }

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3);

        const { error } = await supabase.from('todos').insert({
            title: `Seguimiento reseña Google · ${input.patientName}`,
            description: [
                `Paciente ID: ${input.patientId}`,
                `Comparador Antes/Después: ${input.comparisonUrl}`,
                'Objetivo: reconectar, agradecer y solicitar referencia en Google.',
            ].join('\n'),
            status: 'pending',
            priority: 'medium',
            created_by: null,
            created_by_name: 'Smile Studio',
            assigned_to_id: null,
            assigned_to_name: 'Recepción',
            due_date: dueDate.toISOString().slice(0, 10),
            is_pinned: false,
        });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error inesperado',
        };
    }
}
